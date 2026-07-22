import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { readFile, stat } from "node:fs/promises";
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
import { documentCreate } from "../document/documentCreate.js";
import { documentGetForChatHost } from "../document/documentGetForChatHost.js";
import { documentListForChatHost } from "../document/documentListForChatHost.js";
import { documentWriteRequestAwaitOutcome } from "../document/documentWriteRequestAwaitOutcome.js";
import { documentWriteRequestCreate } from "../document/documentWriteRequestCreate.js";
import type { DocumentHostSummary, DocumentSnapshot } from "../document/types.js";
import { chatUpdateMetadata, type ChatMetadataSummary } from "../chat/chatUpdateMetadata.js";
import { channelCreateChild } from "../chat/channelCreateChild.js";
import { channelCreateWithMembers } from "../chat/channelCreateWithMembers.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { projectDefaultRequire } from "../project/projectDefaultRequire.js";
import { channelMembersUpdate } from "../chat/channelMembersUpdate.js";
import { channelSetArchived } from "../chat/channelSetArchived.js";
import { messageSend } from "../message/messageSend.js";
import { messageDelete } from "../message/messageDelete.js";
import { messageGet } from "../message/messageGet.js";
import { userFindActive } from "../user/userFindActive.js";
import { messageList } from "../message/messageList.js";
import { messageReactionSet } from "../message/messageReactionSet.js";
import { searchPageGet } from "../search/searchPageGet.js";
import type { WorkspaceService } from "../workspace/index.js";
import { pluginInstall } from "./pluginInstall.js";
import { pluginFindBySource } from "./pluginFindBySource.js";
import { pluginInstallationGetSource } from "./pluginInstallationGetSource.js";
import { pluginGetImage } from "./pluginGetImage.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";
import { pluginInstallationGetRuntimeConfiguration } from "./pluginInstallationGetRuntimeConfiguration.js";
import { pluginInstallationGetRequestUninstallContext } from "./pluginInstallationGetRequestUninstallContext.js";
import { pluginInstallationUninstall } from "./pluginInstallationUninstall.js";
import { pluginInstallationListIds } from "./pluginInstallationListIds.js";
import { pluginInstallationListReadyMcpIds } from "./pluginInstallationListReadyMcpIds.js";
import { pluginInstallationUpdateStatus } from "./pluginInstallationUpdateStatus.js";
import { pluginInstallationPermissionsUpdate } from "./pluginInstallationPermissionsUpdate.js";
import { pluginInstallationRetry } from "./pluginInstallationRetry.js";
import { pluginInstallationGetContainerName } from "./pluginInstallationGetContainerName.js";
import { pluginAgentCallContextGet } from "./pluginAgentCallContextGet.js";
import { pluginRemoveMissingBuiltins } from "./pluginRemoveMissingBuiltins.js";
import { pluginMcpCatalogReplace, type PluginMcpToolInput } from "./pluginMcpCatalogReplace.js";
import { pluginMcpToolsListReady } from "./pluginMcpToolsListReady.js";
import { pluginMcpAppBegin } from "./pluginMcpAppBegin.js";
import { pluginMcpAppComplete } from "./pluginMcpAppComplete.js";
import { pluginMcpAppGet } from "./pluginMcpAppGet.js";
import { pluginMcpAppResourceGet } from "./pluginMcpAppResourceGet.js";
import { pluginResourceLinkReplaceForCall } from "./pluginResourceLinkReplaceForCall.js";
import { pluginAppInstancePut } from "./pluginAppInstancePut.js";
import { pluginAppInstanceContextUpdate } from "./pluginAppInstanceContextUpdate.js";
import { pluginAppInstanceDelete } from "./pluginAppInstanceDelete.js";
import { pluginAppInstanceGet } from "./pluginAppInstanceGet.js";
import { pluginAppInstanceResourceGet } from "./pluginAppInstanceResourceGet.js";
import { pluginAppInstanceList } from "./pluginAppInstanceList.js";
import { pluginAppPreferenceUpdate } from "./pluginAppPreferenceUpdate.js";
import { pluginContributionPut } from "./pluginContributionPut.js";
import { pluginContributionDelete } from "./pluginContributionDelete.js";
import { pluginContributionList } from "./pluginContributionList.js";
import { pluginUiAssetGet } from "./pluginUiAssetGet.js";
import { pluginSkillsListReady } from "./pluginSkillsListReady.js";
import { pluginSkillsListInstalled } from "./pluginSkillsListInstalled.js";
import { pluginApiPermissionSections } from "./impl/apiPermissions.js";
import { effectiveContainer } from "./impl/effectiveContainer.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";
import { pluginContainerInstanceAuthorize } from "./pluginContainerInstanceAuthorize.js";
import { pluginContainerInstanceInvalidate } from "./pluginContainerInstanceInvalidate.js";
import { pluginUninstall } from "./pluginUninstall.js";
import { pluginUpdate } from "./pluginUpdate.js";
import { pluginUpdatePlan } from "./pluginUpdatePlan.js";
import {
    pluginContributionDefinitionParse,
    type PluginButtonControl,
    type PluginContributionSpec,
    type PluginInteractiveControl,
    type PluginToolAction,
} from "./impl/surfaceDefinition.js";
import { pluginContributionDependenciesRequire } from "./impl/surfaceAuthority.js";
import {
    MCP_APP_EXTENSION_ID,
    MCP_APP_RESOURCE_MIME_TYPE,
    type McpAppResourceInput,
    mcpAppResourceInput,
    mcpAppToolUi,
    mcpAppToolVisibleTo,
} from "./impl/mcpApp.js";
import { pluginArchiveExtract } from "./archive.js";
import { pluginPackageLoadSource } from "./catalog.js";
import { pluginManagementRequestBeginInstall } from "./pluginManagementRequestBeginInstall.js";
import { pluginManagementRequestBeginUninstall } from "./pluginManagementRequestBeginUninstall.js";
import { pluginManagementRequestCompleteInstall } from "./pluginManagementRequestCompleteInstall.js";
import { pluginManagementRequestCompleteUninstall } from "./pluginManagementRequestCompleteUninstall.js";
import { pluginManagementRequestCreateInstall } from "./pluginManagementRequestCreateInstall.js";
import { pluginManagementRequestCreateUninstall } from "./pluginManagementRequestCreateUninstall.js";
import { pluginManagementRequestDeny } from "./pluginManagementRequestDeny.js";
import { pluginManagementRequestGetPackage } from "./pluginManagementRequestGetPackage.js";
import { pluginManagementRequestList } from "./pluginManagementRequestList.js";
import { pluginManagementRequestListTerminalIds } from "./pluginManagementRequestListTerminalIds.js";
import { pluginManagementRequestRecoverProcessing } from "./pluginManagementRequestRecoverProcessing.js";
import type { PluginCatalog } from "./catalog.js";
import type { PluginPackageStore } from "./packageStore.js";
import type { PluginPackageLinkDownloader } from "./packageLinkDownloader.js";
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
    type PluginAgentCallContext,
    type PluginCallContext,
    type PluginHostPermission,
    type PluginInstallationSummary,
    type PluginPackage,
    type PreparedPluginSummary,
    type PluginManagementRequestSummary,
    type PluginRuntimeConfiguration,
    type PluginSkillDefinition,
    type PluginUserCapability,
    type PluginUpdateCheck,
    type PluginUpdateResult,
} from "./types.js";

const HEALTH_TIMEOUT_MS = 15_000;
const COMMAND_STARTUP_GRACE_MS = 250;
const FUNCTION_EXECUTION_TIMEOUT_MS = 30_000;
const DOCUMENT_WRITE_FUNCTION_TIMEOUT_MS = 6 * 60_000;
const DOCUMENT_WRITE_OUTCOME_POLL_MS = 250;
const MAX_RIG_PLUGIN_FUNCTIONS = 128;
const MAX_RIG_PLUGIN_SKILLS = 128;
const PREPARATION_TTL_MS = 15 * 60_000;
const MAX_MCP_APP_HTML_BYTES = 4 * 1024 * 1024;
const MAX_ACTIVE_MCP_APP_OPERATIONS_PER_ACTOR = 16;
const PLUGIN_CHAT_META_KEY = "happy2/chat";
const PLUGIN_USERS_META_KEY = "happy2/users";
const PLUGIN_VIEWER_META_KEY = "happy2/viewer";
const PLUGIN_MESSAGE_META_KEY = "happy2/message";
const PLUGIN_INSTANCE_META_KEY = "happy2/instance";
const PLUGIN_CONTRIBUTION_META_KEY = "happy2/contribution";
const MAX_SURFACE_ARGUMENT_BYTES = 64 * 1024;
const MAX_SURFACE_RESULT_BYTES = 256 * 1024;
const MAX_PLUGIN_DIAGNOSTIC_CHARS = 64 * 1024;

interface PluginAgentRuntime {
    modelRequireAvailable(modelId: string): Promise<void>;
    prepareTurns(input: {
        actorUserId: string;
        agentUserIds: readonly string[];
        chatId: string;
    }): Promise<Array<{ agentUserId: string; sessionId: string }>>;
    startTurn(chatId: string): void;
}

interface PreparedPlugin {
    actorUserId: string;
    expiresAt: number;
    id: string;
    plugin: PluginPackage;
    secretHash: Buffer;
}

interface PluginMcpCatalogInput {
    tools: PluginMcpToolInput[];
    resources: McpAppResourceInput[];
}

interface OperationTimeoutControl {
    timeoutReset(timeoutMs: number): void;
}

/** Coordinates durable plugin installs with asynchronous container preparation, MCP health probes, restart recovery, and local connection creation. */
export class PluginService {
    private readonly activations = new Map<
        string,
        { controller: AbortController; promise: Promise<void> }
    >();
    private readonly commandHandles = new Map<string, PluginLocalCommandHandle>();
    private readonly preparations = new Map<string, PreparedPlugin>();
    private readonly activeMcpAppOperationsByActor = new Map<string, number>();
    private readonly activeFunctionDocumentWriteWaits = new Map<
        string,
        (waiting: boolean) => Promise<void>
    >();
    private closed = false;

    constructor(
        private readonly executor: DrizzleExecutor,
        private readonly pubsub: PubSub,
        private readonly catalog: PluginCatalog,
        private readonly packages: PluginPackageStore,
        private readonly packageLinks: PluginPackageLinkDownloader,
        private readonly secrets: PluginSecretProtector,
        private readonly runtime: PluginMcpRuntime,
        private readonly tokens: TokenService,
        private readonly urlPolicy: WebhookUrlPolicy,
        private readonly remoteTransport: WebhookTransport,
        private readonly hostApiUrl: string,
        private readonly archiveDownloader: PluginArchiveDownloader,
        private readonly workspaces: WorkspaceService,
        private readonly onError: (error: unknown) => void,
    ) {}

    async start(): Promise<void> {
        await this.packages.cleanupTemporary();
        for (const hint of await pluginManagementRequestRecoverProcessing(this.executor))
            await this.publish(hint).catch(this.onError);
        for (const requestId of await pluginManagementRequestListTerminalIds(this.executor))
            await this.packages.removeRequest(requestId).catch(this.onError);
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
        actorUserId?: string;
        actorInstallationId?: string;
        shortName: string;
        variables: Readonly<Record<string, string>>;
        permissions: readonly PluginHostPermission[];
        containerImageId?: string;
    }): Promise<PluginInstallationSummary> {
        if (input.actorUserId) await pluginAuthorizeManagement(this.executor, input.actorUserId);
        else if (!input.actorInstallationId)
            throw new PluginError("forbidden", "Plugin installation authority is required");
        const catalogPlugin = this.catalog.get(input.shortName);
        if (!catalogPlugin) throw new PluginError("not_found", "Built-in plugin was not found");
        const existing = await pluginFindBySource(
            this.executor,
            catalogPlugin.source.kind,
            catalogPlugin.source.reference,
        );
        const plugin = existing
            ? await this.packages.loadInstalled(
                  existing.id,
                  existing.packageDirectory,
                  existing.shortName,
                  existing.packageDigest,
                  catalogPlugin.source,
              )
            : catalogPlugin;
        return this.installPackage({ ...input, plugin });
    }

    async installArchive(input: {
        actorUserId: string;
        archive: Buffer;
        variables: Readonly<Record<string, string>>;
        containerImageId?: string;
    }): Promise<PluginInstallationSummary> {
        await pluginAuthorizeManagement(this.executor, input.actorUserId);
        const prepared = await this.prepareRequestedArchive(input.archive, {
            kind: "archive",
            reference: "pending",
        });
        try {
            return await this.installPackage({
                ...input,
                permissions: [],
                plugin: prepared.plugin,
            });
        } finally {
            await prepared.cleanup();
        }
    }

    async installLink(input: {
        actorUserId: string;
        url: string;
        variables: Readonly<Record<string, string>>;
        containerImageId?: string;
    }): Promise<PluginInstallationSummary> {
        await pluginAuthorizeManagement(this.executor, input.actorUserId);
        const downloaded = await this.downloadPackage(input.url);
        const prepared = await this.prepareRequestedArchive(downloaded.body, {
            kind: "link",
            reference: downloaded.url,
        });
        try {
            return await this.installPackage({
                ...input,
                permissions: [],
                plugin: prepared.plugin,
            });
        } finally {
            await prepared.cleanup();
        }
    }

    private async installPackage(input: {
        actorUserId?: string;
        actorInstallationId?: string;
        plugin: PluginPackage;
        variables: Readonly<Record<string, string>>;
        permissions: readonly PluginHostPermission[];
        containerImageId?: string;
        installationId?: string;
    }): Promise<PluginInstallationSummary> {
        const installationId = input.installationId ?? createId();
        const existing = await pluginFindBySource(
            this.executor,
            input.plugin.source.kind,
            input.plugin.source.reference,
        );
        const candidateId = existing?.id ?? createId();
        const candidate = existing
            ? existing.packageDigest === input.plugin.packageDigest
                ? undefined
                : {
                      pluginId: existing.id,
                      ...(await this.packages.installUpdate(input.plugin, existing.id)),
                  }
            : {
                  pluginId: candidateId,
                  ...(await this.packages.install(input.plugin, candidateId)),
              };
        let result: Awaited<ReturnType<typeof pluginInstall>>;
        try {
            result = await pluginInstall(this.executor, this.secrets, {
                actorUserId: input.actorUserId,
                actorInstallationId: input.actorInstallationId,
                installationId,
                plugin: input.plugin,
                candidate,
                variables: input.variables,
                permissions: input.permissions,
                containerImageId: input.containerImageId,
            });
        } catch (error) {
            if (candidate)
                await (existing
                    ? this.packages.removeUpdate(existing.id, candidate.packageDirectory)
                    : this.packages.remove(candidateId));
            throw error;
        }
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
        permissions: readonly PluginHostPermission[];
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
            const installationId = createId();
            const candidateId = existing?.id ?? createId();
            const candidate = existing
                ? existing.packageDigest === prepared.plugin.packageDigest
                    ? undefined
                    : {
                          pluginId: existing.id,
                          ...(await this.packages.installUpdate(prepared.plugin, existing.id)),
                      }
                : {
                      pluginId: candidateId,
                      ...(await this.packages.install(prepared.plugin, candidateId)),
                  };
            let result: Awaited<ReturnType<typeof pluginInstall>>;
            try {
                result = await pluginInstall(this.executor, this.secrets, {
                    actorUserId: input.actorUserId,
                    installationId,
                    plugin: prepared.plugin,
                    candidate,
                    variables: input.variables,
                    permissions: input.permissions,
                    containerImageId: input.containerImageId,
                });
            } catch (error) {
                if (candidate)
                    await (existing
                        ? this.packages.removeUpdate(existing.id, candidate.packageDirectory)
                        : this.packages.remove(candidateId));
                throw error;
            }
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
        installationId: string,
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
        signal?: AbortSignal,
    ): Promise<PluginUpdateCheck> {
        const installed = await pluginInstallationGetSource(
            this.executor,
            actorUserId,
            installationId,
        );
        const remote = await this.updatePackageResolve(installed, onProgress, signal);
        try {
            if (remote.plugin.manifest.shortName !== installed.shortName)
                throw new PluginError("invalid_package", "Remote plugin shortName changed");
            return {
                installationId,
                pluginId: installed.pluginId,
                checkedAt: new Date().toISOString(),
                updateAvailable: remote.plugin.packageDigest !== installed.packageDigest,
                installed: {
                    version: installed.sourceVersion,
                    packageDigest: installed.packageDigest,
                },
                remote: {
                    version: remote.plugin.manifest.version,
                    packageDigest: remote.plugin.packageDigest,
                },
            };
        } finally {
            await remote.cleanup();
        }
    }

    async updatePlugin(
        actorUserId: string,
        installationId: string,
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
        signal?: AbortSignal,
    ): Promise<PluginUpdateResult> {
        const installed = await pluginInstallationGetSource(
            this.executor,
            actorUserId,
            installationId,
        );
        const remote = await this.updatePackageResolve(installed, onProgress, signal);
        try {
            const plan = await pluginUpdatePlan(
                this.executor,
                actorUserId,
                installationId,
                remote.plugin,
            );
            onProgress("staging", "Staging the verified plugin update.");
            const snapshot = await this.packages.installUpdate(remote.plugin, plan.pluginId);
            let committed = false;
            try {
                onProgress("stopping", "Stopping the selected plugin installation.");
                await this.stopActivation(installationId);
                if (plan.containerName)
                    await this.runtime.removeLocal(plan.containerName).catch(this.onError);
                onProgress("updating", "Committing the updated plugin package.");
                const result = await pluginUpdate(this.executor, {
                    actorUserId,
                    expectedPackageDigest: plan.currentPackageDigest,
                    installationId,
                    packageDirectory: snapshot.packageDirectory,
                    replacement: remote.plugin,
                });
                committed = true;
                await this.publish(result.hint).catch(this.onError);
                this.activate(installationId);
                if (result.previousPackageDirectory !== result.pluginPackageDirectory)
                    await this.packages
                        .removeUpdate(result.pluginId, result.previousPackageDirectory)
                        .catch(this.onError);
                return {
                    installationId,
                    pluginId: result.pluginId,
                    updatedAt: new Date().toISOString(),
                    previous: {
                        version: installed.sourceVersion,
                        packageDigest: installed.packageDigest,
                    },
                    current: {
                        version: result.sourceVersion,
                        packageDigest: remote.plugin.packageDigest,
                    },
                };
            } catch (error) {
                if (!committed && snapshot.created)
                    await this.packages
                        .removeUpdate(plan.pluginId, snapshot.packageDirectory)
                        .catch(this.onError);
                if (!committed) this.activate(installationId);
                throw error;
            }
        } finally {
            await remote.cleanup();
        }
    }

    async updatePermissions(input: {
        actorUserId: string;
        installationId: string;
        permissions: readonly PluginHostPermission[];
    }): Promise<PluginInstallationSummary> {
        const result = await pluginInstallationPermissionsUpdate(this.executor, input);
        if (!result.changed) return result.installation;
        if (result.hint) await this.publish(result.hint).catch(this.onError);
        await this.stopActivation(input.installationId);
        if (result.containerName)
            await this.runtime.removeLocal(result.containerName).catch(this.onError);
        this.activate(input.installationId);
        return result.installation;
    }

    async uninstallInstallation(input: {
        installationId: string;
        actorUserId?: string;
        actorInstallationId?: string;
    }): Promise<void> {
        if (input.actorUserId) await pluginAuthorizeManagement(this.executor, input.actorUserId);
        else if (!input.actorInstallationId)
            throw new PluginError("forbidden", "Plugin installation authority is required");
        const containerName = await pluginInstallationGetContainerName(
            this.executor,
            input.installationId,
        );
        await this.stopActivation(input.installationId);
        try {
            if (containerName) await this.runtime.removeLocal(containerName);
            const result = await pluginInstallationUninstall(this.executor, input);
            if (result.pluginRemoved) await this.packages.remove(result.pluginId);
            else if (result.packageDirectory !== result.pluginPackageDirectory)
                await this.packages.removeUpdate(result.pluginId, result.packageDirectory);
            await this.publish(result.hint).catch(this.onError);
        } catch (error) {
            this.activate(input.installationId);
            throw error;
        }
    }

    async retryInstallation(input: {
        actorUserId: string;
        installationId: string;
    }): Promise<PluginInstallationSummary> {
        await this.stopActivation(input.installationId);
        const result = await pluginInstallationRetry(this.executor, input);
        if (result.containerName)
            await this.runtime.removeLocal(result.containerName).catch(this.onError);
        await this.publish(result.hint).catch(this.onError);
        this.activate(input.installationId);
        return result.installation;
    }

    private async downloadPackage(url: string) {
        try {
            return await this.packageLinks.download(url);
        } catch (error) {
            if (error instanceof PluginError) throw error;
            throw new PluginError("broken_configuration", errorMessage(error));
        }
    }

    private async updatePackageResolve(
        installed: Awaited<ReturnType<typeof pluginInstallationGetSource>>,
        onProgress: (
            stage: string,
            detail: string,
            bytes?: { receivedBytes: number; totalBytes?: number },
        ) => void,
        signal?: AbortSignal,
    ): Promise<{ plugin: PluginPackage; cleanup(): Promise<void> }> {
        if (installed.source.kind === "builtin") {
            const plugin = this.catalog.get(installed.source.reference);
            if (!plugin)
                throw new PluginError("not_found", "Built-in plugin is no longer in the catalog");
            return { plugin, async cleanup() {} };
        }
        const source = remotePluginSourceFromInstalled(installed.source);
        onProgress("downloading", "Downloading the current remote plugin package.");
        const downloaded = await this.archiveDownloader.download(source.archiveUrl, {
            signal,
            onProgress: (bytes) => onProgress("downloading", "Downloading remote package.", bytes),
        });
        const directory = await this.packages.createDownloadDirectory();
        try {
            onProgress("verifying", "Verifying the current remote plugin package.");
            const candidates = await pluginArchiveExtract(
                downloaded.body,
                directory,
                source.kind === "github" ? "github" : "zip",
            );
            const candidate =
                source.packagePath === undefined
                    ? candidates[0]
                    : candidates.find(({ packagePath }) => packagePath === source.packagePath);
            if (!candidate)
                throw new PluginError(
                    "invalid_package",
                    "The installed plugin path no longer exists remotely",
                );
            const plugin = await pluginPackageLoadSource(candidate.directory, installed.source);
            return {
                plugin,
                cleanup: () => this.packages.removeDownloadDirectory(directory),
            };
        } catch (error) {
            await this.packages.removeDownloadDirectory(directory);
            throw error;
        }
    }

    private async prepareRequestedArchive(
        archive: Buffer,
        source: Parameters<PluginPackageStore["prepareArchive"]>[1],
    ) {
        try {
            return await this.packages.prepareArchive(archive, source);
        } catch (error) {
            if (error instanceof PluginError) throw error;
            throw new PluginError("broken_configuration", errorMessage(error));
        }
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

    async requestInstallLink(input: {
        requesterInstallationId: string;
        agentCall: PluginAgentCallContext;
        url: string;
        reason?: string;
    }): Promise<PluginManagementRequestSummary> {
        const downloaded = await this.downloadPackage(input.url);
        const prepared = await this.prepareRequestedArchive(downloaded.body, {
            kind: "link",
            reference: downloaded.url,
        });
        const requestId = createId();
        try {
            if (prepared.plugin.manifest.variables.length)
                throw new PluginError(
                    "broken_configuration",
                    "Plugins that require configuration must be installed directly by an administrator",
                );
            const container = effectiveContainer(prepared.plugin.manifest);
            if (container && !container.dockerfile)
                throw new PluginError(
                    "broken_configuration",
                    "Plugins that require an administrator-selected image cannot be requested from chat",
                );
            const packageDirectory = await this.packages.stageRequest(prepared.plugin, requestId);
            try {
                const result = await pluginManagementRequestCreateInstall(this.executor, {
                    id: requestId,
                    actorUserId: input.agentCall.actorUserId,
                    agentUserId: input.agentCall.agentUserId,
                    callId: input.agentCall.callId,
                    chatId: input.agentCall.chatId,
                    requesterInstallationId: input.requesterInstallationId,
                    displayName: prepared.plugin.manifest.displayName,
                    shortName: prepared.plugin.manifest.shortName,
                    description: prepared.plugin.manifest.description,
                    reason: input.reason,
                    sourceKind: "link",
                    sourceReference: downloaded.url,
                    packageDigest: prepared.plugin.packageDigest,
                    packageDirectory,
                    installationId: createId(),
                });
                if (!result.created) await this.packages.removeRequest(requestId);
                if (result.hint) await this.publish(result.hint).catch(this.onError);
                return result.request;
            } catch (error) {
                await this.packages.removeRequest(requestId);
                throw error;
            }
        } finally {
            await prepared.cleanup();
        }
    }

    async requestUninstall(input: {
        requesterInstallationId: string;
        agentCall: PluginAgentCallContext;
        targetInstallationId: string;
        reason?: string;
    }): Promise<PluginManagementRequestSummary> {
        const target = await pluginInstallationGetRequestUninstallContext(
            this.executor,
            input.targetInstallationId,
        );
        const plugin = await this.packages.loadInstalled(
            target.pluginId,
            target.packageDirectory,
            target.shortName,
            target.packageDigest,
            target.source,
        );
        const requestId = createId();
        const packageDirectory = await this.packages.stageRequest(plugin, requestId);
        try {
            const result = await pluginManagementRequestCreateUninstall(this.executor, {
                id: requestId,
                actorUserId: input.agentCall.actorUserId,
                agentUserId: input.agentCall.agentUserId,
                callId: input.agentCall.callId,
                chatId: input.agentCall.chatId,
                requesterInstallationId: input.requesterInstallationId,
                targetInstallationId: input.targetInstallationId,
                displayName: target.displayName,
                shortName: target.shortName,
                description: target.description,
                reason: input.reason,
                source: target.source,
                packageDigest: target.packageDigest,
                packageDirectory,
            });
            if (!result.created) await this.packages.removeRequest(requestId);
            if (result.hint) await this.publish(result.hint).catch(this.onError);
            return result.request;
        } catch (error) {
            await this.packages.removeRequest(requestId);
            throw error;
        }
    }

    listManagementRequests(
        actorUserId: string,
        chatId: string,
    ): Promise<PluginManagementRequestSummary[]> {
        return pluginManagementRequestList(this.executor, actorUserId, chatId);
    }

    listDocumentsForHost(actorUserId: string, chatId: string): Promise<DocumentHostSummary[]> {
        return documentListForChatHost(this.executor, actorUserId, chatId);
    }

    getDocumentForHost(
        actorUserId: string,
        chatId: string,
        documentId: string,
    ): Promise<{ document: DocumentHostSummary; snapshot: DocumentSnapshot }> {
        return documentGetForChatHost(this.executor, actorUserId, chatId, documentId);
    }

    async documentCreateForHost(input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        title: string;
        initialUpdate?: string;
    }): Promise<DocumentHostSummary> {
        const result = await documentCreate(this.executor, {
            actorUserId: input.actorUserId,
            attributedCreatorUserId: input.agentUserId,
            chatId: input.chatId,
            title: input.title,
            format: "blocknote",
            ...(input.initialUpdate ? { initialUpdate: input.initialUpdate } : {}),
        });
        await this.publish(result.hint).catch(this.onError);
        return {
            id: result.document.id,
            title: result.document.title,
            format: result.document.format,
            latestSequence: result.document.latestSequence,
            updatedAt: result.document.updatedAt,
        };
    }

    async requestDocumentWriteForHost(
        input: {
            actorUserId: string;
            agentUserId: string;
            requesterInstallationId: string;
            sessionId: string;
            callId: string;
            chatId: string;
            documentId: string;
            clientUpdateId: string;
            baseSequence: string;
            updates: readonly unknown[];
        },
        signal?: AbortSignal,
    ): Promise<
        | {
              status: "approved";
              requestId: string;
              documentId: string;
              acceptedSequence: string;
          }
        | {
              status: "denied" | "failed";
              requestId: string;
              documentId: string;
              message: string;
          }
    > {
        const waitChange = this.activeFunctionDocumentWriteWaits.get(
            pluginAgentCallKey(input.sessionId, input.callId),
        );
        if (!waitChange)
            throw new PluginError(
                "forbidden",
                "Plugin document writes require the active function executor",
            );
        await waitChange(true);
        try {
            const created = await documentWriteRequestCreate(this.executor, {
                id: createId(),
                ...input,
                now: Date.now(),
            });
            if (created.hint) await this.publish(created.hint).catch(this.onError);
            for (;;) {
                signal?.throwIfAborted();
                const outcome = await documentWriteRequestAwaitOutcome(
                    this.executor,
                    created.request.id,
                    Date.now(),
                );
                if (outcome.hint) await this.publish(outcome.hint).catch(this.onError);
                if (outcome.request.status === "approved") {
                    if (!outcome.request.acceptedSequence)
                        throw new Error("Approved document write request is missing its sequence");
                    return {
                        status: "approved",
                        requestId: outcome.request.id,
                        documentId: outcome.request.documentId,
                        acceptedSequence: outcome.request.acceptedSequence,
                    };
                }
                if (outcome.request.status === "denied")
                    return {
                        status: "denied",
                        requestId: outcome.request.id,
                        documentId: outcome.request.documentId,
                        message: "Document write was denied by a chat member.",
                    };
                if (outcome.request.status === "failed")
                    return {
                        status: "failed",
                        requestId: outcome.request.id,
                        documentId: outcome.request.documentId,
                        message: outcome.request.lastError ?? "Document write approval failed.",
                    };
                await abortablePluginDelay(DOCUMENT_WRITE_OUTCOME_POLL_MS, signal);
            }
        } finally {
            await waitChange(false);
        }
    }

    async managementRequestImage(input: {
        actorUserId: string;
        chatId: string;
        requestId: string;
    }): Promise<Buffer> {
        const request = await pluginManagementRequestGetPackage(
            this.executor,
            input.actorUserId,
            input.chatId,
            input.requestId,
        );
        return this.packages.readRequestImage(
            request.id,
            request.packageDirectory,
            request.source,
            request.packageDigest,
        );
    }

    async approveManagementRequest(input: {
        actorUserId: string;
        chatId: string;
        requestId: string;
    }): Promise<PluginManagementRequestSummary> {
        const work = await pluginManagementRequestBeginInstall(this.executor, input);
        await this.publish(work.hint).catch(this.onError);
        try {
            const plugin = await this.packages.loadRequest(
                work.id,
                work.packageDirectory,
                work.source,
                work.packageDigest,
            );
            await this.installPackage({
                actorUserId: input.actorUserId,
                installationId: work.installationId,
                plugin,
                variables: {},
                permissions: [],
            });
        } catch (error) {
            const hint = await pluginManagementRequestCompleteInstall(this.executor, {
                ...input,
                installationId: work.installationId,
                error: errorMessage(error),
            });
            await this.publish(hint).catch(this.onError);
            await this.packages.removeRequest(input.requestId).catch(this.onError);
            throw error;
        }
        const hint = await pluginManagementRequestCompleteInstall(this.executor, {
            ...input,
            installationId: work.installationId,
        });
        await this.publish(hint).catch(this.onError);
        await this.packages.removeRequest(input.requestId).catch(this.onError);
        const requests = await pluginManagementRequestList(
            this.executor,
            input.actorUserId,
            input.chatId,
        );
        const request = requests.find(({ id }) => id === input.requestId);
        if (!request) throw new Error("Completed plugin management request was not found");
        return request;
    }

    async denyManagementRequest(input: {
        actorUserId: string;
        chatId: string;
        requestId: string;
        action: "install" | "uninstall";
    }): Promise<PluginManagementRequestSummary> {
        const hint = await pluginManagementRequestDeny(this.executor, input);
        await this.publish(hint).catch(this.onError);
        await this.packages.removeRequest(input.requestId).catch(this.onError);
        const requests = await pluginManagementRequestList(
            this.executor,
            input.actorUserId,
            input.chatId,
        );
        const request = requests.find(({ id }) => id === input.requestId);
        if (!request) throw new Error("Denied plugin management request was not found");
        return request;
    }

    async approveUninstallManagementRequest(input: {
        actorUserId: string;
        chatId: string;
        requestId: string;
    }): Promise<PluginManagementRequestSummary> {
        const work = await pluginManagementRequestBeginUninstall(this.executor, input);
        await this.publish(work.hint).catch(this.onError);
        try {
            await this.uninstallInstallation({
                actorUserId: input.actorUserId,
                installationId: work.targetInstallationId,
            });
        } catch (error) {
            const hint = await pluginManagementRequestCompleteUninstall(this.executor, {
                ...input,
                error: errorMessage(error),
            });
            await this.publish(hint).catch(this.onError);
            await this.packages.removeRequest(input.requestId).catch(this.onError);
            throw error;
        }
        const hint = await pluginManagementRequestCompleteUninstall(this.executor, input);
        await this.publish(hint).catch(this.onError);
        await this.packages.removeRequest(input.requestId).catch(this.onError);
        const requests = await pluginManagementRequestList(
            this.executor,
            input.actorUserId,
            input.chatId,
        );
        const request = requests.find(({ id }) => id === input.requestId);
        if (!request) throw new Error("Completed plugin uninstall request was not found");
        return request;
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
        const tools = (await pluginMcpToolsListReady(this.executor)).filter((tool) =>
            mcpAppToolVisibleTo(tool.meta, "model"),
        );
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
        context: PluginCallContext,
        signal?: AbortSignal,
    ): Promise<PluginFunctionResult> {
        try {
            const agentCall = await pluginAgentCallContextGet(
                this.executor,
                context.sessionId,
                context.callId,
            );
            return await withOperationTimeout(
                FUNCTION_EXECUTION_TIMEOUT_MS,
                "Plugin MCP function execution",
                signal,
                async (operationSignal, timeout) => {
                    const key = pluginAgentCallKey(context.sessionId, context.callId);
                    let waitCount = 0;
                    let leaseTransition = Promise.resolve();
                    const waitChange = (waiting: boolean): Promise<void> => {
                        if (waiting) waitCount += 1;
                        else {
                            if (waitCount === 0) return leaseTransition;
                            waitCount -= 1;
                        }
                        const changed = waiting ? waitCount === 1 : waitCount === 0;
                        if (!changed) return leaseTransition;
                        timeout.timeoutReset(
                            waiting
                                ? DOCUMENT_WRITE_FUNCTION_TIMEOUT_MS
                                : FUNCTION_EXECUTION_TIMEOUT_MS,
                        );
                        leaseTransition = leaseTransition.then(() =>
                            context.documentWriteWaitChange?.(waiting),
                        );
                        return leaseTransition;
                    };
                    this.activeFunctionDocumentWriteWaits.set(key, waitChange);
                    try {
                        return await this.callFunctionWithSignal(
                            functionName,
                            args,
                            context,
                            agentCall,
                            operationSignal,
                        );
                    } finally {
                        this.activeFunctionDocumentWriteWaits.delete(key);
                    }
                },
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
        context: PluginCallContext,
        agentCall: PluginAgentCallContext & { userMessageId: string },
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
        if (!mcpAppToolVisibleTo(cached.meta, "model"))
            throw new Error("The plugin function is not visible to the model");
        const appUi = mcpAppToolUi(cached.meta);
        const argumentsValue = jsonArguments(args);
        if (appUi.resourceUri) {
            const hint = await pluginMcpAppBegin(this.executor, {
                sessionId: agentCall.sessionId,
                callId: agentCall.callId,
                userMessageId: agentCall.userMessageId,
                agentUserId: agentCall.agentUserId,
                installationId,
                toolName: cached.name,
                resourceUri: appUi.resourceUri,
                arguments: argumentsValue,
            });
            if (hint) await this.publish(hint).catch(this.onError);
        }
        const chatToken = await this.tokens.issuePluginChatToken({
            installationId,
            chatId: context.chatId,
            actorUserId: context.triggeredByUserId,
            agentUserId: context.agentUserId,
        });
        const viewerToken = await this.tokens.issuePluginUserToken({
            installationId,
            userId: context.triggeredByUserId,
        });
        const referencedUsers = await Promise.all(
            context.users.map(async (user) => ({
                ...user,
                token:
                    user.id === context.triggeredByUserId
                        ? viewerToken
                        : await this.tokens.issuePluginUserToken({
                              installationId,
                              userId: user.id,
                          }),
            })),
        );
        const result = await this.withClient(installationId, signal, agentCall, async (client) => {
            try {
                const result = await client.callTool({
                    name: cached.name,
                    arguments: argumentsValue,
                    _meta: {
                        [PLUGIN_CHAT_META_KEY]: {
                            id: context.chatId,
                            token: chatToken,
                            triggeredByUserId: context.triggeredByUserId,
                        },
                        [PLUGIN_VIEWER_META_KEY]: {
                            id: context.triggeredByUserId,
                            token: viewerToken,
                        },
                        [PLUGIN_USERS_META_KEY]: referencedUsers,
                    },
                });
                const resourceLinkHint = await pluginResourceLinkReplaceForCall(this.executor, {
                    sessionId: agentCall.sessionId,
                    callId: agentCall.callId,
                    userMessageId: agentCall.userMessageId,
                    agentUserId: agentCall.agentUserId,
                    installationId,
                    toolName: cached.name,
                    result,
                });
                if (resourceLinkHint) await this.publish(resourceLinkHint).catch(this.onError);
                if (appUi.resourceUri) {
                    const hint = await pluginMcpAppComplete(this.executor, {
                        sessionId: agentCall.sessionId,
                        callId: agentCall.callId,
                        status: result.isError ? "failed" : "completed",
                        result,
                    });
                    if (hint) await this.publish(hint).catch(this.onError);
                }
                if (result.isError)
                    return {
                        status: "failed" as const,
                        error: {
                            code: "plugin_mcp_error",
                            message: mcpErrorMessage(result.content),
                            data: appUi.resourceUri ? modelVisibleMcpResult(result) : result,
                        },
                    };
                return {
                    status: "completed" as const,
                    output: appUi.resourceUri ? modelVisibleMcpResult(result) : result,
                };
            } catch (error) {
                if (appUi.resourceUri) {
                    const hint = await pluginMcpAppComplete(this.executor, {
                        sessionId: agentCall.sessionId,
                        callId: agentCall.callId,
                        status: "failed",
                        result: {
                            isError: true,
                            content: [{ type: "text", text: errorMessage(error) }],
                        },
                    });
                    if (hint) await this.publish(hint).catch(this.onError);
                }
                throw error;
            }
        });
        if (!result) throw new Error("The plugin does not expose MCP tools");
        return result;
    }

    async getMcpApp(input: {
        actorUserId: string;
        assistantMessageId: string;
        callId: string;
        signal?: AbortSignal;
    }) {
        return this.withMcpAppOperation(
            input.actorUserId,
            "MCP App load",
            input.signal,
            async () => {
                const app = await pluginMcpAppGet(
                    this.executor,
                    input.actorUserId,
                    input.assistantMessageId,
                    input.callId,
                );
                const resource = await pluginMcpAppResourceGet(
                    this.executor,
                    app.installationId,
                    app.resourceUri,
                );
                return {
                    app: {
                        callId: app.callId,
                        toolName: app.toolName,
                        resourceUri: app.resourceUri,
                        arguments: app.arguments,
                        status: app.status,
                        ...(app.result ? { result: app.result } : {}),
                    },
                    resource: {
                        html: resource.html,
                        contentHashSha256: resource.contentHashSha256,
                        meta: {
                            ui: {
                                ...(resource.csp ? { csp: resource.csp } : {}),
                                ...(resource.permissions
                                    ? { permissions: resource.permissions }
                                    : {}),
                                ...(resource.domain ? { domain: resource.domain } : {}),
                                ...(resource.prefersBorder === undefined
                                    ? {}
                                    : { prefersBorder: resource.prefersBorder }),
                            },
                        },
                    },
                };
            },
        );
    }

    async callMcpAppTool(input: {
        actorUserId: string;
        assistantMessageId: string;
        callId: string;
        name: string;
        arguments: Readonly<Record<string, unknown>>;
        signal?: AbortSignal;
    }) {
        return this.withMcpAppOperation(
            input.actorUserId,
            "MCP App tool execution",
            input.signal,
            async (operationSignal) => {
                const app = await pluginMcpAppGet(
                    this.executor,
                    input.actorUserId,
                    input.assistantMessageId,
                    input.callId,
                );
                const tool = (await pluginMcpToolsListReady(this.executor)).find(
                    (candidate) =>
                        candidate.installationId === app.installationId &&
                        candidate.name === input.name,
                );
                if (!tool || !mcpAppToolVisibleTo(tool.meta, "app"))
                    throw new PluginError("forbidden", "MCP tool is not available to this app");
                const chatToken = await this.tokens.issuePluginChatToken({
                    installationId: app.installationId,
                    chatId: app.chatId,
                    actorUserId: input.actorUserId,
                    agentUserId: app.agentUserId,
                });
                const userToken = await this.tokens.issuePluginUserToken({
                    installationId: app.installationId,
                    userId: input.actorUserId,
                });
                const result = await this.withClient(
                    app.installationId,
                    operationSignal,
                    undefined,
                    (client) =>
                        client.callTool({
                            name: tool.name,
                            arguments: input.arguments,
                            _meta: {
                                [PLUGIN_CHAT_META_KEY]: {
                                    id: app.chatId,
                                    token: chatToken,
                                    triggeredByUserId: input.actorUserId,
                                },
                                [PLUGIN_VIEWER_META_KEY]: {
                                    id: input.actorUserId,
                                    token: userToken,
                                },
                                [PLUGIN_USERS_META_KEY]: [
                                    {
                                        ...app.actor,
                                        triggeredTurn: false,
                                        token: userToken,
                                    },
                                ],
                            },
                        }),
                );
                if (!result) throw new PluginError("not_found", "Plugin does not expose MCP tools");
                return result;
            },
        );
    }

    async readMcpAppResource(input: {
        actorUserId: string;
        assistantMessageId: string;
        callId: string;
        uri: string;
        signal?: AbortSignal;
    }) {
        if (!input.uri || input.uri.length > 2_048)
            throw new PluginError("broken_configuration", "MCP resource URI is invalid");
        return this.withMcpAppOperation(
            input.actorUserId,
            "MCP App resource read",
            input.signal,
            async (operationSignal) => {
                const app = await pluginMcpAppGet(
                    this.executor,
                    input.actorUserId,
                    input.assistantMessageId,
                    input.callId,
                );
                const result = await this.withClient(
                    app.installationId,
                    operationSignal,
                    undefined,
                    (client) => client.readResource({ uri: input.uri }),
                );
                if (!result) throw new PluginError("not_found", "MCP resource was not found");
                const serialized = JSON.stringify(result);
                if (Buffer.byteLength(serialized, "utf8") > MAX_MCP_APP_HTML_BYTES)
                    throw new PluginError("broken_configuration", "MCP resource is too large");
                return result;
            },
        );
    }

    async hostAppInstancePut(input: {
        runtimeToken: string;
        viewerToken?: string;
        chatToken?: string;
        definition: unknown;
    }) {
        const context = await this.authorizeSurfaceHost(
            input.runtimeToken,
            "apps:manage",
            input.viewerToken,
            input.chatToken,
        );
        const result = await pluginAppInstancePut(this.executor, {
            installationId: context.installationId,
            viewerUserId: context.viewerUserId,
            chatId: context.chatId,
            definition: input.definition,
        });
        await this.publish(result.hint).catch(this.onError);
        return { ...result, sync: result.hint };
    }

    async hostAppInstanceContextUpdate(input: {
        runtimeToken: string;
        viewerToken?: string;
        chatToken?: string;
        instanceKey: unknown;
        context: unknown;
    }) {
        const authorization = await this.authorizeSurfaceHost(
            input.runtimeToken,
            "apps:manage",
            input.viewerToken,
            input.chatToken,
        );
        const result = await pluginAppInstanceContextUpdate(this.executor, {
            installationId: authorization.installationId,
            viewerUserId: authorization.viewerUserId,
            chatId: authorization.chatId,
            instanceKey: input.instanceKey,
            context: input.context,
        });
        await this.publish(result.hint).catch(this.onError);
        return { ...result, sync: result.hint };
    }

    async hostAppInstanceDelete(input: {
        runtimeToken: string;
        viewerToken?: string;
        chatToken?: string;
        instanceKey: unknown;
    }) {
        const authorization = await this.authorizeSurfaceHost(
            input.runtimeToken,
            "apps:manage",
            input.viewerToken,
            input.chatToken,
        );
        const result = await pluginAppInstanceDelete(this.executor, {
            installationId: authorization.installationId,
            viewerUserId: authorization.viewerUserId,
            chatId: authorization.chatId,
            instanceKey: input.instanceKey,
        });
        if (result.hint) await this.publish(result.hint).catch(this.onError);
        return { ...result, ...(result.hint ? { sync: result.hint } : {}) };
    }

    async hostContributionPut(input: {
        runtimeToken: string;
        viewerToken?: string;
        chatToken?: string;
        definition: unknown;
    }) {
        const context = await this.authorizeSurfaceHost(
            input.runtimeToken,
            "contributions:manage",
            input.viewerToken,
            input.chatToken,
        );
        const result = await pluginContributionPut(this.executor, {
            installationId: context.installationId,
            viewerUserId: context.viewerUserId,
            chatId: context.chatId,
            definition: input.definition,
        });
        await this.publish(result.hint).catch(this.onError);
        return { ...result, sync: result.hint };
    }

    async hostContributionDelete(input: {
        runtimeToken: string;
        viewerToken?: string;
        chatToken?: string;
        externalKey: unknown;
    }) {
        const authorization = await this.authorizeSurfaceHost(
            input.runtimeToken,
            "contributions:manage",
            input.viewerToken,
            input.chatToken,
        );
        const result = await pluginContributionDelete(this.executor, {
            installationId: authorization.installationId,
            viewerUserId: authorization.viewerUserId,
            chatId: authorization.chatId,
            externalKey: input.externalKey,
        });
        if (result.hint) await this.publish(result.hint).catch(this.onError);
        return { ...result, ...(result.hint ? { sync: result.hint } : {}) };
    }

    async listAppInstances(viewerUserId: string) {
        return pluginAppInstanceList(this.executor, viewerUserId);
    }

    async getAppInstance(viewerUserId: string, instanceId: string) {
        return this.withMcpAppOperation(
            viewerUserId,
            "Persistent MCP App load",
            undefined,
            async () => {
                const app = await pluginAppInstanceGet(this.executor, viewerUserId, instanceId);
                if (!app.available)
                    throw new PluginError("not_ready", "MCP App instance is unavailable");
                const resource = await pluginAppInstanceResourceGet(
                    this.executor,
                    viewerUserId,
                    instanceId,
                );
                return {
                    app,
                    resource: {
                        html: resource.html,
                        contentHashSha256: resource.contentHashSha256,
                        ...(resource.csp ? { csp: resource.csp } : {}),
                        ...(resource.permissions ? { permissions: resource.permissions } : {}),
                        ...(resource.domain ? { domain: resource.domain } : {}),
                        ...(resource.prefersBorder === undefined
                            ? {}
                            : { prefersBorder: resource.prefersBorder }),
                    },
                    hostContext: {
                        [PLUGIN_INSTANCE_META_KEY]: {
                            id: app.id,
                            key: app.instanceKey,
                            context: app.context,
                            dataRevision: app.dataRevision,
                            definitionRevision: app.revision,
                        },
                    },
                };
            },
        );
    }

    async callAppInstanceTool(input: {
        viewerUserId: string;
        instanceId: string;
        toolName: string;
        arguments: Readonly<Record<string, unknown>>;
        signal?: AbortSignal;
    }) {
        boundedJson(input.arguments, "MCP App tool arguments", MAX_SURFACE_ARGUMENT_BYTES);
        return this.withMcpAppOperation(
            input.viewerUserId,
            "Persistent MCP App tool execution",
            input.signal,
            async (signal) => {
                const app = await pluginAppInstanceGet(
                    this.executor,
                    input.viewerUserId,
                    input.instanceId,
                );
                if (!app.available)
                    throw new PluginError("not_ready", "MCP App instance is unavailable");
                const result = await this.callSurfaceTool({
                    viewerUserId: input.viewerUserId,
                    installationId: app.installationId,
                    toolName: input.toolName,
                    arguments: input.arguments,
                    chatId: app.chatId,
                    instance: { id: app.id, key: app.instanceKey },
                    signal,
                });
                return result;
            },
        );
    }

    async readAppInstanceResource(input: {
        viewerUserId: string;
        instanceId: string;
        uri: string;
        signal?: AbortSignal;
    }) {
        if (!validMcpResourceUri(input.uri))
            throw new PluginError("broken_configuration", "MCP resource URI is invalid");
        return this.withMcpAppOperation(
            input.viewerUserId,
            "Persistent MCP App resource read",
            input.signal,
            async (signal) => {
                const app = await pluginAppInstanceGet(
                    this.executor,
                    input.viewerUserId,
                    input.instanceId,
                );
                if (!app.available)
                    throw new PluginError("not_ready", "MCP App instance is unavailable");
                const result = await this.withClient(
                    app.installationId,
                    signal,
                    undefined,
                    (client) => client.readResource({ uri: input.uri }),
                );
                if (!result) throw new PluginError("not_found", "MCP resource was not found");
                boundedJson(result, "MCP resource result", MAX_MCP_APP_HTML_BYTES);
                return result;
            },
        );
    }

    async listContributions(input: { viewerUserId: string; chatId?: string }) {
        return pluginContributionList(this.executor, input);
    }

    async invokeContribution(input: {
        viewerUserId: string;
        contributionId: string;
        actionId: string;
        value?: unknown;
        chatId?: string;
        messageId?: string;
        signal?: AbortSignal;
    }) {
        return this.withMcpAppOperation(
            input.viewerUserId,
            "Plugin contribution execution",
            input.signal,
            async (signal) => {
                const context = await this.contributionContext(input);
                const action = await this.contributionAction(
                    context.contribution,
                    input.actionId,
                    input.value,
                    context,
                    signal,
                );
                const result = await this.callSurfaceTool({
                    viewerUserId: input.viewerUserId,
                    installationId: context.contribution.installationId,
                    toolName: action.toolName,
                    arguments: action.arguments,
                    chatId: context.chatId,
                    messageId: context.messageId,
                    contribution: {
                        id: context.contribution.id,
                        key: context.contribution.externalKey,
                        placement: context.contribution.location,
                        revision: context.contribution.revision,
                    },
                    signal,
                });
                const openApp = action.openApp
                    ? await this.contributionAppOpen(
                          input.viewerUserId,
                          context.contribution.installationId,
                          action.openApp.instanceKey,
                          action.openApp.presentation,
                      )
                    : undefined;
                return { result, ...(openApp ? { openApp } : {}) };
            },
        );
    }

    async resolveContributionMenu(input: {
        viewerUserId: string;
        contributionId: string;
        chatId?: string;
        messageId?: string;
        signal?: AbortSignal;
    }): Promise<{ items: PluginButtonControl[]; revision: number }> {
        return this.withMcpAppOperation(
            input.viewerUserId,
            "Plugin contribution menu resolution",
            input.signal,
            async (signal) => {
                const context = await this.contributionContext(input);
                if (context.contribution.spec.kind !== "asyncMenu")
                    throw new PluginError("not_found", "Async contribution menu was not found");
                const items = await this.resolveMenuItems(context, signal);
                return { items, revision: context.contribution.revision };
            },
        );
    }

    async updateAppPresentation(
        viewerUserId: string,
        input: { instanceId: unknown; hidden: unknown; position?: unknown },
    ) {
        const result = await pluginAppPreferenceUpdate(this.executor, {
            viewerUserId,
            ...input,
        });
        await this.publish(result.hint).catch(this.onError);
        const app = await pluginAppInstanceGet(
            this.executor,
            viewerUserId,
            String(input.instanceId),
        );
        return { app, sync: result.hint };
    }

    async getUiAsset(viewerUserId: string, installationId: string, assetId: string) {
        if (!(await userFindActive(this.executor, viewerUserId)))
            throw new PluginError("not_found", "Plugin UI asset was not found");
        const asset = await pluginUiAssetGet(this.executor, installationId, assetId);
        return {
            body: await this.packages.readUiAsset(asset),
            contentType: asset.contentType,
            checksumSha256: asset.checksumSha256,
        };
    }

    private async authorizeSurfaceHost(
        runtimeToken: string,
        permission: "apps:manage" | "contributions:manage",
        viewerToken?: string,
        chatToken?: string,
    ): Promise<{ installationId: string; viewerUserId?: string; chatId?: string }> {
        const runtime = await this.authorizeHost(runtimeToken, permission);
        let viewerUserId: string | undefined;
        if (viewerToken) {
            let viewer: Awaited<ReturnType<TokenService["verifyPluginUserToken"]>>;
            try {
                viewer = await this.tokens.verifyPluginUserToken(viewerToken);
            } catch {
                throw new PluginError("forbidden", "Plugin viewer token is invalid");
            }
            if (viewer.installationId !== runtime.installationId)
                throw new PluginError(
                    "forbidden",
                    "Plugin viewer token belongs to another installation",
                );
            viewerUserId = viewer.userId;
        }
        let chatId: string | undefined;
        if (chatToken) {
            let chat: Awaited<ReturnType<TokenService["verifyPluginChatToken"]>>;
            try {
                chat = await this.tokens.verifyPluginChatToken(chatToken);
            } catch {
                throw new PluginError("forbidden", "Plugin chat token is invalid");
            }
            if (chat.installationId !== runtime.installationId)
                throw new PluginError(
                    "forbidden",
                    "Plugin chat token belongs to another installation",
                );
            if (viewerUserId && chat.actorUserId !== viewerUserId)
                throw new PluginError(
                    "forbidden",
                    "Plugin viewer and chat tokens belong to different actors",
                );
            if (!viewerUserId) viewerUserId = chat.actorUserId;
            chatId = chat.chatId;
        }
        return {
            installationId: runtime.installationId,
            ...(viewerUserId ? { viewerUserId } : {}),
            ...(chatId ? { chatId } : {}),
        };
    }

    private async contributionContext(input: {
        viewerUserId: string;
        contributionId: string;
        chatId?: string;
        messageId?: string;
    }) {
        let chatId = input.chatId;
        if (input.messageId) {
            const message = await messageGet(this.executor, input.viewerUserId, input.messageId);
            if (message.deletedAt)
                throw new PluginError("not_found", "Contribution message was not found");
            if (chatId && chatId !== message.chatId)
                throw new PluginError("forbidden", "Contribution message belongs to another chat");
            chatId = message.chatId;
        }
        const contribution = (
            await pluginContributionList(this.executor, {
                viewerUserId: input.viewerUserId,
                ...(chatId ? { chatId } : {}),
            })
        ).find((candidate) => candidate.id === input.contributionId);
        if (!contribution) throw new PluginError("not_found", "Plugin contribution was not found");
        if (!contribution.available)
            throw new PluginError("not_ready", "Plugin contribution is unavailable");
        if (contribution.location === "messageMenu") {
            if (!input.messageId)
                throw new PluginError("forbidden", "Message contribution requires a message");
        } else if (
            contribution.location === "chatMenu" ||
            contribution.location === "composerIcon" ||
            contribution.location === "composerMenu"
        ) {
            if (!chatId) throw new PluginError("forbidden", "Chat contribution requires a chat");
            if (input.messageId)
                throw new PluginError(
                    "forbidden",
                    "Only message menu contributions accept a message",
                );
        } else if (chatId || input.messageId) {
            throw new PluginError(
                "forbidden",
                "This contribution does not accept chat or message context",
            );
        }
        return {
            viewerUserId: input.viewerUserId,
            contribution,
            ...(chatId ? { chatId } : {}),
            ...(input.messageId ? { messageId: input.messageId } : {}),
        };
    }

    private async contributionAction(
        contribution: Awaited<ReturnType<typeof pluginContributionList>>[number],
        actionId: string,
        value: unknown,
        context: { viewerUserId: string; chatId?: string; messageId?: string },
        signal: AbortSignal,
    ): Promise<{
        toolName: string;
        arguments: Record<string, unknown>;
        openApp?: PluginToolAction["openApp"];
    }> {
        if (contribution.spec.kind === "asyncMenu") {
            const items = await this.resolveMenuItems({ contribution, ...context }, signal);
            const item = items.find((candidate) => candidate.id === actionId);
            if (!item) throw new PluginError("not_found", "Contribution action was not found");
            return contributionControlAction(item, value);
        }
        const control = contributionControlFind(contribution.spec, actionId);
        if (!control) throw new PluginError("not_found", "Contribution action was not found");
        return contributionControlAction(control, value);
    }

    private async resolveMenuItems(
        context: {
            contribution: Awaited<ReturnType<typeof pluginContributionList>>[number];
            viewerUserId: string;
            chatId?: string;
            messageId?: string;
        },
        signal: AbortSignal,
    ): Promise<PluginButtonControl[]> {
        if (context.contribution.spec.kind !== "asyncMenu")
            throw new PluginError("not_found", "Async contribution menu was not found");
        const result = await this.callSurfaceTool({
            viewerUserId: context.viewerUserId,
            installationId: context.contribution.installationId,
            toolName: context.contribution.spec.resolverToolName,
            arguments: {},
            chatId: context.chatId,
            messageId: context.messageId,
            contribution: {
                id: context.contribution.id,
                key: context.contribution.externalKey,
                placement: context.contribution.location,
                revision: context.contribution.revision,
            },
            signal,
        });
        const items = asyncMenuItems(result);
        await pluginContributionDependenciesRequire(
            this.executor,
            {
                installationId: context.contribution.installationId,
                pluginId: context.contribution.pluginId,
            },
            {
                kind: "staticMenu",
                id: context.contribution.spec.id,
                title: context.contribution.spec.title,
                description: context.contribution.spec.description,
                items,
            },
        );
        return items;
    }

    private async contributionAppOpen(
        viewerUserId: string,
        installationId: string,
        instanceKey: string,
        presentation: "primary" | "modal" | "fullscreen",
    ): Promise<{ instanceId: string; presentation: "primary" | "modal" | "fullscreen" }> {
        const app = (await pluginAppInstanceList(this.executor, viewerUserId)).find(
            (candidate) =>
                candidate.installationId === installationId &&
                candidate.instanceKey === instanceKey &&
                candidate.available,
        );
        if (!app) throw new PluginError("not_found", "Contribution app target was not found");
        return { instanceId: app.id, presentation };
    }

    private async callSurfaceTool(input: {
        viewerUserId: string;
        installationId: string;
        toolName: string;
        arguments: Readonly<Record<string, unknown>>;
        chatId?: string;
        messageId?: string;
        instance?: { id: string; key: string };
        contribution?: {
            id: string;
            key: string;
            placement: string;
            revision: number;
        };
        signal: AbortSignal;
    }) {
        boundedJson(input.arguments, "Plugin surface tool arguments", MAX_SURFACE_ARGUMENT_BYTES);
        const tool = (await pluginMcpToolsListReady(this.executor)).find(
            (candidate) =>
                candidate.installationId === input.installationId &&
                candidate.name === input.toolName,
        );
        if (!tool || !mcpAppToolVisibleTo(tool.meta, "app"))
            throw new PluginError("forbidden", "MCP tool is not available to this app");
        const meta = await this.surfaceCallMeta(input);
        const result = await this.withClient(
            input.installationId,
            input.signal,
            undefined,
            (client) =>
                client.callTool({
                    name: tool.name,
                    arguments: input.arguments,
                    _meta: meta,
                }),
        );
        if (!result) throw new PluginError("not_found", "Plugin does not expose MCP tools");
        boundedJson(result, "Plugin surface tool result", MAX_SURFACE_RESULT_BYTES);
        return result;
    }

    private async surfaceCallMeta(input: {
        viewerUserId: string;
        installationId: string;
        chatId?: string;
        messageId?: string;
        instance?: { id: string; key: string };
        contribution?: { id: string; key: string; placement: string; revision: number };
    }): Promise<Record<string, unknown>> {
        const actor = await userFindActive(this.executor, input.viewerUserId);
        if (!actor) throw new PluginError("not_found", "Plugin surface viewer was not found");
        const viewerToken = await this.tokens.issuePluginUserToken({
            installationId: input.installationId,
            userId: input.viewerUserId,
        });
        const chatToken = input.chatId
            ? await this.tokens.issuePluginChatToken({
                  installationId: input.installationId,
                  chatId: input.chatId,
                  actorUserId: input.viewerUserId,
                  agentUserId: input.viewerUserId,
              })
            : undefined;
        const messageToken = input.messageId
            ? await this.tokens.issuePluginMessageToken({
                  installationId: input.installationId,
                  messageId: input.messageId,
                  actorUserId: input.viewerUserId,
              })
            : undefined;
        return {
            [PLUGIN_VIEWER_META_KEY]: { id: input.viewerUserId, token: viewerToken },
            ...(input.chatId && chatToken
                ? {
                      [PLUGIN_CHAT_META_KEY]: {
                          id: input.chatId,
                          token: chatToken,
                          triggeredByUserId: input.viewerUserId,
                      },
                  }
                : {}),
            ...(input.messageId && messageToken
                ? {
                      [PLUGIN_MESSAGE_META_KEY]: { id: input.messageId, token: messageToken },
                  }
                : {}),
            ...(input.instance ? { [PLUGIN_INSTANCE_META_KEY]: input.instance } : {}),
            ...(input.contribution
                ? {
                      [PLUGIN_CONTRIBUTION_META_KEY]: {
                          ...input.contribution,
                          ...(input.chatId ? { chatId: input.chatId } : {}),
                          ...(input.messageId ? { messageId: input.messageId } : {}),
                      },
                  }
                : {}),
            [PLUGIN_USERS_META_KEY]: [
                {
                    id: actor.id,
                    username: actor.username,
                    firstName: actor.firstName,
                    ...(actor.lastName ? { lastName: actor.lastName } : {}),
                    kind: actor.kind,
                    triggeredTurn: false,
                    token: viewerToken,
                },
            ],
        };
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

    async authorizeHost(
        token: string,
        permission: PluginHostPermission,
    ): Promise<Awaited<ReturnType<TokenService["verifyPluginRuntimeToken"]>>> {
        return this.authorizeHostPermissions(token, [permission]);
    }

    private async authorizeHostPermissions(
        token: string,
        permissions: readonly PluginHostPermission[],
    ): Promise<Awaited<ReturnType<TokenService["verifyPluginRuntimeToken"]>>> {
        let claims: Awaited<ReturnType<TokenService["verifyPluginRuntimeToken"]>>;
        try {
            claims = await this.tokens.verifyPluginRuntimeToken(token);
        } catch {
            throw new PluginError("forbidden", "Plugin runtime token is invalid");
        }
        if (claims.agentCall) {
            const active = await pluginAgentCallContextGet(
                this.executor,
                claims.agentCall.sessionId,
                claims.agentCall.callId,
            ).catch(() => undefined);
            if (
                !active ||
                active.actorUserId !== claims.agentCall.actorUserId ||
                active.agentUserId !== claims.agentCall.agentUserId ||
                active.chatId !== claims.agentCall.chatId
            )
                throw new PluginError(
                    "forbidden",
                    "Plugin agent-call capability is no longer active",
                );
        }
        for (const permission of permissions)
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
        return claims;
    }

    async chatUpdate(
        runtimeToken: string,
        chatToken: string,
        input: { title?: string; description?: string | null },
    ): Promise<{ chat: ChatMetadataSummary; sync: MutationHint }> {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "chats:update");
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

    async chatArchive(runtimeToken: string, chatToken: string) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "chats:archive");
        const result = await channelSetArchived(this.executor, {
            actorUserId: claims.actorUserId,
            chatId: claims.chatId,
            archived: true,
        });
        await this.publishHints([result.hint], [claims.actorUserId]);
        return { chat: result.chat, sync: result.hint };
    }

    async messageSend(
        runtimeToken: string,
        chatToken: string,
        input: {
            text: string;
            audience: "people" | "agents";
            idempotencyKey?: string;
        },
        agents?: PluginAgentRuntime,
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "messages:send");
        if (input.audience === "agents" && !agents)
            throw new PluginError("not_ready", "AI agents are not enabled on this server");
        const agentTurns =
            input.audience === "agents"
                ? await agents!.prepareTurns({
                      actorUserId: claims.actorUserId,
                      agentUserIds: [],
                      chatId: claims.chatId,
                  })
                : [];
        const result = await messageSend(this.executor, {
            actorUserId: claims.actorUserId,
            chatId: claims.chatId,
            text: input.text,
            audience: input.audience,
            agentTurns,
            clientMutationId: input.idempotencyKey
                ? `${claims.installationId}:${input.idempotencyKey}`
                : undefined,
        });
        if (agentTurns.length) agents!.startTurn(claims.chatId);
        await this.publishHints([result.hint], [claims.actorUserId]);
        return {
            message: result.message,
            token: await this.tokens.issuePluginMessageToken({
                installationId: claims.installationId,
                messageId: result.message.id,
                actorUserId: claims.actorUserId,
            }),
            sync: result.hint,
        };
    }

    async messageHistory(
        runtimeToken: string,
        chatToken: string,
        input: { beforeSequence?: number; afterSequence?: number; limit: number },
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "messages:history");
        return messageList(this.executor, {
            userId: claims.actorUserId,
            chatId: claims.chatId,
            ...input,
        });
    }

    async messageRead(runtimeToken: string, messageId: string, messageToken: string) {
        const claims = await this.authorizeMessage(
            runtimeToken,
            messageToken,
            messageId,
            "messages:read",
        );
        return { message: await messageGet(this.executor, claims.actorUserId, messageId) };
    }

    async messageDelete(runtimeToken: string, messageId: string, messageToken: string) {
        const claims = await this.authorizeMessage(
            runtimeToken,
            messageToken,
            messageId,
            "messages:delete",
        );
        const result = await messageDelete(this.executor, claims.actorUserId, messageId);
        await this.publishHints([result.hint], [claims.actorUserId]);
        return { message: result.message, sync: result.hint };
    }

    async messageReactionSet(
        runtimeToken: string,
        messageId: string,
        messageToken: string,
        input: { emoji?: string; customEmojiId?: string; active: boolean },
    ) {
        const claims = await this.authorizeMessage(
            runtimeToken,
            messageToken,
            messageId,
            input.active ? "reactions:add" : "reactions:remove",
        );
        const result = await messageReactionSet(this.executor, {
            actorUserId: claims.actorUserId,
            messageId,
            ...input,
        });
        await this.publishHints([result.hint], [claims.actorUserId]);
        return { message: result.message, sync: result.hint };
    }

    async search(
        runtimeToken: string,
        chatToken: string,
        input: {
            query: string;
            types: readonly ("user" | "message" | "chat")[];
            cursor?: string;
            limit: number;
        },
    ) {
        const permissions = input.types.map((type): PluginHostPermission => {
            if (type === "user") return "search:users";
            if (type === "message") return "search:messages";
            return "search:chats";
        });
        const claims = await this.authorizeChat(runtimeToken, chatToken, permissions);
        const page = await searchPageGet(this.executor, {
            userId: claims.actorUserId,
            query: input.query,
            types: input.types.map((type) => (type === "chat" ? "channel" : type)),
            cursor: input.cursor,
            limit: input.limit,
        });
        return {
            ...page,
            results: await Promise.all(
                page.results.map(async (result) => {
                    switch (result.type) {
                        case "user":
                            return {
                                ...result,
                                token: await this.tokens.issuePluginUserToken({
                                    installationId: claims.installationId,
                                    userId: result.user.id,
                                }),
                            };
                        case "channel":
                            return {
                                ...result,
                                token: await this.tokens.issuePluginChatToken({
                                    installationId: claims.installationId,
                                    chatId: result.channel.id,
                                    actorUserId: claims.actorUserId,
                                    agentUserId: claims.agentUserId,
                                }),
                            };
                        case "message":
                            return {
                                ...result,
                                token: await this.tokens.issuePluginMessageToken({
                                    installationId: claims.installationId,
                                    messageId: result.message.id,
                                    actorUserId: claims.actorUserId,
                                }),
                            };
                    }
                }),
            ),
        };
    }

    async workspaceFileRead(runtimeToken: string, chatToken: string, path: string) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "workspace:read");
        return {
            file: await this.workspaces.getFileWithHash({
                userId: claims.actorUserId,
                chatId: claims.chatId,
                path,
            }),
        };
    }

    async workspaceFileWrite(
        runtimeToken: string,
        chatToken: string,
        input: { path: string; expectedHash: string | null; content: string },
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "workspace:write");
        return {
            file: await this.workspaces.writeFileByHash({
                userId: claims.actorUserId,
                chatId: claims.chatId,
                ...input,
            }),
        };
    }

    async workspaceCommandRun(
        runtimeToken: string,
        chatToken: string,
        input: { command: string; environment: Readonly<Record<string, string>> },
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "commands:run");
        return {
            command: await this.workspaces.runCommand({
                userId: claims.actorUserId,
                chatId: claims.chatId,
                ...input,
            }),
        };
    }

    async channelMembersUpdate(
        runtimeToken: string,
        chatToken: string,
        input: { add: readonly PluginUserCapability[]; remove: readonly PluginUserCapability[] },
    ): Promise<{
        addedUserIds: string[];
        chatId: string;
        removedUserIds: string[];
        sync: MutationHint[];
    }> {
        const permissions: PluginHostPermission[] = [];
        if (input.add.length) permissions.push("chats:members:add");
        if (input.remove.length) permissions.push("chats:members:remove");
        const claims = await this.authorizeChat(runtimeToken, chatToken, permissions);
        const [addUserIds, removeUserIds] = await Promise.all([
            this.authorizeUsers(claims.installationId, input.add),
            this.authorizeUsers(claims.installationId, input.remove),
        ]);
        const result = await channelMembersUpdate(this.executor, {
            actorUserId: claims.actorUserId,
            chatId: claims.chatId,
            addUserIds,
            removeUserIds,
        });
        await Promise.all(
            result.userHints.map(({ userId, hint }) => this.publishHints([hint], [userId], true)),
        );
        await this.publishHints(result.hints, []);
        return {
            chatId: claims.chatId,
            addedUserIds: addUserIds,
            removedUserIds: removeUserIds,
            sync: result.hints,
        };
    }

    async channelCreate(
        runtimeToken: string,
        chatToken: string,
        input: {
            visibility: "public" | "private";
            name: string;
            description?: string;
            idempotencyKey?: string;
            members: readonly PluginUserCapability[];
            initialMessage?: { audience: "agents" | "people"; text: string };
        },
        agents?: PluginAgentRuntime,
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "channels:create");
        const sourceChat = await chatGetAccess(
            this.executor,
            claims.actorUserId,
            claims.chatId,
            false,
        );
        const projectId = sourceChat?.projectId ?? (await projectDefaultRequire(this.executor)).id;
        const memberUserIds = await this.authorizeUsers(claims.installationId, input.members);
        const clientMutationId = input.idempotencyKey
            ? `${claims.installationId}:${input.idempotencyKey}`
            : undefined;
        if (input.initialMessage?.audience === "agents" && !agents)
            throw new PluginError("not_ready", "AI agents are not enabled on this server");
        const created = await channelCreateWithMembers(this.executor, {
            actorUserId: claims.actorUserId,
            projectId,
            kind: input.visibility === "public" ? "public_channel" : "private_channel",
            name: input.name,
            slug: pluginChannelSlug(input.name),
            topic: input.description,
            memberUserIds,
            clientMutationId,
            ...(input.initialMessage?.audience === "agents"
                ? { defaultAgentUserId: claims.agentUserId }
                : {}),
        });
        const hints = [...created.hints];
        let initialMessage;
        if (input.initialMessage) {
            const agentTurns =
                input.initialMessage.audience === "agents"
                    ? await agents!.prepareTurns({
                          actorUserId: claims.actorUserId,
                          agentUserIds: [],
                          chatId: created.chat.id,
                      })
                    : [];
            const sent = await messageSend(this.executor, {
                actorUserId: claims.actorUserId,
                chatId: created.chat.id,
                text: input.initialMessage.text,
                audience: input.initialMessage.audience,
                agentTurns,
                clientMutationId,
            });
            initialMessage = sent.message;
            hints.push(sent.hint);
            if (agentTurns.length) agents!.startTurn(created.chat.id);
        }
        await this.publishHints(hints, [claims.actorUserId, ...memberUserIds]);
        return {
            chat: created.chat,
            token: await this.tokens.issuePluginChatToken({
                installationId: claims.installationId,
                chatId: created.chat.id,
                actorUserId: claims.actorUserId,
                agentUserId: claims.agentUserId,
            }),
            ...(initialMessage ? { initialMessage } : {}),
            sync: hints,
        };
    }

    async channelCreateChild(
        runtimeToken: string,
        chatToken: string,
        input: {
            name: string;
            description?: string;
            agentModelId?: string;
        },
        agents?: PluginAgentRuntime,
    ) {
        const claims = await this.authorizeChat(runtimeToken, chatToken, "channels:create-child");
        if (input.agentModelId) {
            if (!agents)
                throw new PluginError("not_ready", "AI agents are not enabled on this server");
            await agents.modelRequireAvailable(input.agentModelId);
        }
        const created = await channelCreateChild(this.executor, {
            actorUserId: claims.actorUserId,
            parentChatId: claims.chatId,
            name: input.name,
            slug: pluginChannelSlug(input.name),
            topic: input.description,
            agentModelId: input.agentModelId,
        });
        await this.publishHints([created.hint], created.memberUserIds);
        return {
            chat: created.chat,
            token: await this.tokens.issuePluginChatToken({
                installationId: claims.installationId,
                chatId: created.chat.id,
                actorUserId: claims.actorUserId,
                agentUserId: claims.agentUserId,
            }),
            sync: created.hint,
        };
    }

    /** Authorizes one installation-bound chat capability for a dedicated host API route. */
    async authorizeChatHost(
        runtimeToken: string,
        chatToken: string,
        permissions: PluginHostPermission | readonly PluginHostPermission[],
    ) {
        return this.authorizeChat(runtimeToken, chatToken, permissions);
    }

    private async authorizeChat(
        runtimeToken: string,
        chatToken: string,
        permissions: PluginHostPermission | readonly PluginHostPermission[],
    ) {
        const required = Array.isArray(permissions) ? permissions : [permissions];
        const { installationId } = await this.authorizeHostPermissions(runtimeToken, required);
        let claims: Awaited<ReturnType<TokenService["verifyPluginChatToken"]>>;
        try {
            claims = await this.tokens.verifyPluginChatToken(chatToken);
        } catch {
            throw new PluginError("forbidden", "Plugin chat token is invalid");
        }
        if (claims.installationId !== installationId)
            throw new PluginError("forbidden", "Plugin chat token belongs to another installation");
        return claims;
    }

    private async authorizeMessage(
        runtimeToken: string,
        messageToken: string,
        messageId: string,
        permission: PluginHostPermission,
    ) {
        const { installationId } = await this.authorizeHost(runtimeToken, permission);
        let claims: Awaited<ReturnType<TokenService["verifyPluginMessageToken"]>>;
        try {
            claims = await this.tokens.verifyPluginMessageToken(messageToken);
        } catch {
            throw new PluginError("forbidden", "Plugin message token is invalid");
        }
        if (claims.installationId !== installationId)
            throw new PluginError(
                "forbidden",
                "Plugin message token belongs to another installation",
            );
        if (claims.messageId !== messageId)
            throw new PluginError("forbidden", "Plugin message token belongs to another message");
        return claims;
    }

    private async authorizeUsers(
        installationId: string,
        capabilities: readonly PluginUserCapability[],
    ): Promise<string[]> {
        return Promise.all(
            capabilities.map(async (capability) => {
                let claims: Awaited<ReturnType<TokenService["verifyPluginUserToken"]>>;
                try {
                    claims = await this.tokens.verifyPluginUserToken(capability.token);
                } catch {
                    throw new PluginError("forbidden", "Plugin user token is invalid");
                }
                if (claims.installationId !== installationId)
                    throw new PluginError(
                        "forbidden",
                        "Plugin user token belongs to another installation",
                    );
                if (claims.userId !== capability.id)
                    throw new PluginError("forbidden", "Plugin user token belongs to another user");
                return claims.userId;
            }),
        );
    }

    private async publishHints(
        hints: readonly MutationHint[],
        userIds: readonly string[],
        usersOnly = false,
    ) {
        const publications: Promise<void>[] = [];
        for (const hint of hints) {
            const event = { type: "sync" as const, ...hint };
            const topics = new Set(
                usersOnly
                    ? userIds.map((userId) => realtimeTopics.user(userId))
                    : [
                          realtimeTopics.server,
                          ...hint.chats.map(({ chatId }) => realtimeTopics.chat(chatId)),
                          ...userIds.map((userId) => realtimeTopics.user(userId)),
                      ],
            );
            for (const topic of topics) publications.push(this.pubsub.publish(topic, event));
        }
        await Promise.allSettled(publications).then((results) => {
            for (const result of results)
                if (result.status === "rejected") this.onError(result.reason);
        });
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

    private async stopActivation(installationId: string): Promise<void> {
        const activation = this.activations.get(installationId);
        activation?.controller.abort();
        if (activation) await activation.promise;
        this.closeCommand(installationId);
    }

    private async withClient<T>(
        installationId: string,
        signal: AbortSignal | undefined,
        agentCall: PluginAgentCallContext | undefined,
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
                ? await this.pluginRuntimeToken(configuration, agentCall)
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
        const client = mcpAppClient("happy2-plugin-functions");
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
        let diagnosticOutput = "";
        let diagnosticSecrets: readonly string[] = [];
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
            if (configuration.type === "local") diagnosticSecrets = configuration.secretValues;
            try {
                await this.packages.verify(
                    configuration.pluginId,
                    configuration.packageDirectory,
                    configuration.shortName,
                    configuration.packageDigest,
                );
            } catch (error) {
                throw new PluginError(
                    "broken_configuration",
                    `Installed plugin package must be reinstalled or updated: ${errorMessage(error)}`,
                );
            }
            if (configuration.type === "skills_only") {
                await this.status(installationId, "ready", "Plugin skills are installed.");
                return;
            }
            if (configuration.type === "remote") {
                await this.status(installationId, "starting", "Checking the remote MCP server.");
                const catalog = await this.probeRemote(configuration, signal);
                const hint = await pluginMcpCatalogReplace(
                    this.executor,
                    installationId,
                    catalog.tools,
                    catalog.resources,
                );
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
            const workspaceDirectory = await this.packages.workspaceDirectory(
                configuration.pluginId,
                installationId,
            );
            const workspace = await stat(workspaceDirectory);
            const prepared = await this.runtime.prepareLocal(
                {
                    installationId,
                    containerName: configuration.containerName,
                    containerInstanceId: createId(),
                    existingContainerInstanceId: configuration.containerInstanceId,
                    imageTag: configuration.imageTag,
                    workspaceDirectory,
                    workspaceGroupId: workspace.gid,
                    workspaceUserId: workspace.uid,
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
            diagnosticSecrets = [...configuration.secretValues, token];
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
                const catalog = await this.probeLocal(
                    configuration,
                    environment,
                    signal,
                    (chunk) => {
                        diagnosticOutput = runtimeDiagnosticRedact(
                            runtimeDiagnosticAppend(diagnosticOutput, chunk),
                            diagnosticSecrets,
                        );
                    },
                );
                const hint = await pluginMcpCatalogReplace(
                    this.executor,
                    installationId,
                    catalog.tools,
                    catalog.resources,
                );
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
            if (preparedContainerName)
                await this.runtime.removeLocal(preparedContainerName).catch(this.onError);
            if (signal.aborted) return;
            const broken = error instanceof PluginError && error.code === "broken_configuration";
            const message = runtimeDiagnosticRedact(errorMessage(error), diagnosticSecrets);
            await this.status(
                installationId,
                broken ? "broken_configuration" : "failed",
                broken
                    ? "Plugin configuration must be corrected before it can start."
                    : "Plugin runtime failed to prepare or start.",
                message,
                undefined,
                preparedContainerInstanceId ? null : undefined,
                diagnosticOutput || undefined,
            ).catch(this.onError);
            const output = runtimeDiagnosticSummary(diagnosticOutput);
            this.onError(
                new Error(
                    `plugin:activate installationId=${installationId} status=${broken ? "broken_configuration" : "failed"} message=${message}${output ? ` output=${JSON.stringify(output)}` : ""}`,
                    { cause: error },
                ),
            );
        } finally {
            if (buildContextDirectory)
                await this.packages.removeBuildContext(buildContextDirectory).catch(this.onError);
        }
    }

    private async probeLocal(
        configuration: Extract<PluginRuntimeConfiguration, { type: "local" }>,
        environment: Readonly<Record<string, string>>,
        signal: AbortSignal,
        onStderr: (chunk: string) => void,
    ): Promise<PluginMcpCatalogInput> {
        if (!configuration.mcp) return { tools: [], resources: [] };
        const transport = await this.runtime.openLocal(
            {
                containerName: configuration.containerName,
                command: configuration.mcp.command,
                args: configuration.mcp.args,
                environment,
            },
            signal,
            onStderr,
        );
        return this.discoverTools(transport, signal);
    }

    private async discoverTools(
        transport: Transport,
        signal: AbortSignal,
    ): Promise<PluginMcpCatalogInput> {
        const client = mcpAppClient("happy2-plugin-health");
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
                        ...(tool._meta ? { meta: tool._meta } : {}),
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
            const resourceUris = [
                ...new Set(
                    tools.flatMap((tool) => {
                        const uri = mcpAppToolUi(tool.meta).resourceUri;
                        return uri ? [uri] : [];
                    }),
                ),
            ];
            const resources: McpAppResourceInput[] = [];
            for (const uri of resourceUris) {
                const resource = await withTimeout(
                    client.readResource({ uri }),
                    HEALTH_TIMEOUT_MS,
                    "MCP App resource discovery",
                    signal,
                );
                if (resource.contents.length !== 1)
                    throw new PluginError(
                        "broken_configuration",
                        "MCP App resource must return exactly one content item",
                    );
                const content = resource.contents[0]!;
                if (content.uri !== uri || content.mimeType !== MCP_APP_RESOURCE_MIME_TYPE)
                    throw new PluginError(
                        "broken_configuration",
                        `MCP App resource must match its ui:// URI and use ${MCP_APP_RESOURCE_MIME_TYPE}`,
                    );
                const html =
                    "text" in content
                        ? content.text
                        : Buffer.from(content.blob, "base64").toString("utf8");
                if (Buffer.byteLength(html, "utf8") > MAX_MCP_APP_HTML_BYTES)
                    throw new PluginError(
                        "broken_configuration",
                        "MCP App HTML resource is too large",
                    );
                resources.push(
                    mcpAppResourceInput(
                        uri,
                        html,
                        createHash("sha256").update(html).digest("hex"),
                        plainJsonObject(content._meta),
                    ),
                );
            }
            return { tools, resources };
        } finally {
            await client.close().catch(() => transport.close());
        }
    }

    private async probeRemote(
        configuration: Extract<PluginRuntimeConfiguration, { type: "remote" }>,
        signal: AbortSignal,
    ): Promise<PluginMcpCatalogInput> {
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

    private async withMcpAppOperation<T>(
        actorUserId: string,
        name: string,
        signal: AbortSignal | undefined,
        action: (signal: AbortSignal) => Promise<T>,
    ): Promise<T> {
        const active = this.activeMcpAppOperationsByActor.get(actorUserId) ?? 0;
        if (active >= MAX_ACTIVE_MCP_APP_OPERATIONS_PER_ACTOR)
            throw new PluginError("not_ready", "Too many MCP App operations are active");
        this.activeMcpAppOperationsByActor.set(actorUserId, active + 1);
        try {
            return await withOperationTimeout(FUNCTION_EXECUTION_TIMEOUT_MS, name, signal, action);
        } finally {
            const remaining = (this.activeMcpAppOperationsByActor.get(actorUserId) ?? 1) - 1;
            if (remaining === 0) this.activeMcpAppOperationsByActor.delete(actorUserId);
            else this.activeMcpAppOperationsByActor.set(actorUserId, remaining);
        }
    }

    private async status(
        installationId: string,
        status: "preparing" | "starting" | "ready" | "broken_configuration" | "failed",
        detail: string,
        error?: string,
        runtimeImageTag?: string,
        containerInstanceId?: string | null,
        diagnosticOutput?: string,
    ): Promise<void> {
        const hint = await pluginInstallationUpdateStatus(this.executor, {
            installationId,
            status,
            detail,
            error,
            diagnosticOutput,
            runtimeImageTag,
            containerInstanceId,
        });
        await this.publish(hint).catch(this.onError);
    }

    private publish(hint: MutationHint): Promise<void> {
        const event = { type: "sync" as const, ...hint };
        return Promise.all([
            this.pubsub.publish(realtimeTopics.server, event),
            ...hint.chats.map(({ chatId }) =>
                this.pubsub.publish(realtimeTopics.chat(chatId), event),
            ),
        ]).then(() => undefined);
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
        agentCall?: PluginAgentCallContext,
    ): Promise<string> {
        if (!configuration.containerInstanceId)
            throw new PluginError("not_ready", "Plugin container incarnation is unavailable");
        return this.tokens.issuePluginRuntimeToken({
            installationId: configuration.installationId,
            containerInstanceId: configuration.containerInstanceId,
            permissions: configuration.permissions,
            ...(agentCall ? { agentCall } : {}),
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

function pluginChannelSlug(name: string): string {
    const suffix = createId();
    const base = name
        .normalize("NFKD")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 63 - suffix.length)
        .replace(/-+$/g, "");
    return `${base || "channel"}-${suffix}`;
}

function pluginFunctionInstallationId(functionName: string): string | undefined {
    const match = /^plugin_([a-z0-9]+)_/u.exec(functionName);
    return match?.[1];
}

function mcpAppClient(name: string): Client {
    return new Client(
        { name, version: "1.0.0" },
        {
            capabilities: {
                extensions: {
                    [MCP_APP_EXTENSION_ID]: { mimeTypes: [MCP_APP_RESOURCE_MIME_TYPE] },
                },
            },
        },
    );
}

function plainJsonObject(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function modelVisibleMcpResult(result: Readonly<Record<string, unknown>>): Record<string, unknown> {
    return {
        ...(result.content === undefined ? {} : { content: result.content }),
        ...(typeof result.isError === "boolean" ? { isError: result.isError } : {}),
    };
}

function jsonArguments(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function contributionControlFind(
    spec: PluginContributionSpec,
    actionId: string,
): PluginInteractiveControl | undefined {
    if (!actionId || actionId.length > 64) return undefined;
    if (spec.kind === "button") return spec.id === actionId ? spec : undefined;
    if (spec.kind === "staticMenu") return spec.items.find((item) => item.id === actionId);
    if (spec.kind === "section")
        return spec.controls.find(
            (control): control is PluginInteractiveControl =>
                control.kind !== "text" && control.id === actionId,
        );
    return undefined;
}

function contributionControlAction(
    control: PluginInteractiveControl,
    value: unknown,
): {
    toolName: string;
    arguments: Record<string, unknown>;
    openApp?: PluginToolAction["openApp"];
} {
    let argumentsValue: Record<string, unknown>;
    if (control.kind === "button") {
        if (value !== undefined)
            throw new PluginError("broken_configuration", "Button action does not accept value");
        argumentsValue = {};
    } else if (control.kind === "checkbox") {
        if (typeof value !== "boolean")
            throw new PluginError("broken_configuration", "Checkbox action requires a boolean");
        argumentsValue = { value };
    } else if (control.kind === "checkboxGroup") {
        if (
            !Array.isArray(value) ||
            value.length > control.options.length ||
            value.some((item) => typeof item !== "string")
        )
            throw new PluginError(
                "broken_configuration",
                "Checkbox group action requires option ids",
            );
        const selected = value as string[];
        if (
            new Set(selected).size !== selected.length ||
            selected.some((id) => !control.options.some((option) => option.id === id))
        )
            throw new PluginError(
                "broken_configuration",
                "Checkbox group action contains an unknown option",
            );
        argumentsValue = { value: selected };
    } else {
        if (typeof value !== "string" || Buffer.byteLength(value, "utf8") > 2_048)
            throw new PluginError(
                "broken_configuration",
                "Input action requires at most 2 KiB of text",
            );
        argumentsValue = { value };
    }
    return {
        toolName: control.action.toolName,
        arguments: argumentsValue,
        ...(control.action.openApp ? { openApp: control.action.openApp } : {}),
    };
}

function asyncMenuItems(result: unknown): PluginButtonControl[] {
    const output = result && typeof result === "object" ? (result as Record<string, unknown>) : {};
    const structured = output.structuredContent;
    if (!structured || typeof structured !== "object" || Array.isArray(structured))
        throw new PluginError(
            "broken_configuration",
            "Async menu must return structuredContent.items",
        );
    const record = structured as Record<string, unknown>;
    if (Object.keys(record).some((key) => key !== "items"))
        throw new PluginError(
            "broken_configuration",
            "Async menu structuredContent contains an unsupported field",
        );
    const parsed = pluginContributionDefinitionParse({
        audience: { scope: "all_users" },
        description: "Resolved async menu",
        externalKey: "resolved-menu",
        location: "chatMenu",
        position: 0,
        spec: {
            kind: "staticMenu",
            id: "resolved-menu",
            title: "Resolved menu",
            description: "Resolved async menu items",
            items: record.items,
        },
        title: "Resolved menu",
    });
    if (parsed.spec.kind !== "staticMenu") throw new Error("Async menu parser returned wrong kind");
    return [...parsed.spec.items];
}

function boundedJson(value: unknown, label: string, maximum: number): string {
    let json: string;
    try {
        json = JSON.stringify(value);
    } catch {
        throw new PluginError("broken_configuration", `${label} is not valid JSON`);
    }
    if (json === undefined || Buffer.byteLength(json, "utf8") > maximum)
        throw new PluginError("broken_configuration", `${label} is too large`);
    return json;
}

function validMcpResourceUri(value: string): boolean {
    if (!value || value.length > 2_048 || value.includes("\0")) return false;
    try {
        const url = new URL(value);
        return Boolean(url.protocol && url.protocol !== ":");
    } catch {
        return false;
    }
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

function abortablePluginDelay(milliseconds: number, signal?: AbortSignal): Promise<void> {
    if (signal?.aborted) return Promise.reject(abortReason(signal));
    return new Promise<void>((resolve, reject) => {
        const timer = setTimeout(finished, milliseconds);
        timer.unref();
        signal?.addEventListener("abort", aborted, { once: true });
        function finished() {
            signal?.removeEventListener("abort", aborted);
            resolve();
        }
        function aborted() {
            clearTimeout(timer);
            reject(signal ? abortReason(signal) : abortError());
        }
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
    action: (signal: AbortSignal, timeout: OperationTimeoutControl) => Promise<T>,
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
        const timeoutReset = (nextTimeoutMs: number) => {
            if (settled) return;
            clearTimeout(timer);
            timer = setTimeout(timedOut, nextTimeoutMs);
            timer.unref();
        };
        timeoutReset(timeoutMs);
        signal?.addEventListener("abort", parentAborted, { once: true });
        Promise.resolve()
            .then(() => action(controller.signal, { timeoutReset }))
            .then(
                (value) => settle(() => resolve(value)),
                (error) => settle(() => reject(error)),
            );
    });
}

function pluginAgentCallKey(sessionId: string, callId: string): string {
    return `${sessionId}\u0000${callId}`;
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

function runtimeDiagnosticAppend(current: string, chunk: string): string {
    const cleaned = chunk
        .replace(/\u001b\[[0-?]*[ -/]*[@-~]/gu, "")
        .replace(/\u0000/gu, "")
        .replace(/\r\n?/gu, "\n");
    const combined = current + cleaned;
    if (combined.length <= MAX_PLUGIN_DIAGNOSTIC_CHARS) return combined;
    const marker = "[Earlier runtime output omitted.]\n";
    return marker + combined.slice(-(MAX_PLUGIN_DIAGNOSTIC_CHARS - marker.length));
}

function runtimeDiagnosticRedact(value: string, secrets: readonly string[]): string {
    let redacted = value;
    for (const secret of [...new Set(secrets.filter(Boolean))].sort(
        (left, right) => right.length - left.length,
    ))
        redacted = redacted.split(secret).join("[REDACTED]");
    return redacted;
}

function runtimeDiagnosticSummary(output: string): string | undefined {
    const lines = output
        .split("\n")
        .map((line) => line.trim())
        .filter(Boolean);
    return lines.at(-1)?.slice(0, 500);
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
        apiPermissions: pluginApiPermissionSections(
            effectiveContainer(plugin.manifest)?.permissions ?? [],
        ),
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
