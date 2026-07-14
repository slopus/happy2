import { createId } from "@paralleldrive/cuid2";
import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { CollaborationRepository, RigEventCheckpoint } from "../collaboration/repository.js";
import { CollaborationError } from "../collaboration/types.js";
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

export class AgentService {
    private readonly workerId = createId();
    private readonly bindingCreations = new Map<
        string,
        Promise<{ containerName: string; cwd: string; sessionId: string }>
    >();
    private readonly imageBuilds = new Map<string, Promise<void>>();
    private readonly pendingImageBuilds = new Set<string>();
    private activeImageBuilds = 0;
    private readonly drains = new Map<string, Promise<void>>();
    private readonly typingRenewals = new Map<string, ReturnType<typeof setInterval>>();
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

    private async ensureAgentBinding(
        actorUserId: string,
        chatId: string,
    ): Promise<{ containerName: string; cwd: string; sessionId: string } | undefined> {
        if (this.stopping) return undefined;
        const context = await this.repository.getDirectAgentChatContext(actorUserId, chatId);
        if (!context) return undefined;
        if (context.binding) return context.binding;
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
        for (const timer of this.typingRenewals.values()) clearInterval(timer);
        this.typingRenewals.clear();
        await Promise.race([
            Promise.allSettled([
                ...this.bindingCreations.values(),
                ...this.drains.values(),
                ...this.imageBuilds.values(),
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
        try {
            await this.pubsub.publish(realtimeTopics.server, { type: "sync", ...hint });
        } catch (error) {
            this.onError(error);
        }
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
            await this.repository.checkpointAgentTurn({
                agentUserId: turn.agentUserId,
                baselineMessageCount,
                runId,
                userMessageId: turn.userMessageId,
                workerId: turn.workerId,
            });
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
                const inspection = await this.ensureTurnSubmitted(input);
                if (inspection.kind === "completed") {
                    await this.completeTurn(input, inspection.text);
                    continue;
                }
                if (inspection.kind === "failed") {
                    await this.failTurn(input, inspection.error);
                    continue;
                }
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

    private async ensureTurnSubmitted(input: AgentTurnWork): Promise<RigTurnInspection> {
        let baselineMessageCount = input.baselineMessageCount;
        if (baselineMessageCount === undefined) {
            baselineMessageCount = await this.retryRig(() =>
                input.runId
                    ? this.daemon.submittedTurnBaseline(
                          input.sessionId,
                          input.text,
                          this.shutdown.signal,
                      )
                    : this.daemon.sessionMessageCount(input.sessionId, this.shutdown.signal),
            );
            await this.repository.checkpointAgentTurn({
                agentUserId: input.agentUserId,
                baselineMessageCount,
                runId: input.runId,
                userMessageId: input.userMessageId,
                workerId: input.workerId,
            });
        }

        const existing = await this.retryRig(() =>
            this.daemon.inspectTurn(
                input.sessionId,
                baselineMessageCount,
                input.text,
                this.shutdown.signal,
            ),
        );
        if (input.runId || existing.kind !== "not_submitted") return existing;

        for (;;) {
            try {
                const submitted = await this.daemon.submitTurn(
                    input.sessionId,
                    input.text,
                    this.shutdown.signal,
                );
                await this.repository.checkpointAgentTurn({
                    agentUserId: input.agentUserId,
                    baselineMessageCount,
                    runId: submitted.runId,
                    userMessageId: input.userMessageId,
                    workerId: input.workerId,
                });
                return { kind: "running" };
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
                if (recovered.kind !== "not_submitted") return recovered;
                if (!isRetryableRigError(error)) throw error;
                await delay(EVENT_RETRY_INTERVAL_MS, this.shutdown.signal);
            }
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
        const result = await this.repository.completeAgentTurn({
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
            text,
        });
        const event = { type: "sync" as const, ...result.hint };
        try {
            await Promise.all([
                this.pubsub.publish(realtimeTopics.server, event),
                this.pubsub.publish(realtimeTopics.chat(input.chatId), event),
            ]);
        } catch (error) {
            this.onError(error);
        }
        await this.stopTyping(input);
        this.startDrain(input.chatId);
    }

    private async failTurn(input: AgentTurnWork, error: string): Promise<void> {
        const result = await this.repository.failAgentTurn({
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            error,
            sessionId: input.sessionId,
            userMessageId: input.userMessageId,
        });
        const event = { type: "sync" as const, ...result.hint };
        try {
            await Promise.all([
                this.pubsub.publish(realtimeTopics.server, event),
                this.pubsub.publish(realtimeTopics.chat(input.chatId), event),
            ]);
        } catch (publishError) {
            this.onError(publishError);
        }
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
        const timer = setInterval(() => {
            void Promise.all([
                this.repository.renewAgentTurnLease({
                    agentUserId: input.agentUserId,
                    userMessageId: input.userMessageId,
                    workerId: input.workerId,
                }),
                this.publishTyping(input, true),
            ]).catch(this.onError);
        }, TYPING_RENEW_INTERVAL_MS);
        timer.unref();
        this.typingRenewals.set(input.chatId, timer);
    }

    private async stopTyping(input: AgentTurnWork): Promise<void> {
        const timer = this.typingRenewals.get(input.chatId);
        if (timer) clearInterval(timer);
        this.typingRenewals.delete(input.chatId);
        try {
            await this.publishTyping(input, false);
        } catch (error) {
            this.onError(error);
        }
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

function sqliteTimestamp(value: string): number {
    const normalized = value.includes("T") ? value : value.replace(" ", "T");
    return Date.parse(/[zZ]|[+-]\d\d:\d\d$/u.test(normalized) ? normalized : `${normalized}Z`);
}

function agentImageDefinitionHash(dockerfile: string, buildContext = ""): string {
    return createHash("sha256")
        .update("rigged-agent-image-v1\0")
        .update(buildContext)
        .update("\0")
        .update(dockerfile)
        .digest("hex");
}

function agentImageTag(definitionHash: string): string {
    return `rigged-agent:${definitionHash}`;
}

function agentContainerName(): string {
    return `rigged-agent-${createId()}`;
}

function sandboxDirectories(root: string, agentUserId: string, privateUserId: string) {
    const sandbox = join(root, "agents", agentUserId, "users", privateUserId);
    return { home: join(sandbox, "home"), workspace: join(sandbox, "workspace") };
}

function agentImageBuildError(error: unknown): string {
    const message = error instanceof Error ? error.message : String(error);
    return message.slice(0, 16_000) || "Agent image build failed";
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
