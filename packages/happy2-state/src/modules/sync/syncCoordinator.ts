import { Happy2Api, type DifferenceResponse } from "../../api.js";
import type {
    AgentActivityState,
    PresenceSnapshot,
    RealtimeEvent,
    TypingState,
    UserError,
    SyncState,
} from "../../types.js";
import { messageItemProject } from "../chat/messageProject.js";
import type { ChatStoreBinding } from "../chat/chatStore.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { userError } from "../runtime/stateRuntime.js";
import { sidebarLoad, type SidebarLoadContext } from "../sidebar/sidebarLoad.js";
import type { SidebarStoreBinding } from "../sidebar/sidebarStore.js";
import type { DirectoryStoreBinding } from "../directory/directoryStore.js";
import type { CallsStoreBinding } from "../calls/callsStore.js";

export interface SyncCoordinatorContext extends SidebarLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly sidebar: SidebarStoreBinding;
    directoryGet(): DirectoryStoreBinding | undefined;
    callsGet(): CallsStoreBinding | undefined;
    chatGet(chatId: string): ChatStoreBinding | undefined;
    chatsGet(): Iterable<readonly [string, ChatStoreBinding]>;
    areaReconcile(area: string): void;
    resetReconcile(): void;
    backgroundError(error: UserError): void;
}

/** Owns realtime hint ordering, durable difference loops, and ephemeral expiry dispatch. */
export class SyncCoordinator {
    private unsubscribe?: () => void;
    private startPromise?: Promise<void>;
    private syncPromise?: Promise<void>;
    private syncAgain = false;
    private running = false;
    private generation = 0;
    private readonly presence = new Map<string, PresenceSnapshot>();
    private readonly presenceOccurredAt = new Map<string, number>();
    private readonly typing = new Map<string, TypingState>();
    private readonly typingOccurredAt = new Map<string, number>();
    private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private readonly agentActivity = new Map<string, AgentActivityState>();
    private readonly agentActivityOccurredAt = new Map<string, number>();
    private readonly agentTimers = new Map<string, ReturnType<typeof setTimeout>>();

    constructor(private readonly context: SyncCoordinatorContext) {}

    start(): Promise<void> {
        if (this.running) return this.startPromise ?? Promise.resolve();
        this.running = true;
        const generation = ++this.generation;
        this.startPromise = this.startInternal(generation)
            .catch((error) => {
                if (this.generation === generation) this.stop();
                throw error;
            })
            .finally(() => {
                if (this.generation === generation) this.startPromise = undefined;
            });
        return this.startPromise;
    }

    stop(): void {
        this.running = false;
        this.generation += 1;
        this.syncAgain = false;
        this.unsubscribe?.();
        this.unsubscribe = undefined;
        const typingChats = new Set([...this.typing.values()].map(({ chatId }) => chatId));
        const agentChats = new Set([...this.agentActivity.values()].map(({ chatId }) => chatId));
        for (const timer of this.typingTimers.values()) clearTimeout(timer);
        for (const timer of this.agentTimers.values()) clearTimeout(timer);
        this.typingTimers.clear();
        this.agentTimers.clear();
        this.typing.clear();
        this.agentActivity.clear();
        this.typingOccurredAt.clear();
        this.agentActivityOccurredAt.clear();
        for (const chatId of typingChats) this.typingPublish(chatId);
        for (const chatId of agentChats) this.agentPublish(chatId);
        for (const [userId, snapshot] of this.presence) {
            const offline = { ...snapshot, status: "offline" as const };
            this.context.directoryGet()?.directoryInput({
                type: "presenceReconciled",
                userId,
                presence: "offline",
            });
            for (const [, binding] of this.context.chatsGet()) {
                const members = binding.store.get().members;
                if (members.type !== "ready") continue;
                const index = members.value.findIndex((member) => member.id === userId);
                if (index < 0 || members.value[index]?.presence === "offline") continue;
                const next = [...members.value];
                next[index] = { ...next[index]!, presence: "offline" };
                binding.chatInput({ type: "membersLoaded", members: next });
            }
            this.presence.set(userId, offline);
        }
        this.presence.clear();
        this.presenceOccurredAt.clear();
    }

    presenceGet(userId: string): PresenceSnapshot | undefined {
        return this.presence.get(userId);
    }

    private async startInternal(generation: number): Promise<void> {
        if (!this.context.runtime.connected) return;
        const transport = this.context.runtime.transportGet();
        if (!transport) return;
        this.unsubscribe = transport.subscribe({
            onEvent: (event) => this.onEvent(event),
            onError: (error) =>
                this.context.backgroundError(userError(error, "Realtime disconnected.")),
        });
        await sidebarLoad(this.context);
        if (!this.current(generation)) return;
        if (this.syncAgain) this.queueSync(generation);
    }

    private onEvent(event: RealtimeEvent): void {
        if (!this.context.runtime.active || !this.running) return;
        switch (event.type) {
            case "sync":
                this.syncAgain = true;
                if (this.context.sidebar.store.get().sync) this.queueSync(this.generation);
                return;
            case "typing":
                this.typingApply(event);
                return;
            case "agent.activity":
                this.agentActivityApply(event);
                return;
            case "presence":
                this.presenceApply(event);
                return;
            case "workspace.changed":
                this.context.areaReconcile(`workspace:${event.chatId}`);
                return;
            case "call.signal":
                this.context.callsGet()?.callsInput({
                    type: "callSignalReceived",
                    signal: {
                        callId: event.callId,
                        senderUserId: event.senderUserId,
                        recipientUserId: event.recipientUserId,
                        signal: event.signal,
                        occurredAt: event.occurredAt,
                    },
                });
        }
    }

    private queueSync(generation = this.generation): void {
        if (this.syncPromise || !this.context.runtime.active || !this.current(generation)) return;
        this.syncPromise = (async () => {
            while (this.syncAgain && this.context.runtime.active && this.current(generation)) {
                this.syncAgain = false;
                await this.synchronize(generation);
            }
        })()
            .catch((error: unknown) => this.context.backgroundError(userError(error)))
            .finally(() => {
                this.syncPromise = undefined;
                if (this.syncAgain && this.running) this.queueSync(this.generation);
            });
        this.context.runtime.background(this.syncPromise);
    }

    private async synchronize(generation: number): Promise<void> {
        let cursor: SyncState | undefined = this.context.sidebar.store.get().sync;
        if (!cursor) return;
        for (;;) {
            const requestedCursor: SyncState = cursor;
            const difference: DifferenceResponse = await this.context.runtime.read((transport) =>
                new Happy2Api(transport).difference(requestedCursor),
            );
            if (!this.context.runtime.active || !this.current(generation)) return;
            if (difference.kind === "reset") {
                await sidebarLoad(this.context);
                if (!this.current(generation)) return;
                this.context.resetReconcile();
                return;
            }
            this.context.sidebar.sidebarInput({
                type: "chatSummariesReconciled",
                changedChats: await this.context.sidebarChats.project(difference.changedChats),
                removedChatIds: difference.removedChatIds,
                sync: difference.state,
            });
            for (const chat of difference.changedChats) {
                const binding = this.context.chatGet(chat.id);
                if (!binding) continue;
                binding.chatInput({ type: "chatSummaryReconciled", chat });
                await this.chatSynchronize(chat.id, generation);
            }
            for (const area of difference.areas) this.context.areaReconcile(area);
            cursor = difference.state;
            if (difference.kind !== "slice") return;
        }
    }

    private async chatSynchronize(chatId: string, generation: number): Promise<void> {
        const binding = this.context.chatGet(chatId);
        const status = binding?.store.get().status;
        if (!binding || status?.type !== "ready") return;
        const state = {
            membershipEpoch: status.value.membershipEpoch,
            pts: status.value.pts,
        };
        const difference = await this.context.runtime.read((transport) =>
            new Happy2Api(transport).chatDifference(chatId, state),
        );
        if (!this.current(generation)) return;
        if (difference.kind === "reset" || difference.kind === "tooLong") {
            this.context.areaReconcile(`chat:${chatId}`);
            return;
        }
        const current = this.context.chatGet(chatId);
        if (!current) return;
        const currentStatus = current.store.get().status;
        if (
            current !== binding ||
            currentStatus.type !== "ready" ||
            currentStatus.value.membershipEpoch !== state.membershipEpoch ||
            currentStatus.value.pts !== state.pts
        ) {
            this.context.areaReconcile(`chat:${chatId}`);
            return;
        }
        current.chatInput({ type: "chatSummaryReconciled", chat: difference.chat });
        for (const message of difference.messages) {
            current.chatInput({
                type: "messageUpserted",
                item: messageItemProject(this.context.identities, message),
            });
        }
    }

    private typingApply(event: Extract<RealtimeEvent, { type: "typing" }>): void {
        const key = `${event.chatId}\u0000${event.userId}`;
        if ((this.typingOccurredAt.get(key) ?? -1) > event.occurredAt) return;
        this.typingOccurredAt.set(key, event.occurredAt);
        const timer = this.typingTimers.get(key);
        if (timer) clearTimeout(timer);
        if (!event.active) {
            this.typing.delete(key);
            this.typingTimers.delete(key);
        } else {
            const expiresAt = event.expiresAt ?? this.context.runtime.now() + 6_000;
            this.typing.set(key, { chatId: event.chatId, userId: event.userId, expiresAt });
            this.typingTimers.set(
                key,
                setTimeout(
                    () => {
                        this.typing.delete(key);
                        this.typingTimers.delete(key);
                        this.typingPublish(event.chatId);
                    },
                    Math.max(0, expiresAt - this.context.runtime.now()),
                ),
            );
        }
        this.typingPublish(event.chatId);
    }

    private typingPublish(chatId: string): void {
        this.context.chatGet(chatId)?.chatInput({
            type: "typingReconciled",
            typing: [...this.typing.values()].filter((item) => item.chatId === chatId),
        });
    }

    private agentActivityApply(event: Extract<RealtimeEvent, { type: "agent.activity" }>): void {
        const key = `${event.chatId}\u0000${event.agentUserId}`;
        if ((this.agentActivityOccurredAt.get(key) ?? -1) > event.occurredAt) return;
        this.agentActivityOccurredAt.set(key, event.occurredAt);
        const timer = this.agentTimers.get(key);
        if (timer) clearTimeout(timer);
        if (!event.active) {
            this.agentActivity.delete(key);
            this.agentTimers.delete(key);
        } else {
            const expiresAt = event.expiresAt ?? this.context.runtime.now() + 15_000;
            this.agentActivity.set(key, {
                chatId: event.chatId,
                agentUserId: event.agentUserId,
                turnId: event.turnId,
                phase: event.phase,
                tokenCount: event.tokenCount,
                startedAt: event.startedAt,
                expiresAt,
            });
            this.agentTimers.set(
                key,
                setTimeout(
                    () => {
                        this.agentActivity.delete(key);
                        this.agentTimers.delete(key);
                        this.agentPublish(event.chatId);
                    },
                    Math.max(0, expiresAt - this.context.runtime.now()),
                ),
            );
        }
        this.agentPublish(event.chatId);
    }

    private agentPublish(chatId: string): void {
        this.context.chatGet(chatId)?.chatInput({
            type: "agentActivityReconciled",
            agentActivity: [...this.agentActivity.values()].filter(
                (item) => item.chatId === chatId,
            ),
        });
    }

    private presenceApply(event: Extract<RealtimeEvent, { type: "presence" }>): void {
        const userId = event.snapshot.userId;
        if ((this.presenceOccurredAt.get(userId) ?? -1) > event.occurredAt) return;
        this.presenceOccurredAt.set(userId, event.occurredAt);
        this.presence.set(userId, event.snapshot);
        this.context.directoryGet()?.directoryInput({
            type: "presenceReconciled",
            userId,
            presence: event.snapshot.status,
        });
        for (const [, binding] of this.context.chatsGet()) {
            const members = binding.store.get().members;
            if (members.type !== "ready") continue;
            const index = members.value.findIndex((member) => member.id === userId);
            if (index < 0 || members.value[index]?.presence === event.snapshot.status) continue;
            const next = [...members.value];
            next[index] = { ...next[index]!, presence: event.snapshot.status };
            binding.chatInput({ type: "membersLoaded", members: next });
        }
    }

    private current(generation: number): boolean {
        return this.running && this.generation === generation;
    }
}
