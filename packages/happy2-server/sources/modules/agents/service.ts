import { rigEventMarkTrimmed } from "../agent/rigEventMarkTrimmed.js";
import { rigEventGetCheckpoint } from "../agent/rigEventGetCheckpoint.js";
import { rigEventCheckpoint } from "../agent/rigEventCheckpoint.js";
import { agentUsernameIsAvailable } from "../agent/agentUsernameIsAvailable.js";
import { agentTurnTakeNext } from "../agent/agentTurnTakeNext.js";
import { agentTurnStreamReply } from "../agent/agentTurnStreamReply.js";
import { agentTurnRenewLease } from "../agent/agentTurnRenewLease.js";
import { agentTurnReleaseLeases } from "../agent/agentTurnReleaseLeases.js";
import { agentTurnHasRunnable } from "../agent/agentTurnHasRunnable.js";
import { agentTurnGetRunning } from "../agent/agentTurnGetRunning.js";
import { agentTurnFail } from "../agent/agentTurnFail.js";
import { agentTurnComplete } from "../agent/agentTurnComplete.js";
import { agentTurnCheckpoint } from "../agent/agentTurnCheckpoint.js";
import { agentTurnTraceStart } from "../agent/agentTurnTraceStart.js";
import { agentSecretRecordRegistration } from "../agent/agentSecretRecordRegistration.js";
import { agentSecretDetachFromChannel } from "../agent/agentSecretDetachFromChannel.js";
import { agentSecretDetachFromAgent } from "../agent/agentSecretDetachFromAgent.js";
import { agentSecretBindingList } from "../agent/agentSecretBindingList.js";
import { agentSecretAuthorizeManagement } from "../agent/agentSecretAuthorizeManagement.js";
import { agentSecretAttachToChannel } from "../agent/agentSecretAttachToChannel.js";
import { agentSecretAttachToAgent } from "../agent/agentSecretAttachToAgent.js";
import { agentSecretAssignmentList } from "../agent/agentSecretAssignmentList.js";
import { agentSecretAssignmentDelete } from "../agent/agentSecretAssignmentDelete.js";
import { agentRunAttach } from "../agent/agentRunAttach.js";
import { agentImageTakeBuild } from "../agent/agentImageTakeBuild.js";
import { agentImageSetDefault } from "../agent/agentImageSetDefault.js";
import { agentImageRequestBuild } from "../agent/agentImageRequestBuild.js";
import { agentImageRenewBuildLease } from "../agent/agentImageRenewBuildLease.js";
import { agentImageReleaseBuildLeases } from "../agent/agentImageReleaseBuildLeases.js";
import { agentImageRecordBuildOutput } from "../agent/agentImageRecordBuildOutput.js";
import { agentImageListRequestedBuildIds } from "../agent/agentImageListRequestedBuildIds.js";
import { agentImageList } from "../agent/agentImageList.js";
import { agentImageGetReadyDefault } from "../agent/agentImageGetReadyDefault.js";
import { agentImageGetChangeContext } from "../agent/agentImageGetChangeContext.js";
import { agentImageGet } from "../agent/agentImageGet.js";
import { agentImageEnsureDefinitions } from "../agent/agentImageEnsureDefinitions.js";
import { agentImageCreate } from "../agent/agentImageCreate.js";
import { agentImageCommitChange } from "../agent/agentImageCommitChange.js";
import { agentEffortUpdate } from "../agent/agentEffortUpdate.js";
import { agentEffortInitialize } from "../agent/agentEffortInitialize.js";
import { agentEffortGetContext } from "../agent/agentEffortGetContext.js";
import { agentEffortBindingList } from "../agent/agentEffortBindingList.js";
import { agentCreate } from "../agent/agentCreate.js";
import { agentConversationCreate } from "../agent/agentConversationCreate.js";
import { agentDefaultRepair } from "../agent/agentDefaultRepair.js";
import { agentChatListUnfinishedIds } from "../agent/agentChatListUnfinishedIds.js";
import { agentChatGetContext } from "../agent/agentChatGetContext.js";
import { agentChatBind } from "../agent/agentChatBind.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type {
    AgentTurnBackgroundTerminalSummary,
    AgentTurnSubagentSummary,
    AgentTurnTraceUpdate,
    RigEventCheckpoint,
} from "../agent/types.js";
import {
    CollaborationError,
    type AgentSecretSummary,
    type MutationHint,
    type UserSummary,
} from "../chat/types.js";
import { realtimeTopics, type AgentActivityPhase, type PubSub } from "../realtime/index.js";
import {
    isRetryableRigError,
    RigDaemonClient,
    type RigEvent,
    type RigBackgroundProcess,
    type RigGlobalEvent,
    type RigSubagentSummary,
    type RigTurnInspection,
} from "./daemon.js";
import { BUILTIN_AGENT_IMAGES } from "./builtin-images.js";
import type { AgentImageBuildUpdate, AgentSandboxRuntimeResolver } from "../sandbox/types.js";
import type {
    PluginFunctionDefinition,
    PluginFunctionResult,
    PluginSkillDefinition,
} from "../plugin/types.js";
import { agentChatGetIdBySession } from "../agent/agentChatGetIdBySession.js";
import { pluginFunctionResultAcquire } from "../plugin/pluginFunctionResultAcquire.js";
import { pluginFunctionResultComplete } from "../plugin/pluginFunctionResultComplete.js";
import {
    setupBaseImageCompleteBuild,
    setupBaseImageFailBuild,
    setupBaseImageGetStatus,
    setupBaseImageRetryBuild,
    setupBaseImageSelect,
    type SetupBaseImageSelection,
} from "../setup/index.js";
const IGNORED_EVENT_CHECKPOINT_INTERVAL = 100;
const EVENT_RETRY_INTERVAL_MS = 100;
const PLUGIN_FUNCTION_LEASE_MS = 45_000;
const PLUGIN_FUNCTION_WAIT_INTERVAL_MS = 1_000;
const TYPING_TTL_MS = 30_000;
const TYPING_RENEW_INTERVAL_MS = 20_000;
const AGENT_ACTIVITY_TTL_MS = 10_000;
const AGENT_ACTIVITY_RENEW_INTERVAL_MS = 3_000;
const TRIM_EVENT_INTERVAL = 1_000;
const TRIM_TIME_INTERVAL_MS = 24 * 60 * 60_000;
const IMAGE_BUILD_LEASE_RENEW_INTERVAL_MS = 20_000;
const IMAGE_BUILD_LOG_FLUSH_INTERVAL_MS = 500;
const IMAGE_BUILD_LOG_FLUSH_CHARACTERS = 32_768;
const MAX_BUILD_LOG_LINE_CHARACTERS = 1_000;
const MAX_CONCURRENT_IMAGE_BUILDS = 1;
const AGENT_REPLY_FLUSH_INTERVAL_MS = 50;
const AGENT_REPLY_FLUSH_CHARACTERS = 1_024;
const MAX_TRACE_DETAIL_CHARACTERS = 64 * 1_024;
const MAX_TRACE_SUMMARY_CHARACTERS = 500;
const MAX_TRACE_COLLECTION_ITEMS = 32;
const MAX_TRACE_ID_CHARACTERS = 128;
const MAX_ACTIVITY_TEXT_CHARACTERS = 240;
const MAX_PENDING_TRACE_UPDATES = 512;
const MAX_TRACKED_TOOL_NAMES = 512;
const AGENT_CONTAINER_SECURITY = {
    init: true,
    readonlyRootFilesystem: true,
    sharedMemoryBytes: 1024 * 1024 * 1024,
    tmpfs: [
        {
            target: "/tmp",
            mode: 0o1777,
        },
        {
            target: "/run",
            mode: 0o755,
        },
        {
            target: "/var/tmp",
            mode: 0o1777,
        },
        {
            target: "/var/run",
            mode: 0o755,
        },
    ],
} as const;
type AgentTurnWork = NonNullable<Awaited<ReturnType<typeof agentTurnTakeNext>>>;
interface AgentSecretCreateInput {
    actorUserId: string;
    description: string;
    environment: Record<string, string>;
    id: string;
}
interface AgentSecretTargetInput {
    actorUserId: string;
    secretId: string;
}
interface AgentSecretAgentInput extends AgentSecretTargetInput {
    agentUserId: string;
}
interface AgentSecretChannelInput extends AgentSecretTargetInput {
    channelId: string;
}
interface ActiveAgentTurnStream {
    controller: AbortController;
    output: AgentReplyStreamOutput;
    task: Promise<void>;
}
interface AgentTurnSubmission {
    inspection: RigTurnInspection;
    lastSessionEventId?: string;
    runId?: string;
}
interface ActiveTypingRenewal {
    timer: ReturnType<typeof setInterval>;
    userMessageId: string;
}
interface ActiveAgentActivity {
    backgroundTerminals: Map<string, AgentTurnBackgroundTerminalSummary>;
    lastOccurredAt: number;
    phase: AgentActivityPhase;
    startedAt: number;
    subagents: Map<string, AgentTurnSubagentSummary>;
    timer: ReturnType<typeof setInterval>;
    tokenCounts: Map<string, number>;
    toolNames: Map<string, string>;
    userMessageId: string;
}
interface AgentPluginCapabilities {
    callFunction(
        functionName: string,
        args: unknown,
        context: { chatId: string; sessionId: string; callId: string },
        signal?: AbortSignal,
    ): Promise<PluginFunctionResult>;
    listFunctions(signal?: AbortSignal): Promise<readonly PluginFunctionDefinition[]>;
    listSkills(signal?: AbortSignal): Promise<readonly PluginSkillDefinition[]>;
    readSkill(skill: PluginSkillDefinition, signal?: AbortSignal): Promise<PluginFunctionResult>;
}
export class AgentService {
    private readonly workerId = createId();
    private readonly bindingCreations = new Map<
        string,
        Promise<{
            containerName: string;
            cwd: string;
            sessionId: string;
        }>
    >();
    private readonly imageBuilds = new Map<string, Promise<void>>();
    private readonly imageBuildRetries = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly imageMutations = new Map<string, Promise<unknown>>();
    private readonly pendingImageBuilds = new Set<string>();
    private readonly agentConfigurationMutations = new Map<string, Promise<unknown>>();
    private readonly secretMutations = new Map<string, Promise<unknown>>();
    private activeImageBuilds = 0;
    private readonly drains = new Map<string, Promise<void>>();
    private readonly turnStreams = new Map<string, ActiveAgentTurnStream>();
    private readonly typingRenewals = new Map<string, ActiveTypingRenewal>();
    private readonly agentActivities = new Map<string, ActiveAgentActivity>();
    private readonly shutdown = new AbortController();
    private queueTask?: Promise<void>;
    private stopping = false;
    constructor(
        private readonly executor: DrizzleExecutor,
        private readonly pubsub: PubSub,
        private readonly daemon: RigDaemonClient,
        private readonly sandboxRuntime: AgentSandboxRuntimeResolver,
        private readonly defaultCwd: string,
        private readonly pluginCapabilities: AgentPluginCapabilities | undefined,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {}
    async createAgent(input: { actorUserId: string; name: string; username: string }) {
        if (!(await agentUsernameIsAvailable(this.executor, input.username)))
            throw new CollaborationError("conflict", "Agent username is already taken");
        const image = await agentImageGetReadyDefault(this.executor);
        if (!image)
            throw new CollaborationError(
                "conflict",
                "A ready default agent image must be configured before creating agents",
            );
        const agentUserId = createId();
        const sandbox = sandboxDirectories(
            this.defaultCwd,
            agentUserId,
            "users",
            input.actorUserId,
        );
        await Promise.all([
            mkdir(sandbox.home, {
                recursive: true,
                mode: 0o700,
            }),
            mkdir(sandbox.workspace, {
                recursive: true,
                mode: 0o700,
            }),
        ]);
        const containerName = agentContainerName();
        const runtime = await this.sandboxRuntime();
        await runtime.createSandbox(
            {
                agentUserId,
                containerName,
                homeDirectory: sandbox.home,
                imageId: image.id,
                imageTag: image.dockerTag,
                security: AGENT_CONTAINER_SECURITY,
                workspaceDirectory: sandbox.workspace,
            },
            this.shutdown.signal,
        );
        try {
            const session = await this.daemon.createSession(
                sandbox.workspace,
                containerName,
                undefined,
                this.shutdown.signal,
            );
            return await agentCreate(this.executor, {
                ...input,
                agentUserId,
                agentEffort: session.effort,
                containerName,
                cwd: sandbox.workspace,
                imageId: image.id,
                sessionId: session.id,
            });
        } catch (error) {
            await runtime.removeSandbox(containerName);
            throw error;
        }
    }
    async createAgentConversation(input: { actorUserId: string; agentUserId: string }) {
        return agentConversationCreate(this.executor, input);
    }
    async start(): Promise<void> {
        await agentImageEnsureDefinitions(
            this.executor,
            BUILTIN_AGENT_IMAGES.map((definition) => {
                const definitionHash = agentImageDefinitionHash(
                    definition.dockerfile,
                    definition.buildContext,
                );
                return {
                    ...definition,
                    definitionHash,
                    dockerTag: agentImageTag(definitionHash),
                };
            }),
        );
        const defaultAgentRepaired = await agentDefaultRepair(this.executor);
        if (defaultAgentRepaired) await this.publishAgentHint(defaultAgentRepaired);
        for (const imageId of await agentImageListRequestedBuildIds(this.executor))
            this.queueImageBuild(imageId);
        await this.daemon.ensureGlobalEventQueue(this.shutdown.signal);
        await this.reconcileFunctionPermissions();
        await this.reconcileAgentEfforts();
        await this.reconcileSecretBindings();
        this.queueTask = this.trackGlobalEvents().catch((error) => {
            if (!this.shutdown.signal.aborted) this.onError(error);
        });
        const chatIds = await agentChatListUnfinishedIds(this.executor);
        for (const chatId of chatIds) this.startDrain(chatId);
    }
    async prepareTurns(input: {
        actorUserId: string;
        agentUserIds: readonly string[];
        chatId: string;
    }): Promise<Array<{ agentUserId: string; sessionId: string }>> {
        const access = await chatGetAccess(this.executor, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const requested = [...new Set(input.agentUserIds)];
        let agentUserIds: string[];
        if (access.kind === "dm") {
            const direct = await agentChatGetContext(
                this.executor,
                input.actorUserId,
                input.chatId,
            );
            if (!direct)
                throw new CollaborationError(
                    "invalid",
                    "This direct message has no executable agent",
                );
            if (requested.some((agentUserId) => agentUserId !== direct.agentUserId))
                throw new CollaborationError(
                    "invalid",
                    "A direct message can only address its member agent",
                );
            agentUserIds = [direct.agentUserId];
        } else {
            agentUserIds = [
                ...(access.defaultAgentUserId ? [access.defaultAgentUserId] : []),
                ...requested,
            ].filter((agentUserId, index, all) => all.indexOf(agentUserId) === index);
            if (!agentUserIds.length)
                throw new CollaborationError(
                    "conflict",
                    "The channel needs a default agent before sending to agents",
                );
        }
        const contexts = await Promise.all(
            agentUserIds.map((agentUserId) =>
                agentChatGetContext(this.executor, input.actorUserId, input.chatId, agentUserId),
            ),
        );
        if (contexts.some((context) => !context))
            throw new CollaborationError(
                "invalid",
                "Every addressed agent must be a ready executable chat member",
            );
        const turns: Array<{ agentUserId: string; sessionId: string }> = [];
        for (const context of contexts) {
            const binding = await this.ensureAgentBinding(
                input.actorUserId,
                input.chatId,
                context!.agentUserId,
            );
            if (!binding)
                throw new CollaborationError("conflict", "Agent conversation is not ready");
            turns.push({
                agentUserId: context!.agentUserId,
                sessionId: binding.sessionId,
            });
        }
        return turns;
    }
    startTurn(chatId: string): void {
        this.startDrain(chatId);
    }
    async getAgentEffort(input: { actorUserId: string; agentUserId: string; chatId: string }) {
        const context = await agentEffortGetContext(
            this.executor,
            input.actorUserId,
            input.chatId,
            input.agentUserId,
        );
        return this.agentEffortConfiguration(context);
    }
    async changeAgentEffort(input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        effort: string;
    }) {
        return this.serializeAgentConfiguration(
            `${input.agentUserId}:${input.chatId}`,
            async () => {
                const context = await agentEffortGetContext(
                    this.executor,
                    input.actorUserId,
                    input.chatId,
                    input.agentUserId,
                );
                const configuration = await this.agentEffortConfiguration(context);
                if (!configuration.options.includes(input.effort))
                    throw new CollaborationError(
                        "invalid",
                        `Effort must be one of: ${configuration.options.join(", ")}`,
                    );
                const result = await agentEffortUpdate(this.executor, input);
                try {
                    await this.reconcileSessionEffort(context.sessionId, input.effort);
                } finally {
                    if (result.hint) await this.publishAgentHint(result.hint);
                }
                return {
                    agentUserId: input.agentUserId,
                    effort: input.effort,
                    options: configuration.options,
                    ...(result.hint
                        ? {
                              sync: result.hint,
                          }
                        : {}),
                };
            },
        );
    }
    listAgentImages(actorUserId: string) {
        return agentImageList(this.executor, actorUserId);
    }
    getAgentImage(actorUserId: string, imageId: string) {
        return agentImageGet(this.executor, actorUserId, imageId);
    }
    async createAgentImage(input: { actorUserId: string; dockerfile: string; name: string }) {
        const definitionHash = agentImageDefinitionHash(input.dockerfile);
        const result = await agentImageCreate(this.executor, {
            ...input,
            definitionHash,
            dockerTag: agentImageTag(definitionHash),
        });
        await this.publishAgentImageHint(result.hint);
        this.queueImageBuild(result.image.id);
        return result.image;
    }
    async requestAgentImageBuild(input: { actorUserId: string; imageId: string }) {
        const result = await agentImageRequestBuild(this.executor, input);
        await this.publishAgentImageHint(result.hint);
        this.queueImageBuild(result.image.id);
        return result.image;
    }
    async setDefaultAgentImage(input: { actorUserId: string; imageId: string }) {
        const result = await agentImageSetDefault(this.executor, input);
        await this.publishAgentImageHint(result.hint);
        return result.image;
    }
    getSetupBaseImages(actorUserId: string) {
        return setupBaseImageGetStatus(this.executor, actorUserId);
    }
    async selectSetupBaseImage(input: {
        actorUserId: string;
        selection:
            | { builtinKey: "daycare-full" | "daycare-minimal"; kind: "builtin" }
            | { dockerfile: string; kind: "custom"; name: string };
    }) {
        const selection: SetupBaseImageSelection =
            input.selection.kind === "builtin"
                ? input.selection
                : (() => {
                      const definitionHash = agentImageDefinitionHash(input.selection.dockerfile);
                      return {
                          ...input.selection,
                          definitionHash,
                          dockerTag: agentImageTag(definitionHash),
                      };
                  })();
        const result = await setupBaseImageSelect(this.executor, input.actorUserId, selection);
        if (result.hint) await this.publishAgentImageHint(result.hint);
        if (result.queueBuild) this.queueImageBuild(result.imageId);
        return result;
    }
    async retrySetupBaseImage(actorUserId: string) {
        const result = await setupBaseImageRetryBuild(this.executor, actorUserId);
        await this.publishAgentImageHint(result.hint);
        this.queueImageBuild(result.imageId);
        return result;
    }
    async changeAgentImage(input: {
        actorUserId: string;
        agentUserId: string;
        imageId: string;
    }): Promise<{
        user: UserSummary;
        sync?: MutationHint;
    }> {
        const previous = this.imageMutations.get(input.agentUserId) ?? Promise.resolve();
        const mutation = previous
            .catch(() => undefined)
            .then(() => this.changeAgentImageMutation(input));
        this.imageMutations.set(input.agentUserId, mutation);
        try {
            return await mutation;
        } finally {
            if (this.imageMutations.get(input.agentUserId) === mutation)
                this.imageMutations.delete(input.agentUserId);
        }
    }
    private async changeAgentImageMutation(input: {
        actorUserId: string;
        agentUserId: string;
        imageId: string;
    }): Promise<{
        user: UserSummary;
        sync?: MutationHint;
    }> {
        const context = await agentImageGetChangeContext(this.executor, input);
        if (context.currentImageId === context.image.id)
            return {
                user: context.user,
            };
        const replacements: Array<{
            chatId: string;
            containerName: string;
            cwd: string;
            previousContainerName: string;
            previousSessionId: string;
            sessionId: string;
        }> = [];
        let committed = false;
        const runtime = await this.sandboxRuntime();
        try {
            for (const binding of context.bindings) {
                const containerName = agentContainerName();
                await runtime.createSandbox(
                    {
                        agentUserId: input.agentUserId,
                        containerName,
                        homeDirectory: join(binding.cwd, "..", "home"),
                        imageId: context.image.id,
                        imageTag: context.image.dockerTag,
                        security: AGENT_CONTAINER_SECURITY,
                        workspaceDirectory: binding.cwd,
                    },
                    this.shutdown.signal,
                );
                try {
                    const session = await this.daemon.createSession(
                        binding.cwd,
                        containerName,
                        binding.effort ?? context.user.agentEffort,
                        this.shutdown.signal,
                    );
                    replacements.push({
                        chatId: binding.chatId,
                        containerName,
                        cwd: binding.cwd,
                        previousContainerName: binding.containerName,
                        previousSessionId: binding.sessionId,
                        sessionId: session.id,
                    });
                } catch (error) {
                    await runtime.removeSandbox(containerName);
                    throw error;
                }
            }
            const result = await agentImageCommitChange(this.executor, {
                ...input,
                expectedImageId: context.currentImageId,
                replacements,
            });
            if (!result.sync) {
                await Promise.all(
                    replacements.map(({ containerName }) => runtime.removeSandbox(containerName)),
                );
                return {
                    user: result.user,
                };
            }
            committed = true;
            await Promise.allSettled(
                replacements.map(({ previousContainerName }) =>
                    runtime.removeSandbox(previousContainerName),
                ),
            ).then((results) => {
                for (const result of results)
                    if (result.status === "rejected") this.onError(result.reason);
            });
            await this.reconcileSecretBindings({
                agentUserId: input.agentUserId,
            }).catch(this.onError);
            await this.publishAgentHint(result.sync);
            return result;
        } catch (error) {
            if (!committed)
                await Promise.allSettled(
                    replacements.map(({ containerName }) => runtime.removeSandbox(containerName)),
                ).then((results) => {
                    for (const result of results)
                        if (result.status === "rejected") this.onError(result.reason);
                });
            throw error;
        }
    }
    async listAgentSecrets(actorUserId: string): Promise<{
        secrets: AgentSecretSummary[];
    }> {
        const assignments = await agentSecretAssignmentList(this.executor, actorUserId);
        const assignmentById = new Map(
            assignments.map((assignment) => [assignment.secretId, assignment]),
        );
        const secrets = await this.daemon.listSecrets(this.shutdown.signal);
        return {
            secrets: secrets.map((secret) => {
                const assignment = assignmentById.get(secret.id);
                return {
                    ...secret,
                    agentUserIds: [...(assignment?.agentUserIds ?? [])],
                    channelIds: [...(assignment?.channelIds ?? [])],
                };
            }),
        };
    }
    async createAgentSecret(input: AgentSecretCreateInput): Promise<{
        secret: AgentSecretSummary;
        sync: MutationHint;
    }> {
        return this.serializeAgentSecret(input.id, () => this.createAgentSecretMutation(input));
    }
    private async createAgentSecretMutation(input: AgentSecretCreateInput): Promise<{
        secret: AgentSecretSummary;
        sync: MutationHint;
    }> {
        await agentSecretAuthorizeManagement(this.executor, input.actorUserId, "manageSecrets");
        const secret = await this.daemon.registerSecret(
            {
                id: input.id,
                description: input.description,
                environment: input.environment,
            },
            this.shutdown.signal,
        );
        const sync = await agentSecretRecordRegistration(this.executor, {
            actorUserId: input.actorUserId,
            secretId: input.id,
        });
        await this.publishAgentHint(sync);
        const assignments = await agentSecretAssignmentList(this.executor, input.actorUserId);
        const assignment = assignments.find((candidate) => candidate.secretId === secret.id);
        return {
            secret: {
                ...secret,
                agentUserIds: [...(assignment?.agentUserIds ?? [])],
                channelIds: [...(assignment?.channelIds ?? [])],
            },
            sync,
        };
    }
    async deleteAgentSecret(input: AgentSecretTargetInput): Promise<{
        removed: boolean;
        sync: MutationHint;
    }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.deleteAgentSecretMutation(input),
        );
    }
    private async deleteAgentSecretMutation(input: AgentSecretTargetInput): Promise<{
        removed: boolean;
        sync: MutationHint;
    }> {
        await agentSecretAuthorizeManagement(this.executor, input.actorUserId, "manageSecrets");
        const sync = await agentSecretAssignmentDelete(this.executor, input);
        let removed: boolean;
        try {
            removed = await this.daemon.unregisterSecret(input.secretId, this.shutdown.signal);
        } catch (error) {
            await this.publishAgentHint(sync);
            throw error;
        }
        await this.publishAgentHint(sync);
        return {
            removed,
            sync,
        };
    }
    async attachAgentSecretToAgent(input: AgentSecretAgentInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.attachAgentSecretToAgentMutation(input),
        );
    }
    private async attachAgentSecretToAgentMutation(input: AgentSecretAgentInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await agentSecretAttachToAgent(this.executor, input);
        await this.reconcileSecretBindings({
            agentUserId: input.agentUserId,
        });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync
                ? {
                      sync,
                  }
                : {}),
        };
    }
    async detachAgentSecretFromAgent(input: AgentSecretAgentInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.detachAgentSecretFromAgentMutation(input),
        );
    }
    private async detachAgentSecretFromAgentMutation(input: AgentSecretAgentInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await agentSecretDetachFromAgent(this.executor, input);
        await this.reconcileSecretBindings({
            agentUserId: input.agentUserId,
        });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync
                ? {
                      sync,
                  }
                : {}),
        };
    }
    async attachAgentSecretToChannel(input: AgentSecretChannelInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.attachAgentSecretToChannelMutation(input),
        );
    }
    private async attachAgentSecretToChannelMutation(input: AgentSecretChannelInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await agentSecretAttachToChannel(this.executor, input);
        await this.reconcileSecretBindings({
            chatId: input.channelId,
        });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync
                ? {
                      sync,
                  }
                : {}),
        };
    }
    async detachAgentSecretFromChannel(input: AgentSecretChannelInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.detachAgentSecretFromChannelMutation(input),
        );
    }
    private async detachAgentSecretFromChannelMutation(input: AgentSecretChannelInput): Promise<{
        secret: AgentSecretSummary;
        sync?: MutationHint;
    }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await agentSecretDetachFromChannel(this.executor, input);
        await this.reconcileSecretBindings({
            chatId: input.channelId,
        });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync
                ? {
                      sync,
                  }
                : {}),
        };
    }
    private async serializeAgentConfiguration<T>(
        agentUserId: string,
        action: () => Promise<T>,
    ): Promise<T> {
        const previous = this.agentConfigurationMutations.get(agentUserId) ?? Promise.resolve();
        const mutation = previous.catch(() => undefined).then(action);
        this.agentConfigurationMutations.set(agentUserId, mutation);
        try {
            return await mutation;
        } finally {
            if (this.agentConfigurationMutations.get(agentUserId) === mutation)
                this.agentConfigurationMutations.delete(agentUserId);
        }
    }
    private async serializeAgentSecret<T>(secretId: string, action: () => Promise<T>): Promise<T> {
        const previous = this.secretMutations.get(secretId) ?? Promise.resolve();
        const mutation = previous.catch(() => undefined).then(action);
        this.secretMutations.set(secretId, mutation);
        try {
            return await mutation;
        } finally {
            if (this.secretMutations.get(secretId) === mutation)
                this.secretMutations.delete(secretId);
        }
    }
    private async ensureAgentBinding(
        actorUserId: string,
        chatId: string,
        agentUserId: string,
    ): Promise<
        | {
              containerName: string;
              cwd: string;
              sessionId: string;
          }
        | undefined
    > {
        if (this.stopping) return undefined;
        const context = await agentChatGetContext(this.executor, actorUserId, chatId, agentUserId);
        if (!context) return undefined;
        if (context.binding) {
            const effort = context.binding.effort ?? context.agentDefaultEffort;
            if (effort) await this.reconcileSessionEffort(context.binding.sessionId, effort);
            await this.reconcileSecretBindings({
                agentUserId: context.agentUserId,
                chatId,
            });
            return context.binding;
        }
        const key = `${context.agentUserId}:${chatId}`;
        const pending = this.bindingCreations.get(key);
        if (pending) return pending;
        const creation = this.serializeAgentConfiguration(context.agentUserId, async () => {
            const latest = await agentChatGetContext(
                this.executor,
                actorUserId,
                chatId,
                agentUserId,
            );
            if (!latest)
                throw new CollaborationError("not_found", "Agent conversation was not found");
            if (latest.binding) {
                const effort = latest.binding.effort ?? latest.agentDefaultEffort;
                if (effort) await this.reconcileSessionEffort(latest.binding.sessionId, effort);
                return latest.binding;
            }
            const sandbox = sandboxDirectories(
                this.defaultCwd,
                latest.agentUserId,
                latest.sandboxScope.kind,
                latest.sandboxScope.id,
                latest.sandboxScope.conversationId,
            );
            await Promise.all([
                mkdir(sandbox.home, {
                    recursive: true,
                    mode: 0o700,
                }),
                mkdir(sandbox.workspace, {
                    recursive: true,
                    mode: 0o700,
                }),
            ]);
            const containerName = agentContainerName();
            const runtime = await this.sandboxRuntime();
            await runtime.createSandbox(
                {
                    agentUserId: latest.agentUserId,
                    containerName,
                    homeDirectory: sandbox.home,
                    imageId: latest.image.id,
                    imageTag: latest.image.dockerTag,
                    security: AGENT_CONTAINER_SECURITY,
                    workspaceDirectory: sandbox.workspace,
                },
                this.shutdown.signal,
            );
            try {
                const session = await this.daemon.createSession(
                    sandbox.workspace,
                    containerName,
                    latest.agentDefaultEffort,
                    this.shutdown.signal,
                );
                const binding = await agentChatBind(this.executor, {
                    actorUserId,
                    agentUserId: latest.agentUserId,
                    chatId,
                    containerName,
                    cwd: sandbox.workspace,
                    effort: session.effort,
                    imageId: latest.image.id,
                    sessionId: session.id,
                });
                if (binding.containerName !== containerName)
                    await runtime.removeSandbox(containerName);
                await this.reconcileSecretBindings({
                    agentUserId: latest.agentUserId,
                    chatId,
                });
                return binding;
            } catch (error) {
                await runtime.removeSandbox(containerName);
                throw error;
            }
        });
        this.bindingCreations.set(key, creation);
        try {
            return await creation;
        } finally {
            this.bindingCreations.delete(key);
        }
    }
    async close(): Promise<void> {
        this.stopping = true;
        this.shutdown.abort();
        this.pendingImageBuilds.clear();
        for (const timer of this.imageBuildRetries.values()) clearTimeout(timer);
        this.imageBuildRetries.clear();
        for (const stream of this.turnStreams.values()) {
            stream.controller.abort();
            stream.output.close();
        }
        for (const renewal of this.typingRenewals.values()) clearInterval(renewal.timer);
        this.typingRenewals.clear();
        for (const activity of this.agentActivities.values()) clearInterval(activity.timer);
        this.agentActivities.clear();
        await Promise.race([
            Promise.allSettled([
                ...this.bindingCreations.values(),
                ...this.imageMutations.values(),
                ...this.drains.values(),
                ...this.imageBuilds.values(),
                ...Array.from(this.turnStreams.values(), (stream) => stream.task),
                ...(this.queueTask ? [this.queueTask] : []),
            ]),
            shutdownDeadline(),
        ]);
        await Promise.all([
            agentTurnReleaseLeases(this.executor, this.workerId),
            agentImageReleaseBuildLeases(this.executor, this.workerId),
        ]);
    }
    private queueImageBuild(imageId: string): void {
        if (this.stopping || this.imageBuilds.has(imageId) || this.pendingImageBuilds.has(imageId))
            return;
        this.pendingImageBuilds.add(imageId);
        this.drainImageBuildQueue();
    }
    private drainImageBuildQueue(): void {
        if (this.stopping || this.activeImageBuilds >= MAX_CONCURRENT_IMAGE_BUILDS) return;
        const imageId = this.pendingImageBuilds.values().next().value;
        if (!imageId) return;
        this.pendingImageBuilds.delete(imageId);
        this.activeImageBuilds += 1;
        const task = this.buildImage(imageId)
            .catch((error) => {
                if (!this.shutdown.signal.aborted) this.onError(error);
            })
            .finally(() => {
                this.imageBuilds.delete(imageId);
                this.activeImageBuilds -= 1;
                this.drainImageBuildQueue();
            });
        this.imageBuilds.set(imageId, task);
    }
    private async buildImage(imageId: string): Promise<void> {
        const claimed = await agentImageTakeBuild(this.executor, imageId, this.workerId);
        if (!claimed) return;
        if ("retryAt" in claimed) {
            this.scheduleImageBuildRetry(imageId, claimed.retryAt);
            return;
        }
        const build = claimed.build;
        await this.publishAgentImageHint(claimed.hint);
        const output = new AgentImageBuildOutput(
            async ({ lastBuildLogLine, logChunk, progress }) => {
                const hint = await agentImageRecordBuildOutput(this.executor, {
                    imageId,
                    logChunk,
                    progress,
                    workerId: this.workerId,
                    ...(lastBuildLogLine === undefined
                        ? {}
                        : {
                              lastBuildLogLine,
                          }),
                });
                if (hint) await this.publishAgentImageHint(hint);
                else if (!this.shutdown.signal.aborted)
                    throw new Error(
                        `Agent image ${imageId} build lease was lost while recording output.`,
                    );
            },
            this.onError,
        );
        let renewalRunning = false;
        const renewal = setInterval(() => {
            if (renewalRunning || this.shutdown.signal.aborted) return;
            renewalRunning = true;
            void agentImageRenewBuildLease(this.executor, imageId, this.workerId)
                .catch(this.onError)
                .finally(() => {
                    renewalRunning = false;
                });
        }, IMAGE_BUILD_LEASE_RENEW_INTERVAL_MS);
        renewal.unref();
        try {
            const runtime = await this.sandboxRuntime();
            const result = await runtime.buildImage(
                {
                    ...(build.buildContext
                        ? {
                              buildContext: build.buildContext,
                          }
                        : {}),
                    dockerfile: build.dockerfile,
                    tag: build.dockerTag,
                },
                {
                    onUpdate: (update) => output.add(update),
                    signal: this.shutdown.signal,
                },
            );
            await output.finish();
            const completed = await setupBaseImageCompleteBuild(this.executor, {
                dockerImageId: result.imageId,
                imageId,
                workerId: this.workerId,
            });
            if (completed) {
                await this.publishAgentImageHint(completed);
            } else if (!this.shutdown.signal.aborted)
                throw new Error(`Agent image ${imageId} build lease was lost before completion.`);
        } catch (error) {
            if (this.shutdown.signal.aborted) {
                await output.finish().catch(this.onError);
                return;
            }
            const message = agentImageBuildError(error);
            output.add({
                logChunk: `${message}\n`,
                progress: output.currentProgress,
            });
            await output.finish().catch(this.onError);
            const failed = await setupBaseImageFailBuild(this.executor, {
                error: message,
                imageId,
                workerId: this.workerId,
            });
            if (failed) await this.publishAgentImageHint(failed);
        } finally {
            clearInterval(renewal);
            output.close();
        }
    }
    private scheduleImageBuildRetry(imageId: string, retryAt: string): void {
        if (this.stopping || this.imageBuildRetries.has(imageId)) return;
        const delay = Math.max(Date.parse(retryAt) - Date.now(), 0) + 10;
        const timer = setTimeout(() => {
            this.imageBuildRetries.delete(imageId);
            this.queueImageBuild(imageId);
        }, delay);
        timer.unref();
        this.imageBuildRetries.set(imageId, timer);
    }
    private async publishAgentImageHint(hint: {
        areas: string[];
        chats: Array<{
            chatId: string;
            pts: string;
        }>;
        sequence: string;
    }): Promise<void> {
        await this.publishAgentHint(hint);
    }
    private async publishAgentHint(hint: {
        areas: string[];
        chats: Array<{
            chatId: string;
            pts: string;
        }>;
        sequence: string;
    }): Promise<void> {
        try {
            await this.pubsub.publish(realtimeTopics.server, {
                type: "sync",
                ...hint,
            });
        } catch (error) {
            this.onError(error);
        }
    }
    private async agentEffortConfiguration(context: {
        agentUserId: string;
        defaultEffort?: string;
        effort?: string;
        sessionId: string;
    }): Promise<{
        agentUserId: string;
        effort: string;
        options: string[];
    }> {
        const configuration = await this.daemon.effortConfiguration(
            context.sessionId,
            this.shutdown.signal,
        );
        const effort =
            [context.effort, context.defaultEffort].find(
                (candidate) => candidate && configuration.options.includes(candidate),
            ) ?? configuration.effort;
        return {
            agentUserId: context.agentUserId,
            effort,
            options: configuration.options,
        };
    }
    private async reconcileAgentEfforts(): Promise<void> {
        const bindings = await agentEffortBindingList(this.executor);
        const byAgent = new Map<string, typeof bindings>();
        for (const binding of bindings) {
            const group = byAgent.get(binding.agentUserId) ?? [];
            group.push(binding);
            byAgent.set(binding.agentUserId, group);
        }
        for (const [agentUserId, agentBindings] of byAgent) {
            let defaultEffort = agentBindings[0]?.defaultEffort;
            if (!defaultEffort) {
                defaultEffort = (
                    await this.daemon.effortConfiguration(
                        agentBindings[0]!.sessionId,
                        this.shutdown.signal,
                    )
                ).effort;
                const hint = await agentEffortInitialize(this.executor, agentUserId, defaultEffort);
                if (hint) await this.publishAgentHint(hint);
            }
            await Promise.all(
                agentBindings.map((binding) =>
                    this.reconcileSessionEffort(
                        binding.sessionId,
                        binding.effort ?? defaultEffort!,
                    ),
                ),
            );
        }
    }
    private async reconcileFunctionPermissions(): Promise<void> {
        const sessionIds = [
            ...new Set(
                (await agentEffortBindingList(this.executor)).map(({ sessionId }) => sessionId),
            ),
        ];
        await Promise.all(
            sessionIds.map((sessionId) =>
                this.daemon.ensureFunctionPermission(sessionId, this.shutdown.signal),
            ),
        );
    }
    private async reconcileSessionEffort(sessionId: string, effort: string): Promise<void> {
        const current = await this.daemon.effortConfiguration(sessionId, this.shutdown.signal);
        if (current.effort === effort) return;
        if (!current.options.includes(effort))
            throw new CollaborationError(
                "conflict",
                `Rig session does not support the agent's '${effort}' effort setting`,
            );
        await this.daemon.changeEffort(sessionId, effort, this.shutdown.signal);
    }
    private async requireAgentSecret(actorUserId: string, secretId: string): Promise<void> {
        await agentSecretAuthorizeManagement(this.executor, actorUserId, "assignSecrets");
        const secrets = await this.daemon.listSecrets(this.shutdown.signal);
        if (!secrets.some((secret) => secret.id === secretId))
            throw new CollaborationError("not_found", "Agent secret was not found");
    }
    private async agentSecret(actorUserId: string, secretId: string): Promise<AgentSecretSummary> {
        const { secrets } = await this.listAgentSecrets(actorUserId);
        const secret = secrets.find((candidate) => candidate.id === secretId);
        if (!secret) throw new CollaborationError("not_found", "Agent secret was not found");
        return secret;
    }
    private async reconcileSecretBindings(
        input: {
            agentUserId?: string;
            chatId?: string;
        } = {},
    ): Promise<void> {
        const bindings = await agentSecretBindingList(this.executor, input);
        await Promise.all(
            bindings.map((binding) =>
                this.daemon.reconcileSessionSecrets(
                    binding.sessionId,
                    async () => {
                        const [secrets, latestBindings] = await Promise.all([
                            this.daemon.listSecrets(this.shutdown.signal),
                            agentSecretBindingList(this.executor, {
                                agentUserId: binding.agentUserId,
                                chatId: binding.chatId,
                            }),
                        ]);
                        const managedSecretIds = secrets.map((secret) => secret.id);
                        const registered = new Set(managedSecretIds);
                        const latest = latestBindings.find(
                            (candidate) => candidate.sessionId === binding.sessionId,
                        );
                        return {
                            desiredSecretIds: (latest?.secretIds ?? []).filter((secretId) =>
                                registered.has(secretId),
                            ),
                            managedSecretIds,
                        };
                    },
                    this.shutdown.signal,
                ),
            ),
        );
    }
    private async trackGlobalEvents(): Promise<void> {
        let checkpoint = await rigEventGetCheckpoint(this.executor);
        let reportedFailure = false;
        while (!this.stopping) {
            try {
                let ignoredSinceCheckpoint = 0;
                await this.daemon.watchGlobalEvents(
                    checkpoint.cursor,
                    async (entry) => {
                        if (isRelevantRigEvent(entry.event)) {
                            await this.applyGlobalEvent(entry);
                            checkpoint = await rigEventCheckpoint(
                                this.executor,
                                entry.cursor,
                                ignoredSinceCheckpoint + 1,
                            );
                            ignoredSinceCheckpoint = 0;
                            checkpoint = await this.trimGlobalEventsIfDue(checkpoint);
                            return;
                        }
                        ignoredSinceCheckpoint += 1;
                        if (ignoredSinceCheckpoint < IGNORED_EVENT_CHECKPOINT_INTERVAL) return;
                        checkpoint = await rigEventCheckpoint(
                            this.executor,
                            entry.cursor,
                            ignoredSinceCheckpoint,
                        );
                        ignoredSinceCheckpoint = 0;
                        checkpoint = await this.trimGlobalEventsIfDue(checkpoint);
                    },
                    this.shutdown.signal,
                );
                reportedFailure = false;
            } catch (error) {
                if (this.shutdown.signal.aborted) return;
                if (!reportedFailure) this.onError(error);
                reportedFailure = true;
                await delay(EVENT_RETRY_INTERVAL_MS, this.shutdown.signal);
            }
        }
    }
    private async trimGlobalEventsIfDue(
        checkpoint: RigEventCheckpoint,
    ): Promise<RigEventCheckpoint> {
        if (checkpoint.cursor === undefined || checkpoint.eventsSinceTrim === 0) return checkpoint;
        const trimDueByCount = checkpoint.eventsSinceTrim >= TRIM_EVENT_INTERVAL;
        const trimDueByTime =
            Date.now() - sqliteTimestamp(checkpoint.lastTrimmedAt) >= TRIM_TIME_INTERVAL_MS;
        if (!trimDueByCount && !trimDueByTime) return checkpoint;
        await this.daemon.trimGlobalEvents(checkpoint.cursor, this.shutdown.signal);
        return rigEventMarkTrimmed(this.executor, checkpoint.cursor);
    }
    private async applyGlobalEvent(entry: RigGlobalEvent): Promise<void> {
        const event = entry.event;
        if (event.type === "external_tool_call_requested" && event.data.call) {
            const call = event.data.call;
            const result = call.skill
                ? await this.executePluginSkillRead(
                      event.sessionId,
                      call.id,
                      call.definition.name,
                      call.skill,
                  )
                : await this.executePluginFunctionCall(
                      event.sessionId,
                      call.id,
                      call.definition.name,
                      call.arguments,
                  );
            await this.daemon.resolveExternalToolCall(
                event.sessionId,
                call.id,
                result,
                this.shutdown.signal,
            );
            return;
        }
        const runId = event.data.runId;
        if (event.type === "message_submitted" && runId) {
            const text = messageText(event.data.message);
            if (text)
                await agentRunAttach(this.executor, {
                    runId,
                    sessionId: event.sessionId,
                    text,
                });
            return;
        }
        if (!runId || (event.type !== "run_finished" && event.type !== "run_error")) return;
        let turn = await agentTurnGetRunning(this.executor, event.sessionId, runId);
        if (!turn) return;
        if (turn.runId === undefined || turn.baselineMessageCount === undefined) {
            const baselineMessageCount =
                turn.baselineMessageCount ??
                (await this.daemon.submittedTurnBaseline(
                    turn.sessionId,
                    turn.text,
                    this.shutdown.signal,
                ));
            const checkpointed = await agentTurnCheckpoint(this.executor, {
                agentUserId: turn.agentUserId,
                baselineMessageCount,
                runId,
                userMessageId: turn.userMessageId,
                workerId: turn.workerId,
            });
            if (!checkpointed) return;
            turn = {
                ...turn,
                baselineMessageCount,
                runId,
            };
        }
        if (event.type === "run_error") {
            await this.failTurn(turn, event.data.errorMessage ?? "Rig run failed.");
            return;
        }
        const inspection = await this.daemon.inspectTurn(
            turn.sessionId,
            turn.baselineMessageCount ?? 0,
            turn.text,
            this.shutdown.signal,
        );
        if (inspection.kind === "completed") {
            await this.completeTurn(turn, inspection.text);
            return;
        }
        if (inspection.kind === "failed") {
            await this.failTurn(turn, inspection.error);
            return;
        }
        throw new Error(`Rig run ${runId} finished before its session snapshot was complete.`);
    }

    private async executePluginFunctionCall(
        sessionId: string,
        callId: string,
        functionName: string,
        args: unknown,
    ): Promise<PluginFunctionResult> {
        return this.executeDurablePluginCall(sessionId, callId, async () => {
            if (!this.pluginCapabilities)
                return {
                    status: "failed" as const,
                    error: {
                        code: "plugin_functions_unavailable",
                        message: "Plugin functions are unavailable on this server",
                    },
                };
            const chatId = await agentChatGetIdBySession(this.executor, sessionId);
            if (!chatId)
                return {
                    status: "failed" as const,
                    error: {
                        code: "plugin_chat_unavailable",
                        message: "The agent session is not bound to one current chat",
                    },
                };
            return this.pluginCapabilities.callFunction(
                functionName,
                args,
                { chatId, sessionId, callId },
                this.shutdown.signal,
            );
        });
    }

    private async executePluginSkillRead(
        sessionId: string,
        callId: string,
        functionName: string,
        skill: PluginSkillDefinition,
    ): Promise<PluginFunctionResult> {
        return this.executeDurablePluginCall(sessionId, callId, () => {
            if (functionName !== "read_skill")
                return Promise.resolve({
                    status: "failed" as const,
                    error: {
                        code: "plugin_skill_invalid",
                        message: "Rig requested a durable skill through an unknown function",
                    },
                });
            return this.pluginCapabilities
                ? this.pluginCapabilities.readSkill(skill, this.shutdown.signal)
                : Promise.resolve({
                      status: "failed" as const,
                      error: {
                          code: "plugin_skills_unavailable",
                          message: "Plugin skills are unavailable on this server",
                      },
                  });
        });
    }

    private async executeDurablePluginCall(
        sessionId: string,
        callId: string,
        execute: () => Promise<PluginFunctionResult>,
    ): Promise<PluginFunctionResult> {
        const leaseToken = createId();
        for (;;) {
            this.shutdown.signal.throwIfAborted();
            const now = Date.now();
            const claim = await pluginFunctionResultAcquire(this.executor, {
                callId,
                leaseExpiresAt: now + PLUGIN_FUNCTION_LEASE_MS,
                leaseToken,
                now,
                sessionId,
            });
            if (claim.kind === "replay") return claim.result;
            if (claim.kind === "in_progress") {
                await delay(
                    Math.min(
                        Math.max(claim.retryAt - now, EVENT_RETRY_INTERVAL_MS),
                        PLUGIN_FUNCTION_WAIT_INTERVAL_MS,
                    ),
                    this.shutdown.signal,
                );
                continue;
            }
            const result = await execute();
            return pluginFunctionResultComplete(this.executor, {
                callId,
                leaseToken,
                result,
                sessionId,
            });
        }
    }
    private startDrain(chatId: string): void {
        if (this.stopping || this.drains.has(chatId)) return;
        const task = this.drainChat(chatId)
            .catch((error) => this.onError(error))
            .finally(async () => {
                this.drains.delete(chatId);
                if (this.stopping) return;
                try {
                    if (await agentTurnHasRunnable(this.executor, chatId)) this.startDrain(chatId);
                } catch (error) {
                    this.onError(error);
                }
            });
        this.drains.set(chatId, task);
    }
    private async drainChat(chatId: string): Promise<void> {
        for (;;) {
            if (this.stopping) return;
            const input = await agentTurnTakeNext(this.executor, chatId, this.workerId).catch(
                (error) => {
                    this.onError(error);
                    return undefined;
                },
            );
            if (!input) return;
            try {
                const traced = await agentTurnTraceStart(this.executor, input);
                if (traced) await this.publishAgentReplyHint(input.chatId, traced.hint);
                await this.startAgentActivity(input);
                await this.startTyping(input);
                const submission = await this.ensureTurnSubmitted(input);
                const inspection = submission.inspection;
                if (inspection.kind === "completed") {
                    await this.completeTurn(input, inspection.text);
                    continue;
                }
                if (inspection.kind === "failed") {
                    await this.failTurn(input, inspection.error);
                    continue;
                }
                this.startTurnStream(input, submission);
                return;
            } catch (error) {
                if (this.shutdown.signal.aborted) return;
                try {
                    await this.failTurn(
                        input,
                        error instanceof Error ? error.message : String(error),
                    );
                } catch (persistenceError) {
                    this.onError(persistenceError);
                    return;
                }
            }
        }
    }
    private async ensureTurnSubmitted(input: AgentTurnWork): Promise<AgentTurnSubmission> {
        let baselineMessageCount = input.baselineMessageCount;
        let lastSessionEventId = input.lastSessionEventId;
        let runId = input.runId;
        if (baselineMessageCount === undefined) {
            if (runId) {
                baselineMessageCount = await this.retryRig(() =>
                    this.daemon.submittedTurnBaseline(
                        input.sessionId,
                        input.text,
                        this.shutdown.signal,
                    ),
                );
            } else {
                const checkpoint = await this.retryRig(() =>
                    this.daemon.sessionCheckpoint(input.sessionId, this.shutdown.signal),
                );
                baselineMessageCount = checkpoint.messageCount;
                lastSessionEventId = checkpoint.lastEventId;
            }
            const checkpointed = await agentTurnCheckpoint(this.executor, {
                agentUserId: input.agentUserId,
                baselineMessageCount,
                lastSessionEventId,
                runId,
                userMessageId: input.userMessageId,
                workerId: input.workerId,
            });
            if (!checkpointed)
                throw new AgentTurnStreamStopped(
                    `Agent turn ${input.userMessageId} lease was lost before submission.`,
                );
        }
        const existing = await this.retryRig(() =>
            this.daemon.inspectTurn(
                input.sessionId,
                baselineMessageCount,
                input.text,
                this.shutdown.signal,
            ),
        );
        if (runId || existing.kind !== "not_submitted")
            return {
                inspection: existing,
                ...(lastSessionEventId === undefined
                    ? {}
                    : {
                          lastSessionEventId,
                      }),
                ...(runId === undefined
                    ? {}
                    : {
                          runId,
                      }),
            };
        const [externalTools, skills] = await Promise.all([
            this.pluginCapabilities?.listFunctions(this.shutdown.signal) ?? [],
            this.pluginCapabilities?.listSkills(this.shutdown.signal) ?? [],
        ]);
        for (;;) {
            let submitted: {
                eventId: string;
                runId: string;
            };
            try {
                submitted = await this.daemon.submitTurn(
                    input.sessionId,
                    input.text,
                    externalTools,
                    skills,
                    this.shutdown.signal,
                );
            } catch (error) {
                if (this.shutdown.signal.aborted) throw error;
                const recovered = await this.retryRig(() =>
                    this.daemon.inspectTurn(
                        input.sessionId,
                        baselineMessageCount,
                        input.text,
                        this.shutdown.signal,
                    ),
                );
                if (recovered.kind !== "not_submitted")
                    return {
                        inspection: recovered,
                        ...(lastSessionEventId === undefined
                            ? {}
                            : {
                                  lastSessionEventId,
                              }),
                        ...(runId === undefined
                            ? {}
                            : {
                                  runId,
                              }),
                    };
                if (!isRetryableRigError(error)) throw error;
                await delay(EVENT_RETRY_INTERVAL_MS, this.shutdown.signal);
                continue;
            }
            runId = submitted.runId;
            lastSessionEventId = submitted.eventId;
            const checkpointed = await agentTurnCheckpoint(this.executor, {
                agentUserId: input.agentUserId,
                baselineMessageCount,
                lastSessionEventId,
                runId,
                userMessageId: input.userMessageId,
                workerId: input.workerId,
            });
            if (!checkpointed)
                throw new AgentTurnStreamStopped(
                    `Agent turn ${input.userMessageId} lease was lost after submission.`,
                );
            return {
                inspection: {
                    kind: "running",
                },
                lastSessionEventId,
                runId,
            };
        }
    }
    private startTurnStream(input: AgentTurnWork, submission: AgentTurnSubmission): void {
        if (this.stopping || this.turnStreams.has(input.userMessageId)) return;
        const controller = new AbortController();
        let streamFailure: unknown;
        let streamFailureReported = false;
        const rememberStreamFailure = (error: unknown) => {
            if (error instanceof AgentTurnStreamStopped) return;
            streamFailure ??= error;
            if (!streamFailureReported && !this.shutdown.signal.aborted) {
                streamFailureReported = true;
                this.onError(error);
            }
        };
        const output = new AgentReplyStreamOutput(
            submission.lastSessionEventId,
            async (update) => {
                const result = await agentTurnStreamReply(this.executor, {
                    agentUserId: input.agentUserId,
                    actorUserId: input.actorUserId,
                    eventId: update.eventId,
                    expectedEventId: update.expectedEventId,
                    sessionId: input.sessionId,
                    streamCommittedText: update.streamCommittedText,
                    text: update.text,
                    traceUpdates: update.traceUpdates,
                    subagents: update.subagents,
                    backgroundTerminals: update.backgroundTerminals,
                    userMessageId: input.userMessageId,
                    workerId: input.workerId,
                });
                if (!result.applied)
                    throw new AgentTurnStreamStopped(
                        `Agent turn ${input.userMessageId} stream lease or cursor was lost.`,
                    );
                if (result.hint) await this.publishAgentReplyHint(input.chatId, result.hint);
            },
            (error) => {
                controller.abort();
                rememberStreamFailure(error);
            },
        );
        let task!: Promise<void>;
        task = this.consumeTurnStream(input, submission, output, controller.signal)
            .catch((error) => {
                if (
                    !(error instanceof AgentTurnStreamStopped) &&
                    !controller.signal.aborted &&
                    !this.shutdown.signal.aborted
                )
                    rememberStreamFailure(error);
            })
            .finally(async () => {
                await output.finish().catch(rememberStreamFailure);
                output.close();
                if (this.turnStreams.get(input.userMessageId)?.task === task)
                    this.turnStreams.delete(input.userMessageId);
                if (streamFailure !== undefined && !this.shutdown.signal.aborted) {
                    try {
                        await this.failTurn(input, agentTurnStreamError(streamFailure));
                    } catch (error) {
                        this.clearTypingRenewal(input.chatId, input.userMessageId);
                        this.clearAgentActivity(input.userMessageId);
                        this.onError(error);
                    }
                }
            });
        this.turnStreams.set(input.userMessageId, {
            controller,
            output,
            task,
        });
    }
    private async consumeTurnStream(
        input: AgentTurnWork,
        submission: AgentTurnSubmission,
        output: AgentReplyStreamOutput,
        signal: AbortSignal,
    ): Promise<void> {
        let committedText = input.streamCommittedText;
        let partialText = "";
        let runId = submission.runId;
        let after = submission.lastSessionEventId;
        while (!signal.aborted && !this.shutdown.signal.aborted) {
            try {
                await this.daemon.watchSessionEvents(
                    input.sessionId,
                    after,
                    async (event) => {
                        if (signal.aborted) return;
                        let shouldPersist = false;
                        if (!runId && event.type === "message_submitted") {
                            const submittedText = messageText(event.data.message);
                            if (event.data.runId && submittedText === input.text) {
                                runId = event.data.runId;
                                await agentRunAttach(this.executor, {
                                    runId,
                                    sessionId: input.sessionId,
                                    text: input.text,
                                });
                                shouldPersist = true;
                            }
                        }
                        if (
                            runId &&
                            (event.data.runId === runId || event.type === "subagent_changed")
                        ) {
                            const traceUpdates = await this.updateAgentActivity(input, event);
                            if (traceUpdates.length > 0) shouldPersist = true;
                            if (event.type === "agent_event") {
                                const nextPartial = agentLoopText(event);
                                if (nextPartial !== undefined) {
                                    partialText = nextPartial;
                                    shouldPersist = true;
                                }
                            } else if (event.type === "agent_message") {
                                const completed = messageText(event.data.message);
                                if (completed) {
                                    committedText = appendAgentText(committedText, completed);
                                    partialText = "";
                                    shouldPersist = true;
                                }
                            }
                            if (shouldPersist) {
                                const activity = this.agentActivities.get(input.userMessageId);
                                output.add({
                                    eventId: event.id,
                                    streamCommittedText: committedText,
                                    text: appendAgentText(committedText, partialText),
                                    traceUpdates,
                                    ...(activity
                                        ? {
                                              subagents: activitySubagents(activity),
                                              backgroundTerminals:
                                                  activityBackgroundTerminals(activity),
                                          }
                                        : {}),
                                });
                                shouldPersist = false;
                            }
                        }
                        if (shouldPersist)
                            output.add({
                                eventId: event.id,
                                streamCommittedText: committedText,
                                text: appendAgentText(committedText, partialText),
                                traceUpdates: [],
                            });
                    },
                    signal,
                );
                after = output.lastEventId;
            } catch (error) {
                if (signal.aborted || this.shutdown.signal.aborted) return;
                await output.finish();
                after = output.lastEventId;
                if (!isRetryableRigError(error)) throw error;
                await delay(EVENT_RETRY_INTERVAL_MS, signal);
            }
        }
    }
    private async stopTurnStream(input: AgentTurnWork): Promise<void> {
        const stream = this.turnStreams.get(input.userMessageId);
        if (!stream) return;
        stream.controller.abort();
        await stream.task;
    }
    private async publishAgentReplyHint(
        chatId: string,
        hint: {
            areas: string[];
            chats: Array<{
                chatId: string;
                pts: string;
            }>;
            sequence: string;
        },
    ): Promise<void> {
        const event = {
            type: "sync" as const,
            ...hint,
        };
        try {
            await Promise.all([
                this.pubsub.publish(realtimeTopics.server, event),
                this.pubsub.publish(realtimeTopics.chat(chatId), event),
            ]);
        } catch (error) {
            this.onError(error);
        }
    }
    private async retryRig<T>(action: () => Promise<T>): Promise<T> {
        for (;;) {
            try {
                return await action();
            } catch (error) {
                if (this.shutdown.signal.aborted || !isRetryableRigError(error)) throw error;
                await delay(EVENT_RETRY_INTERVAL_MS, this.shutdown.signal);
            }
        }
    }
    private async completeTurn(input: AgentTurnWork, text: string): Promise<void> {
        await this.stopTurnStream(input);
        const result = await agentTurnComplete(this.executor, {
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            text,
            workerId: input.workerId,
        });
        if (!result) {
            this.clearTypingRenewal(input.chatId, input.userMessageId);
            this.clearAgentActivity(input.userMessageId);
            return;
        }
        await this.publishAgentReplyHint(input.chatId, result.hint);
        await this.stopAgentActivity(input);
        await this.stopTyping(input);
        this.startDrain(input.chatId);
    }
    private async failTurn(input: AgentTurnWork, error: string): Promise<void> {
        await this.stopTurnStream(input);
        const result = await agentTurnFail(this.executor, {
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            error,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            workerId: input.workerId,
        });
        if (!result) {
            this.clearTypingRenewal(input.chatId, input.userMessageId);
            this.clearAgentActivity(input.userMessageId);
            return;
        }
        await this.publishAgentReplyHint(input.chatId, result.hint);
        await this.stopAgentActivity(input);
        await this.stopTyping(input);
        this.startDrain(input.chatId);
    }
    private async startAgentActivity(input: AgentTurnWork): Promise<void> {
        if (this.agentActivities.has(input.userMessageId)) return;
        let snapshot:
            | {
                  backgroundProcesses: readonly RigBackgroundProcess[];
                  subagents: readonly RigSubagentSummary[];
              }
            | undefined;
        try {
            snapshot = await this.daemon.turnActivity(input.sessionId, this.shutdown.signal);
        } catch (error) {
            this.onError(error);
        }
        let activity!: ActiveAgentActivity;
        const timer = setInterval(() => {
            if (this.agentActivities.get(input.userMessageId) !== activity) return;
            void this.publishAgentActivity(input, activity, true).catch(this.onError);
        }, AGENT_ACTIVITY_RENEW_INTERVAL_MS);
        timer.unref();
        activity = {
            backgroundTerminals: new Map(
                (snapshot?.backgroundProcesses ?? [])
                    .slice(0, MAX_TRACE_COLLECTION_ITEMS)
                    .map((process) => {
                        const terminal = backgroundTerminalSummary(process, Date.now());
                        return [terminal.id, terminal];
                    }),
            ),
            lastOccurredAt: 0,
            phase: "thinking",
            startedAt: sqliteTimestamp(input.startedAt),
            subagents: new Map(
                (snapshot?.subagents ?? [])
                    .filter(subagentIsActive)
                    .slice(0, MAX_TRACE_COLLECTION_ITEMS)
                    .map((subagent) => {
                        const summary = subagentSummary(subagent);
                        return [summary.id, summary];
                    }),
            ),
            timer,
            tokenCounts: new Map(),
            toolNames: new Map(),
            userMessageId: input.userMessageId,
        };
        this.agentActivities.set(input.userMessageId, activity);
        try {
            await this.publishAgentActivity(input, activity, true);
        } catch (error) {
            this.onError(error);
        }
    }
    private async updateAgentActivity(
        input: AgentTurnWork,
        event: RigEvent,
    ): Promise<AgentTurnTraceUpdate[]> {
        const activity = this.agentActivities.get(input.userMessageId);
        if (!activity) return [];
        const traceUpdates = agentTurnTraceUpdates(event, activity);
        if (
            event.type === "run_started" &&
            Number.isSafeInteger(event.createdAt) &&
            event.createdAt >= 0
        )
            activity.startedAt = Math.min(activity.startedAt, event.createdAt);
        const phase = agentActivityPhase(event);
        const phaseChanged = phase !== undefined && phase !== activity.phase;
        if (phase !== undefined) activity.phase = phase;
        const workChanged = agentActivityWorkApply(activity, event);
        const usage = agentEventTokenCount(event);
        if (usage) activity.tokenCounts.set(usage.messageId, usage.tokenCount);
        if (!phaseChanged && !workChanged) return traceUpdates;
        try {
            await this.publishAgentActivity(input, activity, true);
        } catch (error) {
            this.onError(error);
        }
        return traceUpdates;
    }
    private async stopAgentActivity(input: AgentTurnWork): Promise<void> {
        const activity = this.agentActivities.get(input.userMessageId);
        this.clearAgentActivity(input.userMessageId);
        if (!activity) return;
        try {
            await this.publishAgentActivity(input, activity, false);
        } catch (error) {
            this.onError(error);
        }
    }
    private clearAgentActivity(userMessageId: string): void {
        const activity = this.agentActivities.get(userMessageId);
        if (activity) clearInterval(activity.timer);
        this.agentActivities.delete(userMessageId);
    }
    private publishAgentActivity(
        input: AgentTurnWork,
        activity: ActiveAgentActivity,
        active: boolean,
    ): Promise<void> {
        const occurredAt = Math.max(Date.now(), activity.lastOccurredAt + 1);
        activity.lastOccurredAt = occurredAt;
        const tokenCount = boundedInteger(
            [...activity.tokenCounts.values()].reduce(
                (total, count) => Math.min(Number.MAX_SAFE_INTEGER, total + count),
                0,
            ),
            0,
        );
        return this.pubsub.publish(realtimeTopics.chat(input.chatId), {
            type: "agent.activity",
            chatId: input.chatId,
            agentUserId: input.agentUserId,
            turnId: input.userMessageId,
            active,
            phase: activity.phase,
            tokenCount,
            startedAt: Math.min(boundedTimestamp(activity.startedAt), occurredAt),
            occurredAt,
            subagents: activitySubagents(activity),
            backgroundTerminals: activityBackgroundTerminals(activity),
            ...(active
                ? {
                      expiresAt: occurredAt + AGENT_ACTIVITY_TTL_MS,
                  }
                : {}),
        });
    }
    private async startTyping(input: AgentTurnWork): Promise<void> {
        if (this.typingRenewals.has(input.chatId)) return;
        try {
            await this.publishTyping(input, true);
        } catch (error) {
            this.onError(error);
        }
        let renewal!: ActiveTypingRenewal;
        const timer = setInterval(() => {
            void agentTurnRenewLease(this.executor, {
                agentUserId: input.agentUserId,
                userMessageId: input.userMessageId,
                workerId: input.workerId,
            })
                .then(async (renewed) => {
                    if (this.typingRenewals.get(input.chatId) !== renewal) return;
                    if (!renewed) {
                        this.clearTypingRenewal(input.chatId, input.userMessageId);
                        this.clearAgentActivity(input.userMessageId);
                        this.turnStreams.get(input.userMessageId)?.controller.abort();
                        return;
                    }
                    await this.publishTyping(input, true);
                })
                .catch(this.onError);
        }, TYPING_RENEW_INTERVAL_MS);
        timer.unref();
        renewal = {
            timer,
            userMessageId: input.userMessageId,
        };
        this.typingRenewals.set(input.chatId, renewal);
    }
    private async stopTyping(input: AgentTurnWork): Promise<void> {
        this.clearTypingRenewal(input.chatId, input.userMessageId);
        try {
            await this.publishTyping(input, false);
        } catch (error) {
            this.onError(error);
        }
    }
    private clearTypingRenewal(chatId: string, userMessageId?: string): void {
        const renewal = this.typingRenewals.get(chatId);
        if (userMessageId && renewal?.userMessageId !== userMessageId) return;
        if (renewal) clearInterval(renewal.timer);
        this.typingRenewals.delete(chatId);
    }
    private publishTyping(input: AgentTurnWork, active: boolean): Promise<void> {
        const occurredAt = Date.now();
        return this.pubsub.publish(realtimeTopics.chat(input.chatId), {
            type: "typing",
            chatId: input.chatId,
            userId: input.agentUserId,
            active,
            occurredAt,
            ...(active
                ? {
                      expiresAt: occurredAt + TYPING_TTL_MS,
                  }
                : {}),
        });
    }
}
class AgentTurnStreamStopped extends Error {
    constructor(message: string) {
        super(message);
        this.name = "AgentTurnStreamStopped";
    }
}
class AgentReplyStreamOutput {
    private activeFlush?: Promise<void>;
    private failure?: unknown;
    private flushTimer?: ReturnType<typeof setTimeout>;
    private pending?: {
        eventId: string;
        streamCommittedText: string;
        text: string;
        traceUpdates: AgentTurnTraceUpdate[];
        subagents?: readonly AgentTurnSubagentSummary[];
        backgroundTerminals?: readonly AgentTurnBackgroundTerminalSummary[];
    };
    private persistedTextLength = 0;
    constructor(
        private persistedEventId: string | undefined,
        private readonly persist: (update: {
            eventId: string;
            expectedEventId?: string;
            streamCommittedText: string;
            text: string;
            traceUpdates: readonly AgentTurnTraceUpdate[];
            subagents?: readonly AgentTurnSubagentSummary[];
            backgroundTerminals?: readonly AgentTurnBackgroundTerminalSummary[];
        }) => Promise<void>,
        private readonly onError: (error: unknown) => void,
    ) {}
    get lastEventId(): string | undefined {
        return this.persistedEventId;
    }
    add(update: {
        eventId: string;
        streamCommittedText: string;
        text: string;
        traceUpdates: readonly AgentTurnTraceUpdate[];
        subagents?: readonly AgentTurnSubagentSummary[];
        backgroundTerminals?: readonly AgentTurnBackgroundTerminalSummary[];
    }): void {
        if (this.failure) return;
        const traces = new Map(
            (this.pending?.traceUpdates ?? []).map((trace) => [trace.traceKey, trace]),
        );
        for (const trace of update.traceUpdates) {
            if (!traces.has(trace.traceKey) && traces.size >= MAX_PENDING_TRACE_UPDATES) continue;
            traces.delete(trace.traceKey);
            traces.set(trace.traceKey, trace);
        }
        this.pending = {
            ...update,
            traceUpdates: [...traces.values()],
            subagents: update.subagents ?? this.pending?.subagents,
            backgroundTerminals: update.backgroundTerminals ?? this.pending?.backgroundTerminals,
        };
        if (
            Math.abs(update.text.length - this.persistedTextLength) >= AGENT_REPLY_FLUSH_CHARACTERS
        ) {
            this.flushInBackground();
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = undefined;
                this.flushInBackground();
            }, AGENT_REPLY_FLUSH_INTERVAL_MS);
            this.flushTimer.unref();
        }
    }
    async finish(): Promise<void> {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
        for (;;) {
            if (this.failure) throw this.failure;
            if (this.activeFlush) {
                await this.activeFlush;
                continue;
            }
            if (!this.pending) return;
            await this.flushOnce();
        }
    }
    close(): void {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
    }
    private flushInBackground(): void {
        void this.flushAvailable().catch(this.onError);
    }
    private async flushAvailable(): Promise<void> {
        if (this.activeFlush) await this.activeFlush;
        if (this.pending && !this.failure) await this.flushOnce();
    }
    private flushOnce(): Promise<void> {
        if (this.activeFlush) return this.activeFlush;
        const update = this.pending;
        if (!update) return Promise.resolve();
        this.pending = undefined;
        const expectedEventId = this.persistedEventId;
        const task = this.persist({
            ...update,
            ...(expectedEventId === undefined
                ? {}
                : {
                      expectedEventId,
                  }),
        })
            .then(() => {
                this.persistedEventId = update.eventId;
                this.persistedTextLength = update.text.length;
            })
            .catch((error) => {
                this.failure = error;
                throw error;
            });
        this.activeFlush = task.finally(() => {
            this.activeFlush = undefined;
        });
        return this.activeFlush;
    }
}
class AgentImageBuildOutput {
    private activeFlush?: Promise<void>;
    private buffer = "";
    private dirty = false;
    private failure?: unknown;
    private flushTimer?: ReturnType<typeof setTimeout>;
    private lastBuildLogLine?: string;
    private partialLine = "";
    private progress = 1;
    constructor(
        private readonly persist: (update: {
            lastBuildLogLine?: string;
            logChunk: string;
            progress: number;
        }) => Promise<void>,
        private readonly onError: (error: unknown) => void,
    ) {}
    get currentProgress(): number {
        return this.progress;
    }
    add(update: AgentImageBuildUpdate): void {
        if (this.failure) return;
        const logChunk = normalizeBuildLog(update.logChunk);
        if (logChunk) {
            this.buffer += logChunk;
            this.readLastLine(logChunk);
            this.dirty = true;
        }
        if (update.progress !== undefined) {
            const progress = Math.max(1, Math.min(99, Math.trunc(update.progress)));
            if (progress > this.progress) {
                this.progress = progress;
                this.dirty = true;
            }
        }
        if (!this.dirty) return;
        if (this.buffer.length >= IMAGE_BUILD_LOG_FLUSH_CHARACTERS) {
            this.flushInBackground();
            return;
        }
        if (!this.flushTimer) {
            this.flushTimer = setTimeout(() => {
                this.flushTimer = undefined;
                this.flushInBackground();
            }, IMAGE_BUILD_LOG_FLUSH_INTERVAL_MS);
            this.flushTimer.unref();
        }
    }
    async finish(): Promise<void> {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
        for (;;) {
            if (this.failure) throw this.failure;
            if (this.activeFlush) {
                await this.activeFlush;
                continue;
            }
            if (!this.dirty) return;
            await this.flushOnce();
        }
    }
    close(): void {
        if (this.flushTimer) clearTimeout(this.flushTimer);
        this.flushTimer = undefined;
    }
    private flushInBackground(): void {
        void this.flushAvailable().catch(this.onError);
    }
    private async flushAvailable(): Promise<void> {
        if (this.activeFlush) await this.activeFlush;
        if (this.dirty && !this.failure) await this.flushOnce();
    }
    private flushOnce(): Promise<void> {
        if (this.activeFlush) return this.activeFlush;
        if (!this.dirty) return Promise.resolve();
        const update = {
            logChunk: this.buffer,
            progress: this.progress,
            ...(this.lastBuildLogLine === undefined
                ? {}
                : {
                      lastBuildLogLine: this.lastBuildLogLine,
                  }),
        };
        this.buffer = "";
        this.dirty = false;
        const task = this.persist(update).catch((error) => {
            this.failure = error;
            throw error;
        });
        this.activeFlush = task.finally(() => {
            this.activeFlush = undefined;
        });
        return this.activeFlush;
    }
    private readLastLine(logChunk: string): void {
        const combined = this.partialLine + logChunk;
        const lines = combined.split("\n");
        this.partialLine = combined.endsWith("\n") ? "" : (lines.pop() ?? "");
        for (const line of lines) this.rememberLine(line);
        if (this.partialLine) this.rememberLine(this.partialLine);
    }
    private rememberLine(line: string): void {
        const trimmed = line.trim();
        if (!trimmed) return;
        this.lastBuildLogLine = trimmed.slice(-MAX_BUILD_LOG_LINE_CHARACTERS);
    }
}
function isRelevantRigEvent(event: RigEvent): boolean {
    if (event.type === "external_tool_call_requested" && event.data.call) return true;
    if (!event.data.runId) return false;
    return (
        event.type === "message_submitted" ||
        event.type === "run_finished" ||
        event.type === "run_error"
    );
}
function normalizeBuildLog(value: string): string {
    return value.replaceAll("\0", "").replaceAll("\r", "\n");
}
function messageText(message: RigEvent["data"]["message"]): string | undefined {
    return message?.blocks
        .filter((block) => block.type === "text" && block.text)
        .map((block) => block.text)
        .join("");
}
function agentLoopText(event: RigEvent): string | undefined {
    const loopEvent = event.data.event;
    const message = loopEvent?.partial ?? loopEvent?.message ?? loopEvent?.error;
    if (!message?.content) return undefined;
    const textBlocks = message.content.filter(
        (block) => block.type === "text" && block.text !== undefined,
    );
    if (textBlocks.length === 0) return undefined;
    return textBlocks.map((block) => block.text ?? "").join("");
}
function agentActivityWorkApply(activity: ActiveAgentActivity, event: RigEvent): boolean {
    if (event.type === "subagent_changed" && event.data.subagent) {
        const summary = subagentSummary(event.data.subagent);
        if (
            subagentIsActive(event.data.subagent) &&
            (activity.subagents.has(summary.id) ||
                activity.subagents.size < MAX_TRACE_COLLECTION_ITEMS)
        )
            activity.subagents.set(summary.id, summary);
        else activity.subagents.delete(summary.id);
        return true;
    }
    const loop = event.type === "agent_event" ? event.data.event : undefined;
    if (loop?.type !== "background_processes_changed") return false;
    const processes = loop.processes ?? (loop.running === 0 ? [] : undefined);
    if (!processes) return false;
    const observedAt = boundedTimestamp(event.createdAt);
    const next = new Map<string, AgentTurnBackgroundTerminalSummary>();
    for (const process of processes.slice(0, MAX_TRACE_COLLECTION_ITEMS)) {
        const id = boundedIdentifier(String(process.sessionId), "terminal");
        next.set(
            id,
            activity.backgroundTerminals.get(id) ?? backgroundTerminalSummary(process, observedAt),
        );
    }
    activity.backgroundTerminals = next;
    return true;
}
function agentTurnTraceUpdates(
    event: RigEvent,
    activity: ActiveAgentActivity,
): AgentTurnTraceUpdate[] {
    const occurredAt = boundedTimestamp(event.createdAt);
    if (event.type === "subagent_changed" && event.data.subagent) {
        const subagent = subagentSummary(event.data.subagent);
        const status = traceStatusForSubagent(subagent.status);
        return [
            {
                traceKey: `subagent:${subagent.id}`,
                sessionEventId: event.id,
                kind: "subagent",
                title: subagent.description,
                ...(subagent.latestText ? { detail: traceDetail(subagent.latestText) } : {}),
                status,
                occurredAt,
                ...(status === "running" ? {} : { completedAt: occurredAt }),
            },
        ];
    }
    if (event.type === "run_started")
        return [
            {
                traceKey: `run:${event.data.runId ?? "active"}`,
                sessionEventId: event.id,
                kind: "status",
                title: "Thinking",
                status: "running",
                occurredAt,
            },
        ];
    if (event.type === "agent_message") {
        const detail = messageText(event.data.message);
        return detail
            ? [
                  {
                      traceKey: `response:${event.data.message?.id ?? "active"}`,
                      sessionEventId: event.id,
                      kind: "response",
                      title: "Response completed",
                      detail: traceDetail(detail),
                      status: "complete",
                      occurredAt,
                      completedAt: occurredAt,
                  },
              ]
            : [];
    }
    const loop = event.type === "agent_event" ? event.data.event : undefined;
    const type = loop?.type;
    if (!loop || !type) return [];
    if (type.startsWith("thinking_")) {
        const detail = agentLoopContent(loop, "thinking");
        return [
            {
                traceKey: `reasoning:${loop.partial?.id ?? "active"}:${loop.contentIndex ?? 0}`,
                sessionEventId: event.id,
                kind: "reasoning",
                title: "Reasoning",
                ...(detail ? { detail: traceDetail(detail) } : {}),
                status: type === "thinking_end" ? "complete" : "running",
                occurredAt,
                ...(type === "thinking_end" ? { completedAt: occurredAt } : {}),
            },
        ];
    }
    if (type.startsWith("text_")) {
        const detail = agentLoopContent(loop, "text");
        return [
            {
                traceKey: `response:${loop.partial?.id ?? "active"}:${loop.contentIndex ?? 0}`,
                sessionEventId: event.id,
                kind: "response",
                title: type === "text_end" ? "Response drafted" : "Writing response",
                ...(detail ? { detail: traceDetail(detail) } : {}),
                status: type === "text_end" ? "complete" : "running",
                occurredAt,
                ...(type === "text_end" ? { completedAt: occurredAt } : {}),
            },
        ];
    }
    if (type === "toolcall_end" && loop.toolCall?.id) {
        const toolCallId = boundedIdentifier(loop.toolCall.id, "tool");
        const name = traceSummary(loop.toolCall.name ?? "tool") || "tool";
        if (activity.toolNames.has(toolCallId) || activity.toolNames.size < MAX_TRACKED_TOOL_NAMES)
            activity.toolNames.set(toolCallId, name);
        return [
            {
                traceKey: `tool:${toolCallId}`,
                sessionEventId: event.id,
                kind: "tool",
                title: traceTitle(`Calling ${humanizeTraceToolName(name)}`),
                detail: traceDetail(JSON.stringify(loop.toolCall.arguments ?? {})),
                status: "running",
                occurredAt,
            },
        ];
    }
    if (type === "tool_execution_start" && loop.toolCall?.id) {
        const toolCallId = boundedIdentifier(loop.toolCall.id, "tool");
        const name = traceSummary(loop.toolCall.name ?? "tool") || "tool";
        if (activity.toolNames.has(toolCallId) || activity.toolNames.size < MAX_TRACKED_TOOL_NAMES)
            activity.toolNames.set(toolCallId, name);
        return [
            {
                traceKey: `tool:${toolCallId}`,
                sessionEventId: event.id,
                kind: "tool",
                title: traceTitle(`Running ${humanizeTraceToolName(name)}`),
                detail: traceDetail(JSON.stringify(loop.toolCall.arguments ?? {})),
                status: "running",
                occurredAt,
            },
        ];
    }
    if (
        (type === "tool_execution_progress" || type === "tool_execution_status") &&
        loop.toolCallId
    ) {
        const toolCallId = boundedIdentifier(loop.toolCallId, "tool");
        const name = activity.toolNames.get(toolCallId) ?? "tool";
        const detail = type === "tool_execution_progress" ? loop.display : loop.status;
        return [
            {
                traceKey: `tool:${toolCallId}`,
                sessionEventId: event.id,
                kind: "tool",
                title: traceTitle(`Running ${humanizeTraceToolName(name)}`),
                ...(detail ? { detail: traceDetail(detail) } : {}),
                status: "running",
                occurredAt,
            },
        ];
    }
    if (type === "tool_execution_end" && loop.result?.toolCallId) {
        const toolCallId = boundedIdentifier(loop.result.toolCallId, "tool");
        const name =
            traceSummary(loop.result.toolName ?? activity.toolNames.get(toolCallId) ?? "tool") ||
            "tool";
        activity.toolNames.delete(toolCallId);
        return [
            {
                traceKey: `tool:${toolCallId}`,
                sessionEventId: event.id,
                kind: "tool",
                title: traceTitle(
                    `${humanizeTraceToolName(name)} ${loop.result.isError ? "failed" : "completed"}`,
                ),
                ...(loop.result.display ? { detail: traceDetail(loop.result.display) } : {}),
                status: loop.result.isError ? "failed" : "complete",
                occurredAt,
                completedAt: occurredAt,
            },
        ];
    }
    if (type === "background_processes_changed") {
        const processes = loop.processes ?? (loop.running === 0 ? [] : undefined);
        if (!processes) return [];
        const boundedProcesses = processes.slice(0, MAX_TRACE_COLLECTION_ITEMS);
        const nextIds = new Set(
            boundedProcesses.map((process) =>
                boundedIdentifier(String(process.sessionId), "terminal"),
            ),
        );
        const completed = [...activity.backgroundTerminals.values()]
            .filter((terminal) => !nextIds.has(terminal.id))
            .map((terminal) => ({
                traceKey: `terminal:${terminal.id}`,
                sessionEventId: event.id,
                kind: "terminal" as const,
                title: "Background terminal completed",
                detail: traceDetail(terminal.command),
                status: "complete" as const,
                occurredAt: terminal.startedAt,
                completedAt: occurredAt,
            }));
        const running = boundedProcesses.map((process) => {
            const id = boundedIdentifier(String(process.sessionId), "terminal");
            const existing = activity.backgroundTerminals.get(id);
            return {
                traceKey: `terminal:${id}`,
                sessionEventId: event.id,
                kind: "terminal" as const,
                title: "Background terminal running",
                detail: traceDetail(process.command),
                status: "running" as const,
                occurredAt: existing?.startedAt ?? occurredAt,
            };
        });
        return [...completed, ...running];
    }
    if (type === "inference_iteration_start")
        return [
            {
                traceKey: `inference:${loop.iteration ?? event.id}`,
                sessionEventId: event.id,
                kind: "status",
                title: traceTitle(`Inference ${loop.iteration ?? "started"}`),
                status: "complete",
                occurredAt,
                completedAt: occurredAt,
            },
        ];
    if (type === "context_compacted")
        return [
            {
                traceKey: `context:${event.id}`,
                sessionEventId: event.id,
                kind: "status",
                title: "Context compacted",
                status: "complete",
                occurredAt,
                completedAt: occurredAt,
            },
        ];
    return [];
}
function subagentSummary(subagent: RigSubagentSummary): AgentTurnSubagentSummary {
    const latestText = subagent.latestText ? activityText(subagent.latestText) : "";
    return {
        id: boundedIdentifier(subagent.id, "subagent"),
        depth: boundedInteger(subagent.depth, 1),
        description: activityText(subagent.description) || "Subagent",
        status: subagentStatus(subagent.status),
        ...(latestText ? { latestText } : {}),
        startedAt: boundedTimestamp(subagent.activeSince ?? subagent.createdAt),
        totalTokens: boundedInteger(subagent.totalTokens ?? 0, 0),
    };
}
function subagentIsActive(subagent: RigSubagentSummary): boolean {
    return (
        (subagent.status === "queued" || subagent.status === "running") &&
        !subagent.taskName?.startsWith("workflow_")
    );
}
function traceStatusForSubagent(
    status: AgentTurnSubagentSummary["status"],
): AgentTurnTraceUpdate["status"] {
    if (status === "queued" || status === "running") return "running";
    return status === "error" || status === "aborted" ? "failed" : "complete";
}
function backgroundTerminalSummary(
    process: RigBackgroundProcess,
    startedAt: number,
): AgentTurnBackgroundTerminalSummary {
    return {
        id: boundedIdentifier(String(process.sessionId), "terminal"),
        command: activityText(process.command) || "Background command",
        cwd: activityText(process.cwd) || ".",
        startedAt: boundedTimestamp(startedAt),
    };
}
function activitySubagents(activity: ActiveAgentActivity): AgentTurnSubagentSummary[] {
    return [...activity.subagents.values()].slice(0, MAX_TRACE_COLLECTION_ITEMS);
}
function activityBackgroundTerminals(
    activity: ActiveAgentActivity,
): AgentTurnBackgroundTerminalSummary[] {
    return [...activity.backgroundTerminals.values()].slice(0, MAX_TRACE_COLLECTION_ITEMS);
}
function agentLoopContent(
    loop: NonNullable<RigEvent["data"]["event"]>,
    kind: "text" | "thinking",
): string | undefined {
    const blocks = loop.partial?.content ?? loop.message?.content ?? loop.error?.content ?? [];
    const content = blocks
        .filter((block) => block.type === kind)
        .map((block) => (kind === "text" ? block.text : block.thinking) ?? "")
        .join("");
    return content || (typeof loop.content === "string" ? loop.content : undefined);
}
function humanizeTraceToolName(name: string): string {
    const spaced = name
        .replaceAll(/[_-]+/gu, " ")
        .replaceAll(/([a-z\d])([A-Z])/gu, "$1 $2")
        .trim();
    return spaced ? `${spaced[0]!.toUpperCase()}${spaced.slice(1)}` : "Tool";
}
function traceDetail(value: unknown): string {
    return textValue(value).trim().slice(-MAX_TRACE_DETAIL_CHARACTERS);
}
function traceSummary(value: unknown): string {
    return textValue(value).trim().slice(-MAX_TRACE_SUMMARY_CHARACTERS);
}
function activityText(value: unknown): string {
    return textValue(value).trim().slice(-MAX_ACTIVITY_TEXT_CHARACTERS);
}
function traceTitle(value: string): string {
    return traceSummary(value) || "Agent activity";
}
function boundedIdentifier(value: unknown, prefix: string): string {
    const text = textValue(value);
    const clean = [...text]
        .filter((character) => {
            const code = character.charCodeAt(0);
            return code > 31 && code !== 127;
        })
        .join("");
    if (clean.length > 0 && clean.length <= MAX_TRACE_ID_CHARACTERS) return clean;
    return `${prefix}-${createHash("sha256").update(text).digest("hex").slice(0, 32)}`;
}
function boundedTimestamp(value: unknown): number {
    const now = Date.now();
    return typeof value === "number" && Number.isSafeInteger(value) && value >= 0
        ? Math.min(value, now)
        : now;
}
function boundedInteger(value: unknown, minimum: number): number {
    return typeof value === "number" && Number.isSafeInteger(value)
        ? Math.max(minimum, Math.min(value, Number.MAX_SAFE_INTEGER))
        : minimum;
}
function textValue(value: unknown): string {
    return typeof value === "string"
        ? value
        : value === undefined || value === null
          ? ""
          : String(value);
}
function subagentStatus(value: unknown): AgentTurnSubagentSummary["status"] {
    return value === "idle" ||
        value === "queued" ||
        value === "running" ||
        value === "completed" ||
        value === "aborted" ||
        value === "suspended" ||
        value === "error"
        ? value
        : "error";
}
function agentActivityPhase(event: RigEvent): AgentActivityPhase | undefined {
    if (event.type === "run_started") return "thinking";
    if (event.type === "agent_message")
        return messageText(event.data.message) ? "typing" : "thinking";
    if (event.type !== "agent_event") return undefined;
    const type = event.data.event?.type;
    if (type?.startsWith("text_")) return "typing";
    if (
        type?.startsWith("thinking_") ||
        type?.startsWith("toolcall_") ||
        type?.startsWith("tool_") ||
        type === "inference_iteration_start" ||
        type === "inference_retry" ||
        type === "context_compacted" ||
        type === "permission_review"
    )
        return "thinking";
    return undefined;
}
function agentEventTokenCount(event: RigEvent):
    | {
          messageId: string;
          tokenCount: number;
      }
    | undefined {
    const message =
        event.type === "agent_message"
            ? event.data.message
            : event.type === "agent_event"
              ? (event.data.event?.partial ?? event.data.event?.message ?? event.data.event?.error)
              : undefined;
    if (!message) return undefined;
    const tokenCount = message.usage?.totalTokens;
    if (typeof tokenCount !== "number" || !Number.isSafeInteger(tokenCount) || tokenCount < 0)
        return undefined;
    return {
        messageId: message.id ?? "active-inference",
        tokenCount,
    };
}
function appendAgentText(committedText: string, nextText: string): string {
    if (!nextText) return committedText;
    return committedText ? `${committedText}\n\n${nextText}` : nextText;
}
function sqliteTimestamp(value: string): number {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/u.test(normalized) ? normalized : `${normalized}Z`);
}
function agentImageDefinitionHash(dockerfile: string, buildContext = ""): string {
    return createHash("sha256")
        .update("happy2-agent-image-v1\0")
        .update(buildContext)
        .update("\0")
        .update(dockerfile)
        .digest("hex");
}
function agentImageTag(definitionHash: string): string {
    return `happy2-agent:${definitionHash}`;
}
function agentContainerName(): string {
    return `happy2-agent-${createId()}`;
}
function sandboxDirectories(
    root: string,
    agentUserId: string,
    scopeKind: "users" | "chats",
    scopeId: string,
    conversationId?: string,
) {
    const scope = join(root, "agents", agentUserId, scopeKind, scopeId);
    const sandbox = conversationId ? join(scope, "conversations", conversationId) : scope;
    return {
        home: join(sandbox, "home"),
        workspace: join(sandbox, "workspace"),
    };
}
function agentImageBuildError(error: unknown): string {
    const message = deepestErrorMessage(error);
    return message.slice(0, 16_000) || "Agent image build failed";
}
function deepestErrorMessage(error: unknown, seen = new Set<unknown>()): string {
    if (error === null || error === undefined) return "";
    if (typeof error !== "object") return String(error);
    if (seen.has(error)) return "";
    seen.add(error);
    const candidate = error as { cause?: unknown; message?: unknown };
    if (candidate.cause !== undefined) {
        const cause = deepestErrorMessage(candidate.cause, seen);
        if (cause) return cause;
    }
    return typeof candidate.message === "string" ? candidate.message : "";
}
function agentTurnStreamError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 16_000) || "Agent reply stream failed";
}
function shutdownDeadline(): Promise<void> {
    return new Promise((resolve) => {
        const timer = setTimeout(resolve, 5_000);
        timer.unref();
    });
}
function delay(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        const abort = () => {
            clearTimeout(timer);
            resolve();
        };
        const timer = setTimeout(() => {
            signal.removeEventListener("abort", abort);
            resolve();
        }, milliseconds);
        signal.addEventListener("abort", abort, {
            once: true,
        });
    });
}
