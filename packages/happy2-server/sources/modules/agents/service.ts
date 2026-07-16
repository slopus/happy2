import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CollaborationRepository, RigEventCheckpoint } from "../collaboration/repository.js";
import {
    CollaborationError,
    type AgentSecretSummary,
    type MutationHint,
    type UserSummary,
} from "../collaboration/types.js";
import { realtimeTopics, type PubSub } from "../realtime/index.js";
import {
    isRetryableRigError,
    RigDaemonClient,
    type RigEvent,
    type RigGlobalEvent,
    type RigTurnInspection,
} from "./daemon.js";
import { BUILTIN_AGENT_IMAGES } from "./builtin-images.js";
import type { AgentDockerRuntime, AgentImageBuildUpdate } from "./docker.js";

const IGNORED_EVENT_CHECKPOINT_INTERVAL = 100;
const EVENT_RETRY_INTERVAL_MS = 100;
const TYPING_TTL_MS = 30_000;
const TYPING_RENEW_INTERVAL_MS = 20_000;
const TRIM_EVENT_INTERVAL = 1_000;
const TRIM_TIME_INTERVAL_MS = 24 * 60 * 60_000;
const IMAGE_BUILD_LEASE_RENEW_INTERVAL_MS = 20_000;
const IMAGE_BUILD_LOG_FLUSH_INTERVAL_MS = 500;
const IMAGE_BUILD_LOG_FLUSH_CHARACTERS = 32_768;
const MAX_BUILD_LOG_LINE_CHARACTERS = 1_000;
const MAX_CONCURRENT_IMAGE_BUILDS = 1;
const AGENT_REPLY_FLUSH_INTERVAL_MS = 50;
const AGENT_REPLY_FLUSH_CHARACTERS = 1_024;
const AGENT_CONTAINER_SECURITY = {
    init: true,
    readonlyRootFilesystem: true,
    sharedMemoryBytes: 1024 * 1024 * 1024,
    tmpfs: [
        { target: "/tmp", mode: 0o1777 },
        { target: "/run", mode: 0o755 },
        { target: "/var/tmp", mode: 0o1777 },
        { target: "/var/run", mode: 0o755 },
    ],
} as const;

type AgentTurnWork = NonNullable<Awaited<ReturnType<CollaborationRepository["takeNextAgentTurn"]>>>;

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

export class AgentService {
    private readonly workerId = createId();
    private readonly bindingCreations = new Map<
        string,
        Promise<{ containerName: string; cwd: string; sessionId: string }>
    >();
    private readonly imageBuilds = new Map<string, Promise<void>>();
    private readonly imageMutations = new Map<string, Promise<unknown>>();
    private readonly pendingImageBuilds = new Set<string>();
    private readonly secretMutations = new Map<string, Promise<unknown>>();
    private activeImageBuilds = 0;
    private readonly drains = new Map<string, Promise<void>>();
    private readonly turnStreams = new Map<string, ActiveAgentTurnStream>();
    private readonly typingRenewals = new Map<string, ActiveTypingRenewal>();
    private readonly shutdown = new AbortController();
    private queueTask?: Promise<void>;
    private stopping = false;

    constructor(
        private readonly repository: CollaborationRepository,
        private readonly pubsub: PubSub,
        private readonly daemon: RigDaemonClient,
        private readonly docker: AgentDockerRuntime,
        private readonly defaultCwd: string,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {}

    async createAgent(input: { actorUserId: string; name: string; username: string }) {
        if (!(await this.repository.agentUsernameAvailable(input.username)))
            throw new CollaborationError("conflict", "Agent username is already taken");
        const image = await this.repository.getReadyDefaultAgentImage();
        if (!image)
            throw new CollaborationError(
                "conflict",
                "A ready default agent image must be configured before creating agents",
            );
        const agentUserId = createId();
        const sandbox = sandboxDirectories(this.defaultCwd, agentUserId, input.actorUserId);
        await Promise.all([
            mkdir(sandbox.home, { recursive: true, mode: 0o700 }),
            mkdir(sandbox.workspace, { recursive: true, mode: 0o700 }),
        ]);
        const containerName = agentContainerName();
        await this.docker.createContainer(
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
                this.shutdown.signal,
            );
            return await this.repository.createAgent({
                ...input,
                agentUserId,
                containerName,
                cwd: sandbox.workspace,
                imageId: image.id,
                sessionId: session.id,
            });
        } catch (error) {
            await this.docker.removeContainer(containerName);
            throw error;
        }
    }

    async start(): Promise<void> {
        await this.repository.ensureAgentImageDefinitions(
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
        for (const imageId of await this.repository.listRequestedAgentImageBuildIds())
            this.queueImageBuild(imageId);
        await this.daemon.ensureGlobalEventQueue(this.shutdown.signal);
        await this.reconcileSecretBindings();
        this.queueTask = this.trackGlobalEvents().catch((error) => {
            if (!this.shutdown.signal.aborted) this.onError(error);
        });
        const chatIds = await this.repository.listUnfinishedAgentChatIds();
        for (const chatId of chatIds) this.startDrain(chatId);
    }

    async prepareTurn(input: {
        actorUserId: string;
        chatId: string;
    }): Promise<{ agentUserId: string; sessionId: string } | undefined> {
        const context = await this.repository.getDirectAgentChatContext(
            input.actorUserId,
            input.chatId,
        );
        if (!context) return undefined;
        const binding = await this.ensureAgentBinding(input.actorUserId, input.chatId);
        return binding
            ? { agentUserId: context.agentUserId, sessionId: binding.sessionId }
            : undefined;
    }

    startTurn(chatId: string): void {
        this.startDrain(chatId);
    }

    listAgentImages(actorUserId: string) {
        return this.repository.listAgentImages(actorUserId);
    }

    getAgentImage(actorUserId: string, imageId: string) {
        return this.repository.getAgentImage(actorUserId, imageId);
    }

    async createAgentImage(input: { actorUserId: string; dockerfile: string; name: string }) {
        const definitionHash = agentImageDefinitionHash(input.dockerfile);
        const result = await this.repository.createAgentImage({
            ...input,
            definitionHash,
            dockerTag: agentImageTag(definitionHash),
        });
        await this.publishAgentImageHint(result.hint);
        this.queueImageBuild(result.image.id);
        return result.image;
    }

    async requestAgentImageBuild(input: { actorUserId: string; imageId: string }) {
        const result = await this.repository.requestAgentImageBuild(input);
        await this.publishAgentImageHint(result.hint);
        this.queueImageBuild(result.image.id);
        return result.image;
    }

    async setDefaultAgentImage(input: { actorUserId: string; imageId: string }) {
        const result = await this.repository.setDefaultAgentImage(input);
        await this.publishAgentImageHint(result.hint);
        return result.image;
    }

    async changeAgentImage(input: {
        actorUserId: string;
        agentUserId: string;
        imageId: string;
    }): Promise<{ user: UserSummary; sync?: MutationHint }> {
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
    }): Promise<{ user: UserSummary; sync?: MutationHint }> {
        const context = await this.repository.getAgentImageChangeContext(input);
        if (context.currentImageId === context.image.id) return { user: context.user };

        const replacements: Array<{
            chatId: string;
            containerName: string;
            cwd: string;
            previousContainerName: string;
            previousSessionId: string;
            sessionId: string;
        }> = [];
        let committed = false;
        try {
            for (const binding of context.bindings) {
                const containerName = agentContainerName();
                await this.docker.createContainer(
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
                    await this.docker.removeContainer(containerName);
                    throw error;
                }
            }

            const result = await this.repository.commitAgentImageChange({
                ...input,
                expectedImageId: context.currentImageId,
                replacements,
            });
            if (!result.sync) {
                await Promise.all(
                    replacements.map(({ containerName }) =>
                        this.docker.removeContainer(containerName),
                    ),
                );
                return { user: result.user };
            }

            committed = true;
            await Promise.allSettled(
                replacements.map(({ previousContainerName }) =>
                    this.docker.removeContainer(previousContainerName),
                ),
            ).then((results) => {
                for (const result of results)
                    if (result.status === "rejected") this.onError(result.reason);
            });
            await this.reconcileSecretBindings({ agentUserId: input.agentUserId }).catch(
                this.onError,
            );
            await this.publishAgentHint(result.sync);
            return result;
        } catch (error) {
            if (!committed)
                await Promise.allSettled(
                    replacements.map(({ containerName }) =>
                        this.docker.removeContainer(containerName),
                    ),
                ).then((results) => {
                    for (const result of results)
                        if (result.status === "rejected") this.onError(result.reason);
                });
            throw error;
        }
    }

    async listAgentSecrets(actorUserId: string): Promise<{ secrets: AgentSecretSummary[] }> {
        const assignments = await this.repository.listAgentSecretAssignments(actorUserId);
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

    async createAgentSecret(
        input: AgentSecretCreateInput,
    ): Promise<{ secret: AgentSecretSummary; sync: MutationHint }> {
        return this.serializeAgentSecret(input.id, () => this.createAgentSecretMutation(input));
    }

    private async createAgentSecretMutation(
        input: AgentSecretCreateInput,
    ): Promise<{ secret: AgentSecretSummary; sync: MutationHint }> {
        await this.repository.authorizeAgentSecretManagement(input.actorUserId);
        const secret = await this.daemon.registerSecret(
            {
                id: input.id,
                description: input.description,
                environment: input.environment,
            },
            this.shutdown.signal,
        );
        const sync = await this.repository.recordAgentSecretRegistration({
            actorUserId: input.actorUserId,
            secretId: input.id,
        });
        await this.publishAgentHint(sync);
        const assignments = await this.repository.listAgentSecretAssignments(input.actorUserId);
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

    async deleteAgentSecret(
        input: AgentSecretTargetInput,
    ): Promise<{ removed: boolean; sync: MutationHint }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.deleteAgentSecretMutation(input),
        );
    }

    private async deleteAgentSecretMutation(
        input: AgentSecretTargetInput,
    ): Promise<{ removed: boolean; sync: MutationHint }> {
        await this.repository.authorizeAgentSecretManagement(input.actorUserId);
        const sync = await this.repository.deleteAgentSecretAssignments(input);
        let removed: boolean;
        try {
            removed = await this.daemon.unregisterSecret(input.secretId, this.shutdown.signal);
        } catch (error) {
            await this.publishAgentHint(sync);
            throw error;
        }
        await this.publishAgentHint(sync);
        return { removed, sync };
    }

    async attachAgentSecretToAgent(
        input: AgentSecretAgentInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.attachAgentSecretToAgentMutation(input),
        );
    }

    private async attachAgentSecretToAgentMutation(
        input: AgentSecretAgentInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await this.repository.attachAgentSecretToAgent(input);
        await this.reconcileSecretBindings({ agentUserId: input.agentUserId });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync ? { sync } : {}),
        };
    }

    async detachAgentSecretFromAgent(
        input: AgentSecretAgentInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.detachAgentSecretFromAgentMutation(input),
        );
    }

    private async detachAgentSecretFromAgentMutation(
        input: AgentSecretAgentInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await this.repository.detachAgentSecretFromAgent(input);
        await this.reconcileSecretBindings({ agentUserId: input.agentUserId });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync ? { sync } : {}),
        };
    }

    async attachAgentSecretToChannel(
        input: AgentSecretChannelInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.attachAgentSecretToChannelMutation(input),
        );
    }

    private async attachAgentSecretToChannelMutation(
        input: AgentSecretChannelInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await this.repository.attachAgentSecretToChannel(input);
        await this.reconcileSecretBindings({ chatId: input.channelId });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync ? { sync } : {}),
        };
    }

    async detachAgentSecretFromChannel(
        input: AgentSecretChannelInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        return this.serializeAgentSecret(input.secretId, () =>
            this.detachAgentSecretFromChannelMutation(input),
        );
    }

    private async detachAgentSecretFromChannelMutation(
        input: AgentSecretChannelInput,
    ): Promise<{ secret: AgentSecretSummary; sync?: MutationHint }> {
        await this.requireAgentSecret(input.actorUserId, input.secretId);
        const sync = await this.repository.detachAgentSecretFromChannel(input);
        await this.reconcileSecretBindings({ chatId: input.channelId });
        if (sync) await this.publishAgentHint(sync);
        return {
            secret: await this.agentSecret(input.actorUserId, input.secretId),
            ...(sync ? { sync } : {}),
        };
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
    ): Promise<{ containerName: string; cwd: string; sessionId: string } | undefined> {
        if (this.stopping) return undefined;
        const context = await this.repository.getDirectAgentChatContext(actorUserId, chatId);
        if (!context) return undefined;
        if (context.binding) {
            await this.reconcileSecretBindings({
                agentUserId: context.agentUserId,
                chatId,
            });
            return context.binding;
        }
        const key = `${context.agentUserId}:${chatId}`;
        const pending = this.bindingCreations.get(key);
        if (pending) return pending;
        const creation = (async () => {
            const sandbox = sandboxDirectories(
                this.defaultCwd,
                context.agentUserId,
                context.privateUserId,
            );
            await Promise.all([
                mkdir(sandbox.home, { recursive: true, mode: 0o700 }),
                mkdir(sandbox.workspace, { recursive: true, mode: 0o700 }),
            ]);
            const containerName = agentContainerName();
            await this.docker.createContainer(
                {
                    agentUserId: context.agentUserId,
                    containerName,
                    homeDirectory: sandbox.home,
                    imageId: context.image.id,
                    imageTag: context.image.dockerTag,
                    security: AGENT_CONTAINER_SECURITY,
                    workspaceDirectory: sandbox.workspace,
                },
                this.shutdown.signal,
            );
            try {
                const session = await this.daemon.createSession(
                    sandbox.workspace,
                    containerName,
                    this.shutdown.signal,
                );
                const binding = await this.repository.bindAgentChat({
                    actorUserId,
                    agentUserId: context.agentUserId,
                    chatId,
                    containerName,
                    cwd: sandbox.workspace,
                    imageId: context.image.id,
                    sessionId: session.id,
                });
                if (binding.containerName !== containerName)
                    await this.docker.removeContainer(containerName);
                await this.reconcileSecretBindings({
                    agentUserId: context.agentUserId,
                    chatId,
                });
                return binding;
            } catch (error) {
                await this.docker.removeContainer(containerName);
                throw error;
            }
        })();
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
        for (const stream of this.turnStreams.values()) {
            stream.controller.abort();
            stream.output.close();
        }
        for (const renewal of this.typingRenewals.values()) clearInterval(renewal.timer);
        this.typingRenewals.clear();
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
            this.repository.releaseAgentTurnLeases(this.workerId),
            this.repository.releaseAgentImageBuildLeases(this.workerId),
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
        const claimed = await this.repository.takeAgentImageBuild(imageId, this.workerId);
        if (!claimed) return;
        const build = claimed.build;
        await this.publishAgentImageHint(claimed.hint);
        const output = new AgentImageBuildOutput(
            async ({ lastBuildLogLine, logChunk, progress }) => {
                const hint = await this.repository.recordAgentImageBuildOutput({
                    imageId,
                    logChunk,
                    progress,
                    workerId: this.workerId,
                    ...(lastBuildLogLine === undefined ? {} : { lastBuildLogLine }),
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
            void this.repository
                .renewAgentImageBuildLease(imageId, this.workerId)
                .catch(this.onError)
                .finally(() => {
                    renewalRunning = false;
                });
        }, IMAGE_BUILD_LEASE_RENEW_INTERVAL_MS);
        renewal.unref();
        try {
            const result = await this.docker.buildImage(
                {
                    ...(build.buildContext ? { buildContext: build.buildContext } : {}),
                    dockerfile: build.dockerfile,
                    tag: build.dockerTag,
                },
                {
                    onUpdate: (update) => output.add(update),
                    signal: this.shutdown.signal,
                },
            );
            await output.finish();
            const completed = await this.repository.completeAgentImageBuild({
                dockerImageId: result.imageId,
                imageId,
                workerId: this.workerId,
            });
            if (completed) await this.publishAgentImageHint(completed);
            else if (!this.shutdown.signal.aborted)
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
            const failed = await this.repository.failAgentImageBuild({
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

    private async publishAgentImageHint(hint: {
        areas: string[];
        chats: Array<{ chatId: string; pts: string }>;
        sequence: string;
    }): Promise<void> {
        await this.publishAgentHint(hint);
    }

    private async publishAgentHint(hint: {
        areas: string[];
        chats: Array<{ chatId: string; pts: string }>;
        sequence: string;
    }): Promise<void> {
        try {
            await this.pubsub.publish(realtimeTopics.server, { type: "sync", ...hint });
        } catch (error) {
            this.onError(error);
        }
    }

    private async requireAgentSecret(actorUserId: string, secretId: string): Promise<void> {
        await this.repository.authorizeAgentSecretManagement(actorUserId);
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
        const bindings = await this.repository.listAgentSecretBindings(input);
        await Promise.all(
            bindings.map((binding) =>
                this.daemon.reconcileSessionSecrets(
                    binding.sessionId,
                    async () => {
                        const [secrets, latestBindings] = await Promise.all([
                            this.daemon.listSecrets(this.shutdown.signal),
                            this.repository.listAgentSecretBindings({
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
        let checkpoint = await this.repository.getRigEventCheckpoint();
        let reportedFailure = false;
        while (!this.stopping) {
            try {
                let ignoredSinceCheckpoint = 0;
                await this.daemon.watchGlobalEvents(
                    checkpoint.cursor,
                    async (entry) => {
                        if (isRelevantRigEvent(entry.event)) {
                            await this.applyGlobalEvent(entry);
                            checkpoint = await this.repository.checkpointRigEvent(
                                entry.cursor,
                                ignoredSinceCheckpoint + 1,
                            );
                            ignoredSinceCheckpoint = 0;
                            checkpoint = await this.trimGlobalEventsIfDue(checkpoint);
                            return;
                        }
                        ignoredSinceCheckpoint += 1;
                        if (ignoredSinceCheckpoint < IGNORED_EVENT_CHECKPOINT_INTERVAL) return;
                        checkpoint = await this.repository.checkpointRigEvent(
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
        return this.repository.markRigEventsTrimmed(checkpoint.cursor);
    }

    private async applyGlobalEvent(entry: RigGlobalEvent): Promise<void> {
        const event = entry.event;
        const runId = event.data.runId;
        if (event.type === "message_submitted" && runId) {
            const text = messageText(event.data.message);
            if (text)
                await this.repository.attachAgentRun({
                    runId,
                    sessionId: event.sessionId,
                    text,
                });
            return;
        }
        if (!runId || (event.type !== "run_finished" && event.type !== "run_error")) return;
        let turn = await this.repository.getRunningAgentTurn(event.sessionId, runId);
        if (!turn) return;
        if (turn.runId === undefined || turn.baselineMessageCount === undefined) {
            const baselineMessageCount =
                turn.baselineMessageCount ??
                (await this.daemon.submittedTurnBaseline(
                    turn.sessionId,
                    turn.text,
                    this.shutdown.signal,
                ));
            const checkpointed = await this.repository.checkpointAgentTurn({
                agentUserId: turn.agentUserId,
                baselineMessageCount,
                runId,
                userMessageId: turn.userMessageId,
                workerId: turn.workerId,
            });
            if (!checkpointed) return;
            turn = { ...turn, baselineMessageCount, runId };
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

    private startDrain(chatId: string): void {
        if (this.stopping || this.drains.has(chatId)) return;
        const task = this.drainChat(chatId)
            .catch((error) => this.onError(error))
            .finally(async () => {
                this.drains.delete(chatId);
                if (this.stopping) return;
                try {
                    if (await this.repository.hasRunnableAgentTurn(chatId)) this.startDrain(chatId);
                } catch (error) {
                    this.onError(error);
                }
            });
        this.drains.set(chatId, task);
    }

    private async drainChat(chatId: string): Promise<void> {
        for (;;) {
            if (this.stopping) return;
            const input = await this.repository
                .takeNextAgentTurn(chatId, this.workerId)
                .catch((error) => {
                    this.onError(error);
                    return undefined;
                });
            if (!input) return;
            try {
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
            const checkpointed = await this.repository.checkpointAgentTurn({
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
                ...(lastSessionEventId === undefined ? {} : { lastSessionEventId }),
                ...(runId === undefined ? {} : { runId }),
            };

        for (;;) {
            let submitted: { eventId: string; runId: string };
            try {
                submitted = await this.daemon.submitTurn(
                    input.sessionId,
                    input.text,
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
                        ...(lastSessionEventId === undefined ? {} : { lastSessionEventId }),
                        ...(runId === undefined ? {} : { runId }),
                    };
                if (!isRetryableRigError(error)) throw error;
                await delay(EVENT_RETRY_INTERVAL_MS, this.shutdown.signal);
                continue;
            }
            runId = submitted.runId;
            lastSessionEventId = submitted.eventId;
            const checkpointed = await this.repository.checkpointAgentTurn({
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
                inspection: { kind: "running" },
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
                const result = await this.repository.streamAgentTurnReply({
                    agentUserId: input.agentUserId,
                    actorUserId: input.actorUserId,
                    eventId: update.eventId,
                    expectedEventId: update.expectedEventId,
                    sessionId: input.sessionId,
                    streamCommittedText: update.streamCommittedText,
                    text: update.text,
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
                        this.onError(error);
                    }
                }
            });
        this.turnStreams.set(input.userMessageId, { controller, output, task });
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
                                await this.repository.attachAgentRun({
                                    runId,
                                    sessionId: input.sessionId,
                                    text: input.text,
                                });
                                shouldPersist = true;
                            }
                        }
                        if (runId && event.data.runId === runId) {
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
                        }
                        if (shouldPersist)
                            output.add({
                                eventId: event.id,
                                streamCommittedText: committedText,
                                text: appendAgentText(committedText, partialText),
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
        hint: { areas: string[]; chats: Array<{ chatId: string; pts: string }>; sequence: string },
    ): Promise<void> {
        const event = { type: "sync" as const, ...hint };
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
        const result = await this.repository.completeAgentTurn({
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            text,
            workerId: input.workerId,
        });
        if (!result) {
            this.clearTypingRenewal(input.chatId, input.userMessageId);
            return;
        }
        await this.publishAgentReplyHint(input.chatId, result.hint);
        await this.stopTyping(input);
        this.startDrain(input.chatId);
    }

    private async failTurn(input: AgentTurnWork, error: string): Promise<void> {
        await this.stopTurnStream(input);
        const result = await this.repository.failAgentTurn({
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            error,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            workerId: input.workerId,
        });
        if (!result) {
            this.clearTypingRenewal(input.chatId, input.userMessageId);
            return;
        }
        await this.publishAgentReplyHint(input.chatId, result.hint);
        await this.stopTyping(input);
        this.startDrain(input.chatId);
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
            void this.repository
                .renewAgentTurnLease({
                    agentUserId: input.agentUserId,
                    userMessageId: input.userMessageId,
                    workerId: input.workerId,
                })
                .then(async (renewed) => {
                    if (this.typingRenewals.get(input.chatId) !== renewal) return;
                    if (!renewed) {
                        this.clearTypingRenewal(input.chatId, input.userMessageId);
                        this.turnStreams.get(input.userMessageId)?.controller.abort();
                        return;
                    }
                    await this.publishTyping(input, true);
                })
                .catch(this.onError);
        }, TYPING_RENEW_INTERVAL_MS);
        timer.unref();
        renewal = { timer, userMessageId: input.userMessageId };
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
            ...(active ? { expiresAt: occurredAt + TYPING_TTL_MS } : {}),
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
    };
    private persistedTextLength = 0;

    constructor(
        private persistedEventId: string | undefined,
        private readonly persist: (update: {
            eventId: string;
            expectedEventId?: string;
            streamCommittedText: string;
            text: string;
        }) => Promise<void>,
        private readonly onError: (error: unknown) => void,
    ) {}

    get lastEventId(): string | undefined {
        return this.persistedEventId;
    }

    add(update: { eventId: string; streamCommittedText: string; text: string }): void {
        if (this.failure) return;
        this.pending = update;
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
            ...(expectedEventId === undefined ? {} : { expectedEventId }),
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
                : { lastBuildLogLine: this.lastBuildLogLine }),
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

function sandboxDirectories(root: string, agentUserId: string, privateUserId: string) {
    const sandbox = join(root, "agents", agentUserId, "users", privateUserId);
    return { home: join(sandbox, "home"), workspace: join(sandbox, "workspace") };
}

function agentImageBuildError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 16_000) || "Agent image build failed";
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
        signal.addEventListener("abort", abort, { once: true });
    });
}
