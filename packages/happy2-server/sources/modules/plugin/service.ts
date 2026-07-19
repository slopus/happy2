import { createHash } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import type { Transport } from "@modelcontextprotocol/sdk/shared/transport.js";
import type { DrizzleExecutor } from "../drizzle.js";
import type { MutationHint } from "../chat/types.js";
import type { PubSub } from "../realtime/index.js";
import { realtimeTopics } from "../realtime/index.js";
import type { WebhookUrlPolicy } from "../integrations/ssrf.js";
import type { WebhookTransport } from "../integrations/types.js";
import type { TokenService } from "../auth/tokens.js";
import { pluginInstall } from "./pluginInstall.js";
import { pluginFindBySource } from "./pluginFindBySource.js";
import { pluginGetImage } from "./pluginGetImage.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";
import { pluginInstallationGetRuntimeConfiguration } from "./pluginInstallationGetRuntimeConfiguration.js";
import { pluginInstallationListIds } from "./pluginInstallationListIds.js";
import { pluginInstallationListReadyMcpIds } from "./pluginInstallationListReadyMcpIds.js";
import { pluginInstallationUpdateStatus } from "./pluginInstallationUpdateStatus.js";
import { pluginRemoveMissingBuiltins } from "./pluginRemoveMissingBuiltins.js";
import { pluginMcpToolsReplace, type PluginMcpToolInput } from "./pluginMcpToolsReplace.js";
import { pluginMcpToolsListReady } from "./pluginMcpToolsListReady.js";
import { pluginContainerInstanceAuthorize } from "./pluginContainerInstanceAuthorize.js";
import { pluginContainerInstanceInvalidate } from "./pluginContainerInstanceInvalidate.js";
import type { PluginCatalog } from "./catalog.js";
import type { PluginPackageStore } from "./packageStore.js";
import type { PluginLocalCommandHandle, PluginMcpRuntime } from "./runtime.js";
import type { PluginSecretProtector } from "./secrets.js";
import { RemotePluginMcpTransport } from "./utils/remoteMcpTransport.js";
import {
    PluginError,
    MAX_PLUGIN_MCP_TOOLS,
    type PluginFunctionDefinition,
    type PluginFunctionResult,
    type PluginHostPermission,
    type PluginInstallationSummary,
    type PluginRuntimeConfiguration,
} from "./types.js";

const HEALTH_TIMEOUT_MS = 15_000;
const COMMAND_STARTUP_GRACE_MS = 250;
const FUNCTION_EXECUTION_TIMEOUT_MS = 30_000;
const MAX_RIG_PLUGIN_FUNCTIONS = 128;

/** Coordinates durable plugin installs with asynchronous container preparation, MCP health probes, restart recovery, and local connection creation. */
export class PluginService {
    private readonly activations = new Map<
        string,
        { controller: AbortController; promise: Promise<void> }
    >();
    private readonly commandHandles = new Map<string, PluginLocalCommandHandle>();
    private closed = false;

    constructor(
        private readonly executor: DrizzleExecutor,
        private readonly pubsub: PubSub,
        private readonly catalog: PluginCatalog,
        private readonly packages: PluginPackageStore,
        private readonly secrets: PluginSecretProtector,
        private readonly runtime: PluginMcpRuntime,
        private readonly tokens: TokenService,
        private readonly urlPolicy: WebhookUrlPolicy,
        private readonly remoteTransport: WebhookTransport,
        private readonly hostApiUrl: string,
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
        if (configuration.type !== "local" || !configuration.mcp)
            throw new PluginError("not_found", "Plugin does not expose a local stdio MCP server");
        const environment = this.runtimeEnvironment(
            configuration,
            await this.pluginRuntimeToken(configuration),
        );
        return this.runtime.openLocal({
            containerName: configuration.containerName,
            command: configuration.mcp.command,
            args: configuration.mcp.args,
            environment,
        });
    }

    async listFunctions(signal?: AbortSignal): Promise<readonly PluginFunctionDefinition[]> {
        signal?.throwIfAborted();
        const tools = await pluginMcpToolsListReady(this.executor);
        if (tools.length > MAX_RIG_PLUGIN_FUNCTIONS)
            throw new PluginFunctionCatalogError(
                `Installed plugins expose ${tools.length} MCP tools, exceeding Rig's ${MAX_RIG_PLUGIN_FUNCTIONS}-function limit`,
            );
        return tools.map((tool) => ({
            description: tool.description ?? `Runs ${tool.name} from the ${tool.shortName} plugin.`,
            label: `${tool.shortName}: ${tool.title ?? tool.name}`,
            name: pluginFunctionName(tool.installationId, tool.name),
            parameters: tool.inputSchema,
        }));
    }

    async callFunction(
        functionName: string,
        args: unknown,
        signal?: AbortSignal,
    ): Promise<PluginFunctionResult> {
        try {
            return await withOperationTimeout(
                FUNCTION_EXECUTION_TIMEOUT_MS,
                "Plugin MCP function execution",
                signal,
                (operationSignal) =>
                    this.callFunctionWithSignal(functionName, args, operationSignal),
            );
        } catch (error) {
            if (signal?.aborted) throw error;
            return {
                status: "failed",
                error: {
                    code: "plugin_function_failed",
                    message: errorMessage(error),
                },
            };
        }
    }

    private async callFunctionWithSignal(
        functionName: string,
        args: unknown,
        signal: AbortSignal,
    ): Promise<PluginFunctionResult> {
        const installationId = pluginFunctionInstallationId(functionName);
        if (!installationId)
            throw new Error(`Unknown plugin function ${JSON.stringify(functionName)}`);
        const activation = this.activations.get(installationId);
        if (activation) await activation.promise;
        signal.throwIfAborted();
        const ready = await pluginInstallationListReadyMcpIds(this.executor);
        if (!ready.includes(installationId))
            throw new Error("The plugin installation is not ready");
        const cached = (await pluginMcpToolsListReady(this.executor)).find(
            (tool) =>
                tool.installationId === installationId &&
                pluginFunctionName(installationId, tool.name) === functionName,
        );
        if (!cached) throw new Error("The plugin no longer exposes this cached function");
        const result = await this.withClient(installationId, signal, async (client) => {
            const result = await client.callTool({
                name: cached.name,
                arguments: jsonArguments(args),
            });
            if (result.isError)
                return {
                    status: "failed" as const,
                    error: {
                        code: "plugin_mcp_error",
                        message: mcpErrorMessage(result.content),
                        data: result,
                    },
                };
            return { status: "completed" as const, output: result };
        });
        if (!result) throw new Error("The plugin does not expose MCP tools");
        return result;
    }

    async authorizeHost(token: string, permission: PluginHostPermission): Promise<string> {
        let claims: Awaited<ReturnType<TokenService["verifyPluginRuntimeToken"]>>;
        try {
            claims = await this.tokens.verifyPluginRuntimeToken(token);
        } catch {
            throw new PluginError("forbidden", "Plugin runtime token is invalid");
        }
        if (!claims.permissions.includes(permission))
            throw new PluginError("forbidden", `Plugin runtime lacks ${permission} permission`);
        const authorized = await pluginContainerInstanceAuthorize(
            this.executor,
            claims.installationId,
            claims.containerInstanceId,
        );
        if (!authorized)
            throw new PluginError("forbidden", "Plugin container incarnation is not authorized");
        if (
            !this.runtime.isLocalRunning ||
            !(await this.runtime.isLocalRunning(
                authorized.containerName,
                claims.installationId,
                claims.containerInstanceId,
            ))
        ) {
            const hint = await pluginContainerInstanceInvalidate(this.executor, {
                installationId: claims.installationId,
                containerInstanceId: claims.containerInstanceId,
                detail: "Plugin container is missing or stopped.",
            });
            if (hint) await this.publish(hint).catch(this.onError);
            throw new PluginError("forbidden", "Plugin container incarnation is not running");
        }
        return claims.installationId;
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const { controller } of this.activations.values()) controller.abort();
        await Promise.allSettled([...this.activations.values()].map(({ promise }) => promise));
        for (const handle of this.commandHandles.values()) handle.close();
        this.commandHandles.clear();
    }

    private activate(installationId: string): void {
        if (this.closed || this.activations.has(installationId)) return;
        const controller = new AbortController();
        const promise = this.runActivation(installationId, controller.signal)
            .catch((error) => this.onError(error))
            .finally(() => this.activations.delete(installationId));
        this.activations.set(installationId, { controller, promise });
    }

    private async withClient<T>(
        installationId: string,
        signal: AbortSignal | undefined,
        action: (client: Client, configuration: PluginRuntimeConfiguration) => Promise<T>,
    ): Promise<T | undefined> {
        signal?.throwIfAborted();
        const configuration = await pluginInstallationGetRuntimeConfiguration(
            this.executor,
            this.secrets,
            installationId,
        );
        if (configuration.type === "skills_only") return undefined;
        if (configuration.type === "local" && !configuration.mcp) return undefined;
        const localToken =
            configuration.type === "local"
                ? await this.pluginRuntimeToken(configuration)
                : undefined;
        const transport =
            configuration.type === "local"
                ? await this.runtime.openLocal(
                      {
                          containerName: configuration.containerName,
                          command: configuration.mcp!.command,
                          args: configuration.mcp!.args,
                          environment: this.runtimeEnvironment(configuration, localToken!),
                      },
                      signal,
                  )
                : new RemotePluginMcpTransport({
                      headers: configuration.headers,
                      installationId,
                      remoteTransport: this.remoteTransport,
                      signal,
                      url: configuration.url,
                      urlPolicy: this.urlPolicy,
                  });
        const client = new Client({ name: "happy2-plugin-functions", version: "1.0.0" });
        try {
            await client.connect(transport);
            signal?.throwIfAborted();
            return await action(client, configuration);
        } finally {
            await client.close().catch(() => transport.close());
        }
    }

    private async runActivation(installationId: string, signal: AbortSignal): Promise<void> {
        let preparedContainerName: string | undefined;
        let preparedContainerInstanceId: string | undefined;
        let commandHandle: PluginLocalCommandHandle | undefined;
        this.closeCommand(installationId);
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
                const tools = await this.probeRemote(configuration, signal);
                const hint = await pluginMcpToolsReplace(this.executor, installationId, tools);
                await this.publish(hint).catch(this.onError);
                await this.status(
                    installationId,
                    "ready",
                    "Remote MCP server and cached tools are ready.",
                );
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
                    containerInstanceId: createId(),
                    existingContainerInstanceId: configuration.containerInstanceId,
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
            preparedContainerInstanceId = prepared.containerInstanceId;
            const token = await this.tokens.issuePluginRuntimeToken({
                installationId,
                containerInstanceId: prepared.containerInstanceId,
                permissions: configuration.permissions,
            });
            const environment = this.runtimeEnvironment(configuration, token);
            await this.status(
                installationId,
                "starting",
                "Starting and checking the containerized plugin runtime.",
                undefined,
                prepared.imageTag,
                prepared.containerInstanceId,
            );
            if (configuration.command) {
                commandHandle = prepared.reused
                    ? await this.runtime.monitorLocalCommand(configuration.containerName, signal)
                    : await this.runtime.startLocalCommand(
                          {
                              containerName: configuration.containerName,
                              command: configuration.command.command,
                              args: configuration.command.args,
                              environment,
                          },
                          signal,
                      );
                this.commandHandles.set(installationId, commandHandle);
                await commandSurviveStartup(commandHandle.wait, signal);
            }
            if (configuration.mcp) {
                const tools = await this.probeLocal(configuration, environment, signal);
                const hint = await pluginMcpToolsReplace(this.executor, installationId, tools);
                await this.publish(hint).catch(this.onError);
            }
            await this.status(
                installationId,
                "ready",
                configuration.mcp
                    ? "Containerized plugin runtime and MCP tools are ready."
                    : "Containerized plugin command is running.",
                undefined,
                prepared.imageTag,
                prepared.containerInstanceId,
            );
            if (commandHandle)
                this.monitorCommand(installationId, configuration.containerName, commandHandle);
        } catch (error) {
            if (commandHandle) {
                if (this.commandHandles.get(installationId) === commandHandle)
                    this.commandHandles.delete(installationId);
                commandHandle.close();
            }
            if (signal.aborted && this.closed) return;
            if (preparedContainerName)
                await this.runtime.removeLocal(preparedContainerName).catch(this.onError);
            const broken = error instanceof PluginError && error.code === "broken_configuration";
            await this.status(
                installationId,
                broken ? "broken_configuration" : "failed",
                broken
                    ? "Plugin configuration must be corrected before it can start."
                    : "Plugin runtime failed to prepare or start.",
                errorMessage(error),
                undefined,
                preparedContainerInstanceId ? null : undefined,
            ).catch(this.onError);
        }
    }

    private async probeLocal(
        configuration: Extract<PluginRuntimeConfiguration, { type: "local" }>,
        environment: Readonly<Record<string, string>>,
        signal: AbortSignal,
    ): Promise<PluginMcpToolInput[]> {
        if (!configuration.mcp) return [];
        const transport = await this.runtime.openLocal(
            {
                containerName: configuration.containerName,
                command: configuration.mcp.command,
                args: configuration.mcp.args,
                environment,
            },
            signal,
        );
        return this.discoverTools(transport, signal);
    }

    private async discoverTools(
        transport: Transport,
        signal: AbortSignal,
    ): Promise<PluginMcpToolInput[]> {
        const client = new Client({ name: "happy2-plugin-health", version: "1.0.0" });
        try {
            await withTimeout(
                client.connect(transport),
                HEALTH_TIMEOUT_MS,
                "MCP initialization",
                signal,
            );
            await withTimeout(client.ping(), HEALTH_TIMEOUT_MS, "MCP ping", signal);
            const tools: PluginMcpToolInput[] = [];
            const cursors = new Set<string>();
            let cursor: string | undefined;
            do {
                const listed = await withTimeout(
                    client.listTools(cursor ? { cursor } : undefined),
                    HEALTH_TIMEOUT_MS,
                    "MCP tool discovery",
                    signal,
                );
                tools.push(
                    ...listed.tools.map((tool) => ({
                        name: tool.name,
                        ...(tool.title ? { title: tool.title } : {}),
                        ...(tool.description ? { description: tool.description } : {}),
                        inputSchema: tool.inputSchema,
                        ...(tool.outputSchema ? { outputSchema: tool.outputSchema } : {}),
                        ...(tool.annotations ? { annotations: tool.annotations } : {}),
                    })),
                );
                if (tools.length > MAX_PLUGIN_MCP_TOOLS)
                    throw new PluginError(
                        "broken_configuration",
                        "Plugin MCP exposes too many tools",
                    );
                cursor = listed.nextCursor;
                if (cursor && cursors.has(cursor))
                    throw new PluginError(
                        "broken_configuration",
                        "Plugin MCP tool pagination repeated a cursor",
                    );
                if (cursor) cursors.add(cursor);
                if (cursors.size > MAX_PLUGIN_MCP_TOOLS)
                    throw new PluginError(
                        "broken_configuration",
                        "Plugin MCP tool pagination has too many pages",
                    );
            } while (cursor);
            return tools;
        } finally {
            await client.close().catch(() => transport.close());
        }
    }

    private async probeRemote(
        configuration: Extract<PluginRuntimeConfiguration, { type: "remote" }>,
        signal: AbortSignal,
    ): Promise<PluginMcpToolInput[]> {
        return this.discoverTools(
            new RemotePluginMcpTransport({
                headers: configuration.headers,
                installationId: configuration.installationId,
                remoteTransport: this.remoteTransport,
                signal,
                url: configuration.url,
                urlPolicy: this.urlPolicy,
            }),
            signal,
        );
    }

    private async status(
        installationId: string,
        status: "preparing" | "starting" | "ready" | "broken_configuration" | "failed",
        detail: string,
        error?: string,
        runtimeImageTag?: string,
        containerInstanceId?: string | null,
    ): Promise<void> {
        const hint = await pluginInstallationUpdateStatus(this.executor, {
            installationId,
            status,
            detail,
            error,
            runtimeImageTag,
            containerInstanceId,
        });
        await this.publish(hint).catch(this.onError);
    }

    private publish(hint: MutationHint): Promise<void> {
        return this.pubsub.publish(realtimeTopics.server, { type: "sync", ...hint });
    }

    private closeCommand(installationId: string): void {
        const handle = this.commandHandles.get(installationId);
        if (!handle) return;
        this.commandHandles.delete(installationId);
        handle.close();
    }

    private monitorCommand(
        installationId: string,
        containerName: string,
        handle: PluginLocalCommandHandle,
    ): void {
        void handle.wait
            .then(async (result) => {
                if (this.closed || this.commandHandles.get(installationId) !== handle) return;
                this.commandHandles.delete(installationId);
                await this.runtime.removeLocal(containerName).catch(this.onError);
                await this.status(
                    installationId,
                    "failed",
                    "Plugin runtime command exited.",
                    commandExitMessage(result),
                    undefined,
                    null,
                );
            })
            .catch(this.onError);
    }

    private runtimeEnvironment(
        configuration: Extract<PluginRuntimeConfiguration, { type: "local" }>,
        token: string,
    ): Readonly<Record<string, string>> {
        return {
            ...configuration.environment,
            HAPPY2_PLUGIN_API_URL: this.hostApiUrl,
            HAPPY2_PLUGIN_API_TOKEN: token,
        };
    }

    private pluginRuntimeToken(
        configuration: Extract<PluginRuntimeConfiguration, { type: "local" }>,
    ): Promise<string> {
        if (!configuration.containerInstanceId)
            throw new PluginError("not_ready", "Plugin container incarnation is unavailable");
        return this.tokens.issuePluginRuntimeToken({
            installationId: configuration.installationId,
            containerInstanceId: configuration.containerInstanceId,
            permissions: configuration.permissions,
        });
    }
}

class PluginFunctionCatalogError extends Error {}

function pluginFunctionName(installationId: string, toolName: string): string {
    const normalized = toolName
        .normalize("NFKD")
        .replace(/[^A-Za-z0-9_-]+/g, "_")
        .replace(/^_+|_+$/g, "")
        .slice(0, 64);
    const digest = createHash("sha256").update(toolName).digest("hex").slice(0, 16);
    return `plugin_${installationId}_${normalized || "tool"}_${digest}`;
}

function pluginFunctionInstallationId(functionName: string): string | undefined {
    const match = /^plugin_([a-z0-9]+)_/u.exec(functionName);
    return match?.[1];
}

function jsonArguments(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function mcpErrorMessage(content: unknown): string {
    if (Array.isArray(content)) {
        const text = content
            .filter((block): block is { text: string; type: "text" } =>
                Boolean(
                    block &&
                    typeof block === "object" &&
                    (block as { type?: unknown }).type === "text" &&
                    typeof (block as { text?: unknown }).text === "string",
                ),
            )
            .map(({ text }) => text)
            .join("\n")
            .trim();
        if (text) return text;
    }
    return "The plugin MCP tool returned an error";
}

function commandSurviveStartup(
    wait: PluginLocalCommandHandle["wait"],
    signal: AbortSignal,
): Promise<void> {
    if (signal.aborted) return Promise.reject(abortReason(signal));
    return new Promise<void>((resolve, reject) => {
        let settled = false;
        const finish = (action: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal.removeEventListener("abort", aborted);
            action();
        };
        const aborted = () => finish(() => reject(abortReason(signal)));
        const timer = setTimeout(() => finish(resolve), COMMAND_STARTUP_GRACE_MS);
        signal.addEventListener("abort", aborted, { once: true });
        wait.then(
            (result) =>
                finish(() =>
                    reject(
                        new Error(
                            `Plugin command exited during startup: ${commandExitMessage(result)}`,
                        ),
                    ),
                ),
            (error) => finish(() => reject(error)),
        );
    });
}

function commandExitMessage(result: {
    exitCode: number | null;
    signal: NodeJS.Signals | null;
}): string {
    return result.signal
        ? `Plugin command exited after signal ${result.signal}`
        : `Plugin command exited with code ${result.exitCode ?? "unknown"}`;
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

function withOperationTimeout<T>(
    timeoutMs: number,
    operation: string,
    signal: AbortSignal | undefined,
    action: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    const controller = new AbortController();
    return new Promise<T>((resolve, reject) => {
        let settled = false;
        let timer: NodeJS.Timeout;
        const settle = (callback: () => void) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            signal?.removeEventListener("abort", parentAborted);
            callback();
        };
        const parentAborted = () => {
            const reason = signal ? abortReason(signal) : abortError();
            controller.abort(reason);
            settle(() => reject(reason));
        };
        const timedOut = () => {
            const error = new Error(`${operation} timed out`);
            controller.abort(error);
            settle(() => reject(error));
        };
        timer = setTimeout(timedOut, timeoutMs);
        timer.unref();
        signal?.addEventListener("abort", parentAborted, { once: true });
        Promise.resolve()
            .then(() => action(controller.signal))
            .then(
                (value) => settle(() => resolve(value)),
                (error) => settle(() => reject(error)),
            );
    });
}

function abortReason(signal: AbortSignal): Error {
    return signal.reason instanceof Error ? signal.reason : abortError();
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
