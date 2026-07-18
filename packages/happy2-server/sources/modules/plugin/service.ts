import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import type { MutationHint } from "../chat/types.js";
import type { PubSub } from "../realtime/index.js";
import { realtimeTopics } from "../realtime/index.js";
import type { WebhookUrlPolicy } from "../integrations/ssrf.js";
import type { WebhookTransport } from "../integrations/types.js";
import { pluginInstall } from "./pluginInstall.js";
import { pluginFindBySource } from "./pluginFindBySource.js";
import { pluginGetImage } from "./pluginGetImage.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";
import { pluginInstallationGetRuntimeConfiguration } from "./pluginInstallationGetRuntimeConfiguration.js";
import { pluginInstallationListIds } from "./pluginInstallationListIds.js";
import { pluginInstallationUpdateStatus } from "./pluginInstallationUpdateStatus.js";
import { pluginRemoveMissingBuiltins } from "./pluginRemoveMissingBuiltins.js";
import type { PluginCatalog } from "./catalog.js";
import type { PluginPackageStore } from "./packageStore.js";
import type { PluginMcpRuntime } from "./runtime.js";
import type { PluginSecretProtector } from "./secrets.js";
import {
    PluginError,
    type PluginInstallationSummary,
    type PluginRuntimeConfiguration,
} from "./types.js";

const HEALTH_TIMEOUT_MS = 15_000;

/** Coordinates durable plugin installs with asynchronous container preparation, MCP health probes, restart recovery, and local connection creation. */
export class PluginService {
    private readonly activations = new Map<
        string,
        { controller: AbortController; promise: Promise<void> }
    >();
    private readonly localContainers = new Set<string>();
    private closed = false;

    constructor(
        private readonly executor: DrizzleExecutor,
        private readonly pubsub: PubSub,
        private readonly catalog: PluginCatalog,
        private readonly packages: PluginPackageStore,
        private readonly secrets: PluginSecretProtector,
        private readonly runtime: PluginMcpRuntime,
        private readonly urlPolicy: WebhookUrlPolicy,
        private readonly remoteTransport: WebhookTransport,
        private readonly onError: (error: unknown) => void,
    ) {}

    async start(): Promise<void> {
        const removed = await pluginRemoveMissingBuiltins(
            this.executor,
            this.catalog.list().map(({ source }) => source.reference),
        );
        await Promise.all([
            ...removed.plugins.map(({ pluginId }) =>
                this.packages.remove(pluginId).catch(this.onError),
            ),
            ...removed.plugins.flatMap(({ containerNames }) =>
                containerNames.map((containerName) =>
                    this.runtime.removeLocal(containerName).catch(this.onError),
                ),
            ),
        ]);
        if (removed.hint) await this.publish(removed.hint).catch(this.onError);
        for (const installationId of await pluginInstallationListIds(this.executor))
            this.activate(installationId);
    }

    async install(input: {
        actorUserId: string;
        shortName: string;
        variables: Readonly<Record<string, string>>;
        containerImageId?: string;
    }): Promise<PluginInstallationSummary> {
        await pluginAuthorizeManagement(this.executor, input.actorUserId);
        const plugin = this.catalog.get(input.shortName);
        if (!plugin) throw new PluginError("not_found", "Built-in plugin was not found");
        const installationId = createId();
        const existing = await pluginFindBySource(
            this.executor,
            plugin.source.kind,
            plugin.source.reference,
        );
        const candidateId = existing ? undefined : createId();
        const candidate = candidateId
            ? { pluginId: candidateId, ...(await this.packages.install(plugin, candidateId)) }
            : undefined;
        let result: Awaited<ReturnType<typeof pluginInstall>>;
        try {
            result = await pluginInstall(this.executor, this.secrets, {
                actorUserId: input.actorUserId,
                installationId,
                plugin,
                candidate,
                variables: input.variables,
                containerImageId: input.containerImageId,
            });
        } catch (error) {
            if (candidateId) await this.packages.remove(candidateId);
            throw error;
        }
        if (candidateId && !result.pluginCreated) await this.packages.remove(candidateId);
        await this.publish(result.hint).catch(this.onError);
        if (result.installation.status === "preparing") this.activate(installationId);
        return result.installation;
    }

    async image(
        actorUserId: string,
        pluginId: string,
    ): Promise<{ body: Buffer; contentType: string; checksumSha256: string }> {
        const image = await pluginGetImage(this.executor, actorUserId, pluginId);
        const body = await this.packages.readImage(
            image.pluginId,
            image.packageDirectory,
            image.storageKey,
            image.shortName,
            image.packageDigest,
        );
        if (
            body.byteLength !== image.size ||
            createHash("sha256").update(body).digest("hex") !== image.checksumSha256
        )
            throw new Error("Installed plugin image no longer matches its persisted metadata");
        return {
            body,
            contentType: image.contentType,
            checksumSha256: image.checksumSha256,
        };
    }

    async openLocal(installationId: string): Promise<Transport> {
        const configuration = await pluginInstallationGetRuntimeConfiguration(
            this.executor,
            this.secrets,
            installationId,
        );
        if (configuration.type !== "stdio")
            throw new PluginError("not_found", "Plugin does not expose a local stdio MCP server");
        return this.runtime.openLocal({
            containerName: configuration.containerName,
            command: configuration.command,
            args: configuration.args,
            environment: configuration.environment,
        });
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const { controller } of this.activations.values()) controller.abort();
        await Promise.allSettled([...this.activations.values()].map(({ promise }) => promise));
        await Promise.allSettled(
            [...this.localContainers].map((containerName) =>
                this.runtime.removeLocal(containerName),
            ),
        );
        this.localContainers.clear();
    }

    private activate(installationId: string): void {
        if (this.closed || this.activations.has(installationId)) return;
        const controller = new AbortController();
        const promise = this.runActivation(installationId, controller.signal)
            .catch((error) => this.onError(error))
            .finally(() => this.activations.delete(installationId));
        this.activations.set(installationId, { controller, promise });
    }

    private async runActivation(installationId: string, signal: AbortSignal): Promise<void> {
        let preparedContainerName: string | undefined;
        try {
            signal.throwIfAborted();
            await this.status(
                installationId,
                "preparing",
                "Preparing the installed plugin runtime.",
            );
            const configuration = await pluginInstallationGetRuntimeConfiguration(
                this.executor,
                this.secrets,
                installationId,
            );
            await this.packages.verify(
                configuration.pluginId,
                configuration.packageDirectory,
                configuration.shortName,
                configuration.packageDigest,
            );
            if (configuration.type === "skills_only") {
                await this.status(installationId, "ready", "Plugin skills are installed.");
                return;
            }
            if (configuration.type === "remote") {
                await this.status(installationId, "starting", "Checking the remote MCP server.");
                await this.probeRemote(configuration, signal);
                await this.status(installationId, "ready", "Remote MCP server is healthy.");
                return;
            }
            const dockerfile = configuration.bundledDockerfile
                ? await readFile(
                      join(configuration.packageDirectory, configuration.bundledDockerfile),
                      "utf8",
                  )
                : undefined;
            const prepared = await this.runtime.prepareLocal(
                {
                    installationId,
                    containerName: configuration.containerName,
                    imageTag: configuration.imageTag,
                    ...(dockerfile
                        ? {
                              build: {
                                  contextDirectory: configuration.packageDirectory,
                                  dockerfile,
                                  tag: configuration.imageTag,
                              },
                          }
                        : {}),
                },
                signal,
            );
            preparedContainerName = configuration.containerName;
            this.localContainers.add(configuration.containerName);
            await this.status(
                installationId,
                "starting",
                "Starting and checking the containerized MCP server.",
                undefined,
                prepared.imageTag,
            );
            await this.probeLocal(configuration, signal);
            await this.status(
                installationId,
                "ready",
                "Containerized MCP server is healthy.",
                undefined,
                prepared.imageTag,
            );
        } catch (error) {
            if (preparedContainerName) {
                this.localContainers.delete(preparedContainerName);
                await this.runtime.removeLocal(preparedContainerName).catch(this.onError);
            }
            if (signal.aborted && this.closed) return;
            const broken = error instanceof PluginError && error.code === "broken_configuration";
            await this.status(
                installationId,
                broken ? "broken_configuration" : "failed",
                broken
                    ? "Plugin configuration must be corrected before it can start."
                    : "Plugin runtime failed to prepare or start.",
                errorMessage(error),
            ).catch(this.onError);
        }
    }

    private async probeLocal(
        configuration: Extract<PluginRuntimeConfiguration, { type: "stdio" }>,
        signal: AbortSignal,
    ): Promise<void> {
        const transport = await this.runtime.openLocal(
            {
                containerName: configuration.containerName,
                command: configuration.command,
                args: configuration.args,
                environment: configuration.environment,
            },
            signal,
        );
        const client = new Client({ name: "happy2-plugin-health", version: "1.0.0" });
        try {
            await withTimeout(
                client.connect(transport),
                HEALTH_TIMEOUT_MS,
                "MCP initialization",
                signal,
            );
            await withTimeout(client.ping(), HEALTH_TIMEOUT_MS, "MCP ping", signal);
        } finally {
            await client.close().catch(() => transport.close());
        }
    }

    private async probeRemote(
        configuration: Extract<PluginRuntimeConfiguration, { type: "remote" }>,
        signal: AbortSignal,
    ): Promise<void> {
        const destination = await withTimeout(
            this.urlPolicy.resolveForDelivery(configuration.url),
            HEALTH_TIMEOUT_MS,
            "Remote MCP DNS resolution",
            signal,
        );
        const id = createId();
        const response = await withTimeout(
            this.remoteTransport.deliver({
                deliveryId: `plugin-health:${configuration.installationId}`,
                eventId: id,
                eventType: "plugin.mcp.initialize",
                url: destination.url,
                allowedAddresses: destination.addresses,
                headers: {
                    ...configuration.headers,
                    accept: "application/json, text/event-stream",
                    "content-type": "application/json",
                    "mcp-protocol-version": LATEST_PROTOCOL_VERSION,
                },
                body: JSON.stringify({
                    jsonrpc: "2.0",
                    id,
                    method: "initialize",
                    params: {
                        protocolVersion: LATEST_PROTOCOL_VERSION,
                        capabilities: {},
                        clientInfo: { name: "happy2-plugin-health", version: "1.0.0" },
                    },
                }),
            }),
            HEALTH_TIMEOUT_MS,
            "Remote MCP initialization",
            signal,
        );
        if (response.statusCode < 200 || response.statusCode >= 300)
            throw new Error(`Remote MCP initialization returned HTTP ${response.statusCode}`);
        const payload = remoteJson(response.body ?? "");
        if (
            !payload ||
            payload.jsonrpc !== "2.0" ||
            payload.id !== id ||
            (!payload.result && !payload.error)
        )
            throw new Error("Remote MCP initialization returned an invalid JSON-RPC response");
        if (payload.error) {
            const error =
                payload.error && typeof payload.error === "object" && !Array.isArray(payload.error)
                    ? (payload.error as Record<string, unknown>)
                    : undefined;
            const code = typeof error?.code === "number" ? ` with code ${error.code}` : "";
            throw new Error(`Remote MCP initialization returned a JSON-RPC error${code}`);
        }
    }

    private async status(
        installationId: string,
        status: "preparing" | "starting" | "ready" | "broken_configuration" | "failed",
        detail: string,
        error?: string,
        runtimeImageTag?: string,
    ): Promise<void> {
        const hint = await pluginInstallationUpdateStatus(this.executor, {
            installationId,
            status,
            detail,
            error,
            runtimeImageTag,
        });
        await this.publish(hint).catch(this.onError);
    }

    private publish(hint: MutationHint): Promise<void> {
        return this.pubsub.publish(realtimeTopics.server, { type: "sync", ...hint });
    }
}

function remoteJson(body: string): Record<string, unknown> | undefined {
    const direct = jsonRecord(body.trim());
    if (direct) return direct;
    let data: string[] = [];
    for (const line of body.split(/\r?\n/)) {
        if (!line) {
            const event = jsonRecord(data.join("\n"));
            if (event) return event;
            data = [];
        } else if (line.startsWith("data:")) {
            data.push(line.slice(5).trimStart());
        }
    }
    return jsonRecord(data.join("\n"));
}

function jsonRecord(source: string): Record<string, unknown> | undefined {
    if (!source) return undefined;
    try {
        const value = JSON.parse(source);
        return value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : undefined;
    } catch {
        return undefined;
    }
}

function withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string,
    signal?: AbortSignal,
): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortError());
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout;
        const settle = (action: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", abort);
            action();
        };
        const abort = () => settle(() => reject(abortError()));
        timer = setTimeout(
            () => settle(() => reject(new Error(`${operation} timed out`))),
            timeoutMs,
        );
        timer.unref();
        signal?.addEventListener("abort", abort, { once: true });
        promise.then(
            (value) => settle(() => resolve(value)),
            (error) => settle(() => reject(error)),
        );
    });
}

function abortError(): Error {
    const error = new Error("Plugin activation was aborted");
    error.name = "AbortError";
    return error;
}

function errorMessage(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 4_000);
}
