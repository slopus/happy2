import { type DifferenceResponse, Happy2Api } from "../../api.js";
import {
    type AgentActivityState,
    type DocumentPresenceEntry,
    type MessageSummary,
    type PresenceSnapshot,
    type RealtimeEvent,
    type SyncState,
    type TypingState,
    type UserError,
} from "../../types.js";
import { type CallsStore } from "../calls/callsState.js";
import { type ChatStore, messageItemProject } from "../chat/chatState.js";
import { type DirectoryStore } from "../directory/directoryState.js";
import { type IdentityCatalog } from "../identity/identityState.js";
import { type StateRuntime, userError } from "../runtime/runtimeState.js";
import {
    sidebarLoad,
    type SidebarLoadContext,
    type SidebarStore,
} from "../sidebar/sidebarState.js";

export interface AreaReconcileContext {
    chatReconcile(chatId: string): void;
    workspaceReconcile(chatId: string): void;
    callsReconcile(): void;
    threadsReconcile(): void;
    notificationsReconcile(): void;
    draftsReconcile(): void;
    documentsReconcile(): void;
    agentImagesReconcile(): void;
    setupReconcile(): void;
    agentSecretsReconcile(): void;
    pluginsReconcile(): void;
    permissionsReconcile(): void;
    identitiesReconcile(): void;
    unknownArea(area: string): void;
}

/** Routes server-owned difference areas to one product owner and exposes unknown areas instead of silently staling. */
export function areaReconcile(context: AreaReconcileContext, area: string): void {
    if (area.startsWith("chat:")) {
        const chatId = area.slice("chat:".length);
        if (chatId) context.chatReconcile(chatId);
        else context.unknownArea(area);
    } else if (area.startsWith("workspace:")) {
        const chatId = area.slice("workspace:".length);
        if (chatId) context.workspaceReconcile(chatId);
        else context.unknownArea(area);
    } else if (area === "calls" || area.startsWith("call:")) context.callsReconcile();
    else if (area === "threads" || area.startsWith("thread:")) context.threadsReconcile();
    else if (area === "notifications") context.notificationsReconcile();
    else if (area === "drafts") context.draftsReconcile();
    else if (area === "documents") context.documentsReconcile();
    else if (area === "agent-images") {
        // Base-image build progress reaches both the admin catalog and the
        // onboarding surface, so a durable image change reconciles each owner.
        context.agentImagesReconcile();
        context.setupReconcile();
    } else if (area === "setup" || area === "user-onboarding") context.setupReconcile();
    else if (area === "agent-secrets") context.agentSecretsReconcile();
    else if (area === "plugins") context.pluginsReconcile();
    else if (area === "permissions") context.permissionsReconcile();
    else if (area === "users" || area === "profile") context.identitiesReconcile();
    else context.unknownArea(area);
}

export interface SyncCoordinatorContext extends SidebarLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    readonly sidebar: SidebarStore;
    directoryGet(): DirectoryStore | undefined;
    callsGet(): CallsStore | undefined;
    chatGet(chatId: string): ChatStore | undefined;
    chatsGet(): Iterable<readonly [string, ChatStore]>;
    agentTraceReconcile(message: MessageSummary): void;
    agentTracesInvalidate(): void;
    mcpAppReconcile(message: MessageSummary): void;
    mcpAppsInvalidate(): void;
    /** Reloads a retained chat's plugin management requests after a plugin.* chat update. */
    chatPluginRequestsReconcile(chatId: string): void;
    /** Reconciles a materialized coarse thread list when a child or its parent timeline changed. */
    threadListChatsReconcile(chatIds: readonly string[]): void;
    /** Debounce-synchronizes an open document session hinted at newer durable content. */
    documentReconcile(documentId: string, sequence: number): void;
    /** Applies one ephemeral document presence announcement to its open session. */
    documentPresenceApply(documentId: string, presence: DocumentPresenceEntry): void;
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
            this.context.directoryGet()?.getState().directoryInput({
                type: "presenceReconciled",
                userId,
                presence: "offline",
            });
            for (const [, binding] of this.context.chatsGet()) {
                const members = binding.getState().members;
                if (members.type !== "ready") continue;
                const index = members.value.findIndex((member) => member.id === userId);
                if (index < 0 || members.value[index]?.presence === "offline") continue;
                const next = [...members.value];
                next[index] = { ...next[index]!, presence: "offline" };
                binding.getState().chatInput({ type: "membersLoaded", members: next });
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
                if (this.context.sidebar.getState().sync) this.queueSync(this.generation);
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
            case "document.updated": {
                const sequence = Number(event.sequence);
                this.context.documentReconcile(
                    event.documentId,
                    Number.isSafeInteger(sequence) ? sequence : 0,
                );
                return;
            }
            case "document.presence":
                this.context.documentPresenceApply(event.presence.documentId, event.presence);
                return;
            case "call.signal":
                this.context
                    .callsGet()
                    ?.getState()
                    .callsInput({
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
        let cursor: SyncState | undefined = this.context.sidebar.getState().sync;
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
            this.context.sidebar.getState().sidebarInput({
                type: "chatSummariesReconciled",
                changedChats: await this.context.sidebarChats.project(difference.changedChats),
                removedChatIds: difference.removedChatIds,
                sync: difference.state,
            });
            // Losing a chat revokes access to its traces; open panels must
            // revalidate through the GET instead of keeping cached details.
            if (difference.removedChatIds.length > 0) {
                this.context.agentTracesInvalidate();
                this.context.mcpAppsInvalidate();
            }
            for (const chat of difference.changedChats) {
                const binding = this.context.chatGet(chat.id);
                if (!binding) continue;
                if (binding.getState().status.type === "ready")
                    await this.chatSynchronize(chat.id, generation);
                else binding.getState().chatInput({ type: "chatSummaryReconciled", chat });
            }
            for (const area of difference.areas) this.context.areaReconcile(area);
            if (!difference.areas.some((area) => area === "threads" || area.startsWith("thread:")))
                this.context.threadListChatsReconcile(
                    difference.changedChats.map((chat) => chat.id),
                );
            cursor = difference.state;
            if (difference.kind !== "slice") return;
        }
    }

    private async chatSynchronize(chatId: string, generation: number): Promise<void> {
        const binding = this.context.chatGet(chatId);
        const status = binding?.getState().status;
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
        const currentStatus = current.getState().status;
        if (
            current !== binding ||
            currentStatus.type !== "ready" ||
            currentStatus.value.membershipEpoch !== state.membershipEpoch ||
            currentStatus.value.pts !== state.pts
        ) {
            this.context.areaReconcile(`chat:${chatId}`);
            return;
        }
        current.getState().chatInput({ type: "chatSummaryReconciled", chat: difference.chat });
        for (const message of difference.messages) {
            current.getState().chatInput({
                type: "messageUpserted",
                item: messageItemProject(this.context.identities, message),
            });
            this.context.agentTraceReconcile(message);
            this.context.mcpAppReconcile(message);
        }
        // Plugin management updates carry no projection in the difference; the
        // retained request list reconciles through its own durable read.
        if (difference.updates.some((update) => update.kind.startsWith("plugin.")))
            this.context.chatPluginRequestsReconcile(chatId);
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
        this.context
            .chatGet(chatId)
            ?.getState()
            .chatInput({
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
                subagents: event.subagents,
                backgroundTerminals: event.backgroundTerminals,
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
        this.context
            .chatGet(chatId)
            ?.getState()
            .chatInput({
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
        this.context.directoryGet()?.getState().directoryInput({
            type: "presenceReconciled",
            userId,
            presence: event.snapshot.status,
        });
        for (const [, binding] of this.context.chatsGet()) {
            const members = binding.getState().members;
            if (members.type !== "ready") continue;
            const index = members.value.findIndex((member) => member.id === userId);
            if (index < 0 || members.value[index]?.presence === event.snapshot.status) continue;
            const next = [...members.value];
            next[index] = { ...next[index]!, presence: event.snapshot.status };
            binding.getState().chatInput({ type: "membersLoaded", members: next });
        }
    }

    private current(generation: number): boolean {
        return this.running && this.generation === generation;
    }
}

/** Starts initial durable loading and realtime hint delivery for a connected HappyState. */
export async function syncStart(coordinator: SyncCoordinator): Promise<void> {
    await coordinator.start();
}

/** Stops realtime delivery and all ephemeral expiry ownership without disposing surface stores. */
export function syncStop(coordinator: SyncCoordinator): void {
    coordinator.stop();
}
