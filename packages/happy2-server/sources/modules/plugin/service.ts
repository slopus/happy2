import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
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
import { chatUpdateMetadata, type ChatMetadataSummary } from "../chat/chatUpdateMetadata.js";
import { pluginInstall } from "./pluginInstall.js";
import { pluginFindBySource } from "./pluginFindBySource.js";
import { pluginGetSource } from "./pluginGetSource.js";
import { pluginGetImage } from "./pluginGetImage.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";
import { pluginInstallationGetRuntimeConfiguration } from "./pluginInstallationGetRuntimeConfiguration.js";
import { pluginInstallationListIds } from "./pluginInstallationListIds.js";
import { pluginInstallationListReadyMcpIds } from "./pluginInstallationListReadyMcpIds.js";
import { pluginInstallationUpdateStatus } from "./pluginInstallationUpdateStatus.js";
import { pluginRemoveMissingBuiltins } from "./pluginRemoveMissingBuiltins.js";
import { pluginMcpToolsReplace, type PluginMcpToolInput } from "./pluginMcpToolsReplace.js";
import { pluginMcpToolsListReady } from "./pluginMcpToolsListReady.js";
import { pluginSkillsListReady } from "./pluginSkillsListReady.js";
import { pluginSkillsListInstalled } from "./pluginSkillsListInstalled.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";
import { pluginContainerInstanceAuthorize } from "./pluginContainerInstanceAuthorize.js";
import { pluginContainerInstanceInvalidate } from "./pluginContainerInstanceInvalidate.js";
import { pluginUninstall } from "./pluginUninstall.js";
import { pluginArchiveExtract } from "./archive.js";
import { pluginPackageLoadSource } from "./catalog.js";
import type { PluginCatalog } from "./catalog.js";
import type { PluginPackageStore } from "./packageStore.js";
import type { PluginLocalCommandHandle, PluginMcpRuntime } from "./runtime.js";
import type { PluginSecretProtector } from "./secrets.js";
import { RemotePluginMcpTransport } from "./utils/remoteMcpTransport.js";
import {
    downloadedPluginSource,
    remotePluginSource,
    remotePluginSourceFromInstalled,
    uploadedPluginSource,
    type PluginArchiveDownloader,
} from "./source.js";
import {
    PluginError,
    MAX_PLUGIN_MCP_TOOLS,
    type PluginFunctionDefinition,
    type PluginFunctionResult,
    type PluginHostPermission,
    type PluginInstallationSummary,
    type PluginPackage,
    type PreparedPluginSummary,
    type PluginRuntimeConfiguration,
    type PluginSkillDefinition,
    type PluginUpdateCheck,
} from "./types.js";

const HEALTH_TIMEOUT_MS = 15_000;
const COMMAND_STARTUP_GRACE_MS = 250;
const FUNCTION_EXECUTION_TIMEOUT_MS = 30_000;
const MAX_RIG_PLUGIN_FUNCTIONS = 128;
const MAX_RIG_PLUGIN_SKILLS = 128;
const PREPARATION_TTL_MS = 15 * 60_000;
const PLUGIN_CHAT_META_KEY = "happy2/chat";

interface PreparedPlugin {
    actorUserId: string;
    expiresAt: number;
    id: string;
    plugin: PluginPackage;
    secretHash: Buffer;
}

/** Coordinates durable plugin installs with asynchronous container preparation, MCP health probes, restart recovery, and local connection creation. */
export class PluginService {
    private readonly activations = new Map<
        string,
        { controller: AbortController; promise: Promise<void> }
    >();
    private readonly commandHandles = new Map<string, PluginLocalCommandHandle>();
    private readonly preparations = new Map<string, PreparedPlugin>();
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
        private readonly archiveDownloader: PluginArchiveDownloader,
        private readonly onError: (error: unknown) => void,
    ) {}

    async start(): Promise<void> {
        await this.packages.cleanupTemporary();
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
        await this.packages.workspaceDirectory(result.pluginId, installationId);
        await this.publish(result.hint).catch(this.onError);
        if (result.installation.status === "preparing") this.activate(installationId);
        return result.installation;
    }

    async prepareUpload(
        actorUserId: string,
        archive: Buffer,
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
    ): Promise<{ selectionRequired: false; candidates: PreparedPluginSummary[] }> {
        await pluginAuthorizeManagement(this.executor, actorUserId);
        onProgress("verifying", "Inspecting uploaded ZIP package.");
        const prepared = await this.prepareArchive(
            actorUserId,
            archive,
            "zip",
            undefined,
            onProgress,
        );
        return { selectionRequired: false, candidates: prepared };
    }

    async prepareRemote(
        actorUserId: string,
        input: { kind: "github" | "zip_url"; url: string },
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
        signal?: AbortSignal,
    ): Promise<{ selectionRequired: boolean; candidates: PreparedPluginSummary[] }> {
        await pluginAuthorizeManagement(this.executor, actorUserId);
        const remote = remotePluginSource(input.kind, input.url);
        onProgress("downloading", "Downloading plugin ZIP from its remote source.");
        const downloaded = await this.archiveDownloader.download(remote.archiveUrl, {
            signal,
            onProgress: (bytes) => onProgress("downloading", "Downloading plugin ZIP.", bytes),
        });
        onProgress("verifying", "Verifying archive structure and plugin metadata.");
        const candidates = await this.prepareArchive(
            actorUserId,
            downloaded.body,
            input.kind === "github" ? "github" : "zip",
            remote,
            onProgress,
        );
        return { selectionRequired: candidates.length > 1, candidates };
    }

    async installPrepared(input: {
        actorUserId: string;
        preparedToken: string;
        variables: Readonly<Record<string, string>>;
        containerImageId?: string;
    }): Promise<PluginInstallationSummary> {
        await pluginAuthorizeManagement(this.executor, input.actorUserId);
        const prepared = await this.preparationTake(input.actorUserId, input.preparedToken);
        try {
            const existing = await pluginFindBySource(
                this.executor,
                prepared.plugin.source.kind,
                prepared.plugin.source.reference,
            );
            if (existing && existing.packageDigest !== prepared.plugin.packageDigest)
                throw new PluginError(
                    "conflict",
                    "This remote plugin has changed since its installed snapshot; update it before adding another installation",
                );
            const installationId = createId();
            const candidateId = existing ? undefined : createId();
            const candidate = candidateId
                ? {
                      pluginId: candidateId,
                      ...(await this.packages.install(prepared.plugin, candidateId)),
                  }
                : undefined;
            let result: Awaited<ReturnType<typeof pluginInstall>>;
            try {
                result = await pluginInstall(this.executor, this.secrets, {
                    actorUserId: input.actorUserId,
                    installationId,
                    plugin: prepared.plugin,
                    candidate,
                    variables: input.variables,
                    containerImageId: input.containerImageId,
                });
            } catch (error) {
                if (candidateId) await this.packages.remove(candidateId);
                throw error;
            }
            if (candidateId && !result.pluginCreated) await this.packages.remove(candidateId);
            await this.packages.workspaceDirectory(result.pluginId, installationId);
            await this.publish(result.hint).catch(this.onError);
            if (result.installation.status === "preparing") this.activate(installationId);
            return result.installation;
        } finally {
            await this.packages.removePreparation(prepared.id).catch(this.onError);
        }
    }

    async uninstall(
        actorUserId: string,
        pluginId: string,
    ): Promise<{
        installationIds: string[];
        pluginId: string;
    }> {
        const result = await pluginUninstall(this.executor, actorUserId, pluginId);
        for (const installationId of result.installationIds) {
            const activation = this.activations.get(installationId);
            activation?.controller.abort();
            this.closeCommand(installationId);
        }
        await Promise.allSettled(
            result.installationIds.flatMap((installationId) => {
                const activation = this.activations.get(installationId);
                return activation ? [activation.promise] : [];
            }),
        );
        await this.publish(result.hint).catch(this.onError);
        await Promise.allSettled([
            ...result.containerNames.map((containerName) => {
                return this.runtime.removeLocal(containerName);
            }),
            this.packages.remove(pluginId),
        ]).then((settled) => {
            for (const item of settled) if (item.status === "rejected") this.onError(item.reason);
        });
        return { installationIds: result.installationIds, pluginId };
    }

    async checkForUpdate(
        actorUserId: string,
        pluginId: string,
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
        signal?: AbortSignal,
    ): Promise<PluginUpdateCheck> {
        const installed = await pluginGetSource(this.executor, actorUserId, pluginId);
        let remotePackage: PluginPackage;
        if (installed.source.kind === "builtin") {
            const catalogPackage = this.catalog.get(installed.source.reference);
            if (!catalogPackage)
                throw new PluginError("not_found", "Built-in plugin is no longer in the catalog");
            remotePackage = catalogPackage;
        } else {
            const remote = remotePluginSourceFromInstalled(installed.source);
            onProgress("downloading", "Downloading the current remote plugin package.");
            const downloaded = await this.archiveDownloader.download(remote.archiveUrl, {
                signal,
                onProgress: (bytes) =>
                    onProgress("downloading", "Downloading remote package.", bytes),
            });
            const directory = await this.packages.createDownloadDirectory();
            try {
                onProgress("verifying", "Verifying the current remote plugin package.");
                const candidates = await pluginArchiveExtract(
                    downloaded.body,
                    directory,
                    remote.kind === "github" ? "github" : "zip",
                );
                const candidate =
                    remote.packagePath === undefined
                        ? candidates[0]
                        : candidates.find(({ packagePath }) => packagePath === remote.packagePath);
                if (!candidate)
                    throw new PluginError(
                        "invalid_package",
                        "The installed plugin path no longer exists remotely",
                    );
                remotePackage = await pluginPackageLoadSource(
                    candidate.directory,
                    installed.source,
                );
            } finally {
                await this.packages.removeDownloadDirectory(directory);
            }
        }
        if (remotePackage.manifest.shortName !== installed.shortName)
            throw new PluginError("invalid_package", "Remote plugin shortName changed");
        return {
            pluginId,
            checkedAt: new Date().toISOString(),
            updateAvailable: remotePackage.packageDigest !== installed.packageDigest,
            installed: { version: installed.sourceVersion, packageDigest: installed.packageDigest },
            remote: {
                version: remotePackage.manifest.version,
                packageDigest: remotePackage.packageDigest,
            },
        };
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

    async listSkills(signal?: AbortSignal): Promise<readonly PluginSkillDefinition[]> {
        const skills = this.skillSources(await pluginSkillsListReady(this.executor), signal);
        if (skills.length > MAX_RIG_PLUGIN_SKILLS)
            throw new PluginSkillCatalogError(
                `Installed plugins expose ${skills.length} skills, exceeding Rig's ${MAX_RIG_PLUGIN_SKILLS}-skill limit`,
            );
        return skills.map(({ name, description }) => ({
            name,
            description,
            location: "durable",
        }));
    }

    async readSkill(
        skill: PluginSkillDefinition,
        signal?: AbortSignal,
    ): Promise<PluginFunctionResult> {
        try {
            return await withOperationTimeout(
                FUNCTION_EXECUTION_TIMEOUT_MS,
                "Plugin skill read",
                signal,
                async (operationSignal) => {
                    const sources = this.skillSources(
                        await pluginSkillsListInstalled(this.executor),
                        operationSignal,
                    );
                    const source = sources.find(({ name }) => name === skill.name);
                    if (!source || source.description !== skill.description)
                        throw new Error("The plugin no longer provides this durable skill");
                    const loaded = await this.packages.readSkill(
                        source.pluginId,
                        source.packageDirectory,
                        source.shortName,
                        source.packageDigest,
                        source.name,
                        source.directory,
                        operationSignal,
                    );
                    if (loaded.description !== skill.description)
                        throw new Error("Installed plugin skill metadata no longer matches");
                    return { status: "completed", output: loaded.source };
                },
            );
        } catch (error) {
            if (signal?.aborted) throw error;
            return {
                status: "failed",
                error: {
                    code: "plugin_skill_failed",
                    message: errorMessage(error),
                },
            };
        }
    }

    async callFunction(
        functionName: string,
        args: unknown,
        context: { chatId: string },
        signal?: AbortSignal,
    ): Promise<PluginFunctionResult> {
        try {
            return await withOperationTimeout(
                FUNCTION_EXECUTION_TIMEOUT_MS,
                "Plugin MCP function execution",
                signal,
                (operationSignal) =>
                    this.callFunctionWithSignal(functionName, args, context, operationSignal),
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
        context: { chatId: string },
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
        const chatToken = await this.tokens.issuePluginChatToken({
            installationId,
            chatId: context.chatId,
        });
        const result = await this.withClient(installationId, signal, async (client) => {
            const result = await client.callTool({
                name: cached.name,
                arguments: jsonArguments(args),
                _meta: {
                    [PLUGIN_CHAT_META_KEY]: {
                        id: context.chatId,
                        token: chatToken,
                    },
                },
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

    private skillSources(
        records: readonly PluginSkillSourceRecord[],
        signal?: AbortSignal,
    ): PluginSkillSourceRecord[] {
        const names = new Map<string, string>();
        for (const record of records) {
            signal?.throwIfAborted();
            const existing = names.get(record.name);
            if (existing)
                throw new PluginSkillCatalogError(
                    `Installed plugins ${existing} and ${record.shortName} both provide skill ${record.name}`,
                );
            names.set(record.name, record.shortName);
        }
        return [...records];
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

    async chatUpdate(
        runtimeToken: string,
        chatToken: string,
        input: { title?: string; description?: string | null },
    ): Promise<{ chat: ChatMetadataSummary; sync: MutationHint }> {
        const installationId = await this.authorizeHost(runtimeToken, "chats:update");
        let claims: Awaited<ReturnType<TokenService["verifyPluginChatToken"]>>;
        try {
            claims = await this.tokens.verifyPluginChatToken(chatToken);
        } catch {
            throw new PluginError("forbidden", "Plugin chat token is invalid");
        }
        if (claims.installationId !== installationId)
            throw new PluginError("forbidden", "Plugin chat token belongs to another installation");
        const result = await chatUpdateMetadata(this.executor, {
            chatId: claims.chatId,
            ...input,
        });
        const event = { type: "sync" as const, ...result.hint };
        await Promise.allSettled([
            this.pubsub.publish(realtimeTopics.chat(claims.chatId), event),
            this.pubsub.publish(realtimeTopics.server, event),
        ]).then((publications) => {
            for (const publication of publications)
                if (publication.status === "rejected") this.onError(publication.reason);
        });
        return { chat: result.chat, sync: result.hint };
    }

    async close(): Promise<void> {
        this.closed = true;
        for (const { controller } of this.activations.values()) controller.abort();
        await Promise.allSettled([...this.activations.values()].map(({ promise }) => promise));
        for (const handle of this.commandHandles.values()) handle.close();
        this.commandHandles.clear();
        await Promise.allSettled(
            [...this.preparations.values()].map(({ id }) => this.packages.removePreparation(id)),
        );
        this.preparations.clear();
    }

    private async prepareArchive(
        actorUserId: string,
        archive: Buffer,
        kind: "github" | "zip",
        remote: ReturnType<typeof remotePluginSource> | undefined,
        onProgress: (stage: string, detail: string) => void,
    ): Promise<PreparedPluginSummary[]> {
        this.preparationsExpire();
        const directory = await this.packages.createDownloadDirectory();
        try {
            const candidates = await pluginArchiveExtract(archive, directory, kind);
            const prepared: PreparedPluginSummary[] = [];
            for (const candidate of candidates) {
                const provisionalSource = remote
                    ? downloadedPluginSource(remote, candidate.packagePath)
                    : { kind: "upload" as const, reference: "upload:pending" };
                let plugin = await pluginPackageLoadSource(candidate.directory, provisionalSource);
                if (/^plugins\/[^/]+$/.test(candidate.packagePath)) {
                    const folder = candidate.packagePath.split("/").at(-1)!;
                    if (plugin.manifest.shortName !== folder)
                        throw new PluginError(
                            "invalid_package",
                            `${candidate.packagePath}: shortName must match its plugin folder`,
                        );
                }
                if (!remote)
                    plugin = { ...plugin, source: uploadedPluginSource(plugin.packageDigest) };
                const id = createId();
                plugin = await this.packages.prepare(plugin, id);
                const secret = randomBytes(32).toString("base64url");
                const token = `${id}.${secret}`;
                const expiresAt = Date.now() + PREPARATION_TTL_MS;
                this.preparations.set(id, {
                    actorUserId,
                    expiresAt,
                    id,
                    plugin,
                    secretHash: createHash("sha256").update(secret).digest(),
                });
                prepared.push(preparedSummary(plugin, token, expiresAt));
            }
            onProgress("prepared", "Plugin package is verified and ready to install.");
            return prepared;
        } catch (error) {
            if (error instanceof PluginError) throw error;
            throw new PluginError("invalid_package", errorMessage(error));
        } finally {
            await this.packages.removeDownloadDirectory(directory);
        }
    }

    private async preparationTake(actorUserId: string, token: string): Promise<PreparedPlugin> {
        this.preparationsExpire();
        const match = /^([a-z0-9]+)\.([A-Za-z0-9_-]{43})$/.exec(token);
        const prepared = match ? this.preparations.get(match[1]!) : undefined;
        const suppliedHash = match ? createHash("sha256").update(match[2]!).digest() : undefined;
        if (
            !prepared ||
            !suppliedHash ||
            prepared.actorUserId !== actorUserId ||
            !timingSafeEqual(prepared.secretHash, suppliedHash)
        )
            throw new PluginError("not_found", "Prepared plugin token was not found or expired");
        this.preparations.delete(prepared.id);
        return prepared;
    }

    private preparationsExpire(): void {
        const now = Date.now();
        for (const [id, prepared] of this.preparations)
            if (prepared.expiresAt <= now) {
                this.preparations.delete(id);
                void this.packages.removePreparation(id).catch(this.onError);
            }
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
        let buildContextDirectory: string | undefined;
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
            if (dockerfile)
                buildContextDirectory = await this.packages.createBuildContext(
                    configuration.pluginId,
                    configuration.packageDirectory,
                    configuration.shortName,
                    configuration.packageDigest,
                );
            const prepared = await this.runtime.prepareLocal(
                {
                    installationId,
                    containerName: configuration.containerName,
                    containerInstanceId: createId(),
                    existingContainerInstanceId: configuration.containerInstanceId,
                    imageTag: configuration.imageTag,
                    workspaceDirectory: await this.packages.workspaceDirectory(
                        configuration.pluginId,
                        installationId,
                    ),
                    ...(dockerfile
                        ? {
                              build: {
                                  contextDirectory: buildContextDirectory!,
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
        } finally {
            if (buildContextDirectory)
                await this.packages.removeBuildContext(buildContextDirectory).catch(this.onError);
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

class PluginSkillCatalogError extends Error {}

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

function preparedSummary(
    plugin: PluginPackage,
    preparedToken: string,
    expiresAt: number,
): PreparedPluginSummary {
    const mcp = plugin.manifest.mcp;
    return {
        preparedToken,
        expiresAt: new Date(expiresAt).toISOString(),
        sourceKind: plugin.source.kind,
        sourceReference: plugin.source.reference,
        packageDigest: plugin.packageDigest,
        version: plugin.manifest.version,
        displayName: plugin.manifest.displayName,
        shortName: plugin.manifest.shortName,
        description: plugin.manifest.description,
        skills: plugin.skills.map(({ name, description }) => ({ name, description })),
        variables: plugin.manifest.variables,
        ...(mcp
            ? {
                  mcp: {
                      type: mcp.type,
                      container:
                          mcp.type === "remote"
                              ? ("none" as const)
                              : mcp.container
                                ? ("bundled" as const)
                                : ("selection_required" as const),
                  },
              }
            : {}),
        image: plugin.image,
    };
}
