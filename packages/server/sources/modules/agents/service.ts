import { createId } from "@paralleldrive/cuid2";
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

const IGNORED_EVENT_CHECKPOINT_INTERVAL = 100;
const EVENT_RETRY_INTERVAL_MS = 100;
const TYPING_TTL_MS = 30_000;
const TYPING_RENEW_INTERVAL_MS = 20_000;
const TRIM_EVENT_INTERVAL = 1_000;
const TRIM_TIME_INTERVAL_MS = 24 * 60 * 60_000;

type AgentTurnWork = NonNullable<Awaited<ReturnType<CollaborationRepository["takeNextAgentTurn"]>>>;

export class AgentService {
    private readonly workerId = createId();
    private readonly bindingCreations = new Map<
        string,
        Promise<{ cwd: string; sessionId: string }>
    >();
    private readonly drains = new Map<string, Promise<void>>();
    private readonly typingRenewals = new Map<string, ReturnType<typeof setInterval>>();
    private readonly shutdown = new AbortController();
    private queueTask?: Promise<void>;
    private stopping = false;

    constructor(
        private readonly repository: CollaborationRepository,
        private readonly pubsub: PubSub,
        private readonly daemon: RigDaemonClient,
        private readonly defaultCwd: string,
        private readonly onError: (error: unknown) => void = () => undefined,
    ) {}

    async createAgent(input: { actorUserId: string; name: string; username: string }) {
        if (!(await this.repository.agentUsernameAvailable(input.username)))
            throw new CollaborationError("conflict", "Agent username is already taken");
        const agentUserId = createId();
        const cwd = join(this.defaultCwd, "agents", agentUserId, "users", input.actorUserId);
        await mkdir(cwd, { recursive: true, mode: 0o700 });
        const session = await this.daemon.createSession(cwd);
        return this.repository.createAgent({
            ...input,
            agentUserId,
            cwd,
            sessionId: session.id,
        });
    }

    async start(): Promise<void> {
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

    private async ensureAgentBinding(
        actorUserId: string,
        chatId: string,
    ): Promise<{ cwd: string; sessionId: string } | undefined> {
        const context = await this.repository.getDirectAgentChatContext(actorUserId, chatId);
        if (!context) return undefined;
        if (context.binding) return context.binding;
        const key = `${context.agentUserId}:${chatId}`;
        const pending = this.bindingCreations.get(key);
        if (pending) return pending;
        const creation = (async () => {
            const cwd = join(
                this.defaultCwd,
                "agents",
                context.agentUserId,
                "users",
                context.privateUserId,
            );
            await mkdir(cwd, { recursive: true, mode: 0o700 });
            const session = await this.daemon.createSession(cwd);
            return this.repository.bindAgentChat({
                actorUserId,
                agentUserId: context.agentUserId,
                chatId,
                cwd,
                sessionId: session.id,
            });
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
        for (const timer of this.typingRenewals.values()) clearInterval(timer);
        this.typingRenewals.clear();
        await Promise.race([
            Promise.allSettled([
                ...this.drains.values(),
                ...(this.queueTask ? [this.queueTask] : []),
            ]),
            shutdownDeadline(),
        ]);
        await this.repository.releaseAgentTurnLeases(this.workerId);
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
        const turn = await this.repository.getRunningAgentTurn(event.sessionId, runId);
        if (!turn) return;
        if (turn.baselineMessageCount === undefined)
            throw new Error(
                `Rig run ${runId} completed before its turn baseline was checkpointed.`,
            );
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

function isRelevantRigEvent(event: RigEvent): boolean {
    if (!event.data.runId) return false;
    return (
        event.type === "message_submitted" ||
        event.type === "run_finished" ||
        event.type === "run_error"
    );
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
