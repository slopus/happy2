import { ApiResponseError, Happy2Api } from "./api.js";
import {
    backendOperationSupportsIdempotency,
    backendOperations,
    executeBackendOperation,
    type BackendOperation,
    type BackendOperationInput,
    type BackendOperationResult,
} from "./backend.js";
import { TransportError, type ClientTransport } from "./transport.js";
import type {
    ChatSummary,
    ClientMessage,
    ClientStateEvent,
    ClientStateEventOf,
    ClientStateEventType,
    ClientStateSnapshot,
    CreateAgentInput,
    CreateChannelInput,
    MessageSummary,
    PresenceSnapshot,
    RealtimeEvent,
    SendMessageInput,
    SyncState,
    TypingState,
} from "./types.js";
import { UserError } from "./types.js";

export interface RetryPolicy {
    /** Total attempts, including the first request. */
    readonly attempts?: number;
    readonly delayMs?: (attempt: number, error: unknown) => number;
}

export interface ClientStateOptions {
    readonly retry?: RetryPolicy;
    readonly createId?: () => string;
    readonly now?: () => number;
    readonly sleep?: (milliseconds: number) => Promise<void>;
    readonly onSubscriberError?: (error: unknown) => void;
}

type Listener = (event: ClientStateEvent) => void;

export interface ClientState extends AsyncDisposable {
    get(): ClientStateSnapshot;
    subscribe(listener: Listener): () => void;
    subscribe<T extends ClientStateEventType>(
        type: T,
        listener: (event: ClientStateEventOf<T>) => void,
    ): () => void;
    start(): Promise<void>;
    stop(): void;
    loadMessages(chatId: string): Promise<readonly ClientMessage[]>;
    createChannel(input: CreateChannelInput): Promise<ChatSummary>;
    createAgent(input: CreateAgentInput): Promise<ChatSummary>;
    createDirectMessage(userId: string): Promise<ChatSummary>;
    joinChat(chatId: string): Promise<ChatSummary>;
    /** Optimistic background action. Observe message and background-error events for completion. */
    sendMessage(chatId: string, input: SendMessageInput): void;
    /** Ephemeral background action. */
    setTyping(chatId: string, active: boolean): void;
    /** Resolves when currently queued background work is complete. Primarily useful to hosts and tests. */
    whenIdle(): Promise<void>;
    /** Executes any named authenticated backend capability without exposing HTTP details. */
    execute<K extends BackendOperation>(
        operation: K,
        ...input: {} extends BackendOperationInput<K>
            ? [input?: BackendOperationInput<K>]
            : [input: BackendOperationInput<K>]
    ): Promise<BackendOperationResult<K>>;
    /** Returns the most recent successful result for a named operation. */
    result<K extends BackendOperation>(operation: K): BackendOperationResult<K> | undefined;
}

export function createClientState(
    transport: ClientTransport,
    options: ClientStateOptions = {},
): ClientState {
    return new ClientStateModel(transport, options);
}

class ClientStateModel implements ClientState {
    private readonly api: Happy2Api;
    private readonly listeners = new Set<Listener>();
    private readonly pending = new Set<Promise<void>>();
    private readonly attempts: number;
    private readonly delayMs: NonNullable<RetryPolicy["delayMs"]>;
    private readonly createId: () => string;
    private readonly now: () => number;
    private readonly sleep: (milliseconds: number) => Promise<void>;
    private readonly onSubscriberError: (error: unknown) => void;
    private readonly typingOccurredAt = new Map<string, number>();
    private readonly presenceOccurredAt = new Map<string, number>();
    private readonly typingTimers = new Map<string, ReturnType<typeof setTimeout>>();
    private snapshot: ClientStateSnapshot = freezeSnapshot({
        revision: 0,
        status: "idle",
        chats: [],
        messagesByChat: {},
        typing: [],
        presence: [],
        operationResults: {},
    });
    private unsubscribeRealtime?: () => void;
    private startPromise?: Promise<void>;
    private syncPromise?: Promise<void>;
    private syncAgain = false;
    private stopped = false;

    constructor(
        private readonly transport: ClientTransport,
        options: ClientStateOptions,
    ) {
        this.api = new Happy2Api(transport);
        this.attempts = Math.max(1, options.retry?.attempts ?? 3);
        this.delayMs = options.retry?.delayMs ?? ((attempt) => 100 * 2 ** (attempt - 1));
        this.createId = options.createId ?? defaultId;
        this.now = options.now ?? Date.now;
        this.sleep = options.sleep ?? defaultSleep;
        this.onSubscriberError = options.onSubscriberError ?? (() => undefined);
    }

    get(): ClientStateSnapshot {
        return this.snapshot;
    }

    subscribe(listener: Listener): () => void;
    subscribe<T extends ClientStateEventType>(
        type: T,
        listener: (event: ClientStateEventOf<T>) => void,
    ): () => void;
    subscribe<T extends ClientStateEventType>(
        typeOrListener: T | Listener,
        typedListener?: (event: ClientStateEventOf<T>) => void,
    ): () => void {
        const listener: Listener =
            typeof typeOrListener === "function"
                ? typeOrListener
                : (event) => {
                      if (event.type === typeOrListener)
                          typedListener?.(event as ClientStateEventOf<T>);
                  };
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    start(): Promise<void> {
        if (this.stopped)
            return Promise.reject(new UserError("This client state instance has been stopped."));
        if (this.snapshot.status === "ready") return Promise.resolve();
        if (this.startPromise) return this.startPromise;
        this.startPromise = this.startInternal().finally(() => {
            this.startPromise = undefined;
        });
        return this.startPromise;
    }

    stop(): void {
        if (this.stopped) return;
        this.stopped = true;
        this.unsubscribeRealtime?.();
        this.unsubscribeRealtime = undefined;
        for (const timer of this.typingTimers.values()) clearTimeout(timer);
        this.typingTimers.clear();
        this.setStatus("stopped");
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this.stop();
        await this.whenIdle();
    }

    async loadMessages(chatId: string): Promise<readonly ClientMessage[]> {
        this.assertActive();
        try {
            const response = await this.api.messages(chatId);
            if (this.stopped) throw new UserError("This client state instance has been stopped.");
            const messages = response.messages.map(sentMessage);
            this.replaceMessages(chatId, messages, "initial", messages.map(messageId));
            return this.snapshot.messagesByChat[chatId] ?? [];
        } catch (error) {
            throw userError(error);
        }
    }

    async createChannel(input: CreateChannelInput): Promise<ChatSummary> {
        return this.chatMutation("createChannel", (key) => this.api.createChannel(input, key));
    }

    async createAgent(input: CreateAgentInput): Promise<ChatSummary> {
        return this.chatMutation("createAgent", (key) => this.api.createAgent(input, key));
    }

    async createDirectMessage(userId: string): Promise<ChatSummary> {
        return this.chatMutation("createDirectMessage", (key) =>
            this.api.createDirectMessage(userId, key),
        );
    }

    async joinChat(chatId: string): Promise<ChatSummary> {
        return this.chatMutation("joinChat", (key) => this.api.joinChat(chatId, key));
    }

    sendMessage(chatId: string, input: SendMessageInput): void {
        this.assertActive();
        const clientMutationId = input.clientMutationId ?? this.createId();
        const localId = `local:${clientMutationId}`;
        const optimistic: ClientMessage = {
            delivery: "sending",
            clientMutationId,
            message: optimisticMessage(localId, chatId, input, this.now()),
        };
        this.upsertMessages(chatId, [optimistic], "optimistic", [localId]);

        this.track(
            (async () => {
                try {
                    const result = await this.retryMutation((key) =>
                        this.api.sendMessage(chatId, { ...input, clientMutationId }, key),
                    );
                    if (this.stopped) return;
                    const current = this.snapshot.messagesByChat[chatId] ?? [];
                    const withoutLocal = current.filter(
                        (item) =>
                            item.clientMutationId !== clientMutationId &&
                            item.message.id !== result.message.id,
                    );
                    this.replaceMessages(
                        chatId,
                        sortedMessages([...withoutLocal, sentMessage(result.message)]),
                        "confirmed",
                        [result.message.id],
                    );
                } catch (error) {
                    if (this.stopped) return;
                    const failure = userError(error);
                    const current = this.snapshot.messagesByChat[chatId] ?? [];
                    const failed = current.map((item) =>
                        item.clientMutationId === clientMutationId
                            ? { ...item, delivery: "failed" as const, error: failure }
                            : item,
                    );
                    this.replaceMessages(chatId, failed, "failed", [localId]);
                    this.emit({
                        type: "background-error",
                        action: "sendMessage",
                        error: failure,
                        chatId,
                        clientMutationId,
                    });
                }
            })(),
        );
    }

    setTyping(chatId: string, active: boolean): void {
        this.assertActive();
        this.track(
            (async () => {
                try {
                    await this.retryMutation((key) => this.api.setTyping(chatId, active, key));
                } catch (error) {
                    if (this.stopped) return;
                    this.emit({
                        type: "background-error",
                        action: "setTyping",
                        error: userError(error),
                        chatId,
                    });
                }
            })(),
        );
    }

    async whenIdle(): Promise<void> {
        while (this.pending.size > 0) await Promise.all(this.pending);
    }

    async execute<K extends BackendOperation>(
        operation: K,
        ...inputArgument: {} extends BackendOperationInput<K>
            ? [input?: BackendOperationInput<K>]
            : [input: BackendOperationInput<K>]
    ): Promise<BackendOperationResult<K>> {
        const input = inputArgument[0];
        this.assertActive();
        try {
            const spec = backendOperations[operation];
            const result = backendOperationSupportsIdempotency(operation)
                ? await this.retryMutation((key) =>
                      executeBackendOperation(this.transport, operation, input, key),
                  )
                : spec.method === "GET"
                  ? await this.retryRead(() =>
                        executeBackendOperation(this.transport, operation, input),
                    )
                  : await executeBackendOperation(this.transport, operation, input);
            if (this.stopped) throw new UserError("This client state instance has been stopped.");
            this.replaceSnapshot({
                operationResults: {
                    ...this.snapshot.operationResults,
                    [operation]: result,
                },
            });
            this.applyOperationResult(operation, input, result);
            this.emit({
                type: "operation",
                operation,
                input: input as Readonly<Record<string, unknown>> | undefined,
            });
            return result;
        } catch (error) {
            throw userError(error);
        }
    }

    result<K extends BackendOperation>(operation: K): BackendOperationResult<K> | undefined {
        return this.snapshot.operationResults[operation] as BackendOperationResult<K> | undefined;
    }

    private async startInternal(): Promise<void> {
        this.setStatus("starting");
        this.unsubscribeRealtime = this.transport.subscribe({
            onEvent: (event) => this.onRealtime(event),
            onError: (error) => this.onRealtimeError(error),
        });
        try {
            const [state, chats] = await Promise.all([this.api.state(), this.api.chats()]);
            if (this.stopped) return;
            this.replaceSnapshot({ sync: state.state, chats: [...chats.chats] });
            this.emit({
                type: "chats",
                reason: "initial",
                chatIds: chats.chats.map((chat) => chat.id),
                removedChatIds: [],
            });
            this.setStatus("ready");
            if (this.syncAgain) this.queueSync();
        } catch (error) {
            this.unsubscribeRealtime?.();
            this.unsubscribeRealtime = undefined;
            if (!this.stopped) this.setStatus("offline");
            throw userError(error);
        }
    }

    private async chatMutation(
        _name: "createAgent" | "createChannel" | "createDirectMessage" | "joinChat",
        request: (idempotencyKey: string) => Promise<{ chat: ChatSummary }>,
    ): Promise<ChatSummary> {
        this.assertActive();
        try {
            const result = await this.retryMutation(request);
            if (this.stopped) throw new UserError("This client state instance has been stopped.");
            this.upsertChats([result.chat], [], "action");
            return result.chat;
        } catch (error) {
            throw userError(error);
        }
    }

    private async retryMutation<T>(request: (idempotencyKey: string) => Promise<T>): Promise<T> {
        const idempotencyKey = this.createId();
        let lastError: unknown;
        for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
            try {
                return await request(idempotencyKey);
            } catch (error) {
                lastError = error;
                if (attempt === this.attempts || !retryable(error)) throw error;
                const requestedDelay =
                    error instanceof ApiResponseError ? error.retryAfterMs : undefined;
                await this.sleep(requestedDelay ?? Math.max(0, this.delayMs(attempt, error)));
            }
        }
        throw lastError;
    }

    private async retryRead<T>(request: () => Promise<T>): Promise<T> {
        let lastError: unknown;
        for (let attempt = 1; attempt <= this.attempts; attempt += 1) {
            try {
                return await request();
            } catch (error) {
                lastError = error;
                if (attempt === this.attempts || !retryable(error)) throw error;
                const requestedDelay =
                    error instanceof ApiResponseError ? error.retryAfterMs : undefined;
                await this.sleep(requestedDelay ?? Math.max(0, this.delayMs(attempt, error)));
            }
        }
        throw lastError;
    }

    private onRealtime(event: RealtimeEvent): void {
        if (this.stopped) return;
        this.emit({ type: "realtime", event });
        if (event.type === "sync") {
            this.syncAgain = true;
            if (this.snapshot.sync) this.queueSync();
            return;
        }
        if (event.type === "typing") this.applyTyping(event);
        else if (event.type === "presence") this.applyPresence(event);
    }

    private onRealtimeError(error: unknown): void {
        if (this.stopped) return;
        this.unsubscribeRealtime?.();
        this.unsubscribeRealtime = undefined;
        this.setStatus("offline");
        this.emit({
            type: "background-error",
            action: "sync",
            error: userError(error, "Realtime disconnected."),
        });
    }

    private queueSync(): void {
        if (this.syncPromise || this.stopped || !this.snapshot.sync) return;
        this.syncPromise = (async () => {
            while (this.syncAgain && !this.stopped) {
                this.syncAgain = false;
                try {
                    await this.synchronize();
                } catch (error) {
                    this.emit({
                        type: "background-error",
                        action: "sync",
                        error: userError(error, "Could not synchronize client state."),
                    });
                    return;
                }
            }
        })().finally(() => {
            this.syncPromise = undefined;
            if (this.syncAgain) this.queueSync();
        });
        this.track(this.syncPromise);
    }

    private async synchronize(): Promise<void> {
        let cursor = this.snapshot.sync;
        if (!cursor) return;
        for (;;) {
            const difference = await this.api.difference(cursor);
            if (this.stopped) return;
            if (difference.kind === "reset") {
                await this.reloadAll(difference.state);
                return;
            }
            const previousChats = new Map(this.snapshot.chats.map((chat) => [chat.id, chat]));
            const loaded = new Set(Object.keys(this.snapshot.messagesByChat));
            this.upsertChats(difference.changedChats, difference.removedChatIds, "sync");
            await this.refreshAreas(difference.areas);
            for (const chat of difference.changedChats) {
                const previous = previousChats.get(chat.id);
                if (previous && loaded.has(chat.id)) await this.synchronizeChat(previous);
            }
            cursor = difference.state;
            this.replaceSnapshot({ sync: cursor });
            if (difference.kind !== "slice") return;
        }
    }

    private async refreshAreas(areas: readonly string[]): Promise<void> {
        const operations = new Set<BackendOperation>();
        const add = (operation: BackendOperation): void => {
            if (operation in this.snapshot.operationResults) operations.add(operation);
        };
        for (const area of areas) {
            if (area === "calls") add("getCalls");
            else if (area === "preferences") add("getNotificationPreferences");
            else if (area === "notifications") add("getNotifications");
            else if (area === "threads") add("getThreads");
            else if (area === "scheduled-messages") add("getScheduledMessages");
            else if (area === "automations") add("getAutomations");
            else if (area === "agent-images") add("getAgentImages");
            else if (area === "bots") add("getBots");
            else if (area === "integrations") add("getIntegrations");
            else if (area === "presence") add("getPresence");
            else if (area === "users") {
                add("getDirectoryUsers");
                add("getAdminUsers");
            } else if (area === "emoji") add("getCustomEmoji");
            else if (area === "server") add("getServer");
            else if (area === "directories") add("getDirectory");
        }
        await Promise.all(Array.from(operations, (operation) => this.execute(operation)));
    }

    private applyOperationResult<K extends BackendOperation>(
        operation: K,
        input: BackendOperationInput<K> | undefined,
        result: BackendOperationResult<K>,
    ): void {
        const value = result as Record<string, unknown>;
        if (operation === "getChats" && Array.isArray(value.chats)) {
            const chats = value.chats as ChatSummary[];
            this.replaceSnapshot({ chats });
            this.emit({
                type: "chats",
                reason: "initial",
                chatIds: chats.map((chat) => chat.id),
                removedChatIds: [],
            });
        }
        const chat = value.chat as ChatSummary | undefined;
        if (chat?.id) this.upsertChats([chat], [], "action");
        const message = value.message as MessageSummary | undefined;
        if (message?.id && message.chatId)
            this.upsertMessages(message.chatId, [sentMessage(message)], "sync", [message.id]);
        if (operation === "getMessages" && Array.isArray(value.messages)) {
            const messages = value.messages as MessageSummary[];
            const chatId =
                messages[0]?.chatId ?? (input as Record<string, unknown> | undefined)?.chatId;
            if (chatId)
                this.replaceMessages(
                    chatId,
                    messages.map(sentMessage),
                    "initial",
                    messages.map((item) => item.id),
                );
        }
        if (Array.isArray(value.presence))
            this.replaceSnapshot({ presence: value.presence as PresenceSnapshot[] });
    }

    private async synchronizeChat(previous: ChatSummary): Promise<void> {
        let cursor = { membershipEpoch: previous.membershipEpoch, pts: previous.pts };
        for (;;) {
            const difference = await this.api.chatDifference(previous.id, cursor);
            if (difference.kind === "reset" || difference.kind === "tooLong") {
                await this.loadMessages(previous.id);
                this.upsertChats([difference.chat], [], "sync");
                return;
            }
            if (difference.messages.length > 0) {
                this.upsertMessages(
                    previous.id,
                    difference.messages.map(sentMessage),
                    "sync",
                    difference.messages.map((message) => message.id),
                );
            }
            this.upsertChats([difference.chat], [], "sync");
            cursor = difference.state;
            if (difference.kind !== "slice") return;
        }
    }

    private async reloadAll(state: SyncState): Promise<void> {
        const previousChatIds = new Set(this.snapshot.chats.map((chat) => chat.id));
        const loadedChatIds = Object.keys(this.snapshot.messagesByChat);
        const chats = await this.api.chats();
        if (this.stopped) return;
        const visible = new Set(chats.chats.map((chat) => chat.id));
        const messagesByChat = Object.fromEntries(
            Object.entries(this.snapshot.messagesByChat).filter(([chatId]) => visible.has(chatId)),
        );
        this.replaceSnapshot({ sync: state, chats: [...chats.chats], messagesByChat });
        this.emit({
            type: "chats",
            reason: "sync",
            chatIds: chats.chats.map((chat) => chat.id),
            removedChatIds: [...previousChatIds].filter((chatId) => !visible.has(chatId)),
        });
        await Promise.all(
            loadedChatIds
                .filter((chatId) => visible.has(chatId))
                .map((chatId) => this.loadMessages(chatId)),
        );
    }

    private applyTyping(event: Extract<RealtimeEvent, { type: "typing" }>): void {
        const actorKey = event.userId;
        const key = `${event.chatId}\u0000${actorKey}`;
        if ((this.typingOccurredAt.get(key) ?? -1) > event.occurredAt) return;
        this.typingOccurredAt.set(key, event.occurredAt);
        const existing = this.snapshot.typing.filter(
            (typing) => typing.chatId !== event.chatId || typingActorKey(typing) !== actorKey,
        );
        const active = event.active && (event.expiresAt ?? 0) > this.now();
        const typing: TypingState[] = active
            ? [
                  ...existing,
                  {
                      chatId: event.chatId,
                      userId: event.userId,
                      expiresAt: event.expiresAt!,
                  },
              ]
            : existing;
        this.replaceSnapshot({ typing });
        const timer = this.typingTimers.get(key);
        if (timer) clearTimeout(timer);
        this.typingTimers.delete(key);
        if (active) {
            const nextTimer = setTimeout(
                () => this.expireTyping(key, event.chatId, actorKey, event.expiresAt!),
                Math.max(0, event.expiresAt! - this.now()),
            );
            this.typingTimers.set(key, nextTimer);
        }
        this.emit({
            type: "typing",
            chatId: event.chatId,
            userId: event.userId,
            active,
        });
    }

    private expireTyping(key: string, chatId: string, actorKey: string, expiresAt: number): void {
        this.typingTimers.delete(key);
        const current = this.snapshot.typing.find(
            (typing) => typing.chatId === chatId && typingActorKey(typing) === actorKey,
        );
        if (!current || current.expiresAt !== expiresAt) return;
        this.replaceSnapshot({
            typing: this.snapshot.typing.filter(
                (typing) => typing.chatId !== chatId || typingActorKey(typing) !== actorKey,
            ),
        });
        this.emit({
            type: "typing",
            chatId,
            userId: current.userId,
            active: false,
        });
    }

    private applyPresence(event: Extract<RealtimeEvent, { type: "presence" }>): void {
        const previousTime = this.presenceOccurredAt.get(event.snapshot.userId) ?? -1;
        if (previousTime > event.occurredAt) return;
        this.presenceOccurredAt.set(event.snapshot.userId, event.occurredAt);
        const presence = this.snapshot.presence.filter(
            (item) => item.userId !== event.snapshot.userId,
        );
        presence.push(event.snapshot);
        this.replaceSnapshot({ presence });
        this.emit({
            type: "presence",
            userId: event.snapshot.userId,
            status: event.snapshot.status,
        });
    }

    private upsertChats(
        changed: readonly ChatSummary[],
        removedIds: readonly string[],
        reason: Extract<ClientStateEvent, { type: "chats" }>["reason"],
    ): void {
        if (changed.length === 0 && removedIds.length === 0) return;
        const chats = new Map(this.snapshot.chats.map((chat) => [chat.id, chat]));
        for (const id of removedIds) chats.delete(id);
        for (const chat of changed) chats.set(chat.id, chat);
        const messagesByChat = { ...this.snapshot.messagesByChat };
        for (const id of removedIds) delete messagesByChat[id];
        this.replaceSnapshot({ chats: [...chats.values()], messagesByChat });
        this.emit({
            type: "chats",
            reason,
            chatIds: changed.map((chat) => chat.id),
            removedChatIds: [...removedIds],
        });
    }

    private upsertMessages(
        chatId: string,
        changed: readonly ClientMessage[],
        reason: Extract<ClientStateEvent, { type: "messages" }>["reason"],
        ids: readonly string[],
    ): void {
        const messages = new Map(
            (this.snapshot.messagesByChat[chatId] ?? []).map((message) => [
                message.message.id,
                message,
            ]),
        );
        for (const message of changed) messages.set(message.message.id, message);
        this.replaceMessages(chatId, sortedMessages([...messages.values()]), reason, ids);
    }

    private replaceMessages(
        chatId: string,
        messages: readonly ClientMessage[],
        reason: Extract<ClientStateEvent, { type: "messages" }>["reason"],
        ids: readonly string[],
    ): void {
        this.replaceSnapshot({
            messagesByChat: { ...this.snapshot.messagesByChat, [chatId]: [...messages] },
        });
        this.emit({ type: "messages", reason, chatId, messageIds: [...ids] });
    }

    private setStatus(status: ClientStateSnapshot["status"]): void {
        const previous = this.snapshot.status;
        if (previous === status) return;
        this.replaceSnapshot({ status });
        this.emit({ type: "status", previous, current: status });
    }

    private replaceSnapshot(changes: Partial<Omit<ClientStateSnapshot, "revision">>): void {
        this.snapshot = freezeSnapshot({
            ...this.snapshot,
            ...changes,
            revision: this.snapshot.revision + 1,
        });
    }

    private emit(event: ClientStateEvent): void {
        for (const listener of Array.from(this.listeners)) {
            try {
                listener(event);
            } catch (error) {
                this.onSubscriberError(error);
            }
        }
    }

    private track(promise: Promise<void>): void {
        this.pending.add(promise);
        void promise.finally(() => this.pending.delete(promise));
    }

    private assertActive(): void {
        if (this.stopped) throw new UserError("This client state instance has been stopped.");
    }
}

function sentMessage(message: MessageSummary): ClientMessage {
    return { message, delivery: "sent" };
}

function messageId(message: ClientMessage): string {
    return message.message.id;
}

function optimisticMessage(
    id: string,
    chatId: string,
    input: SendMessageInput,
    now: number,
): MessageSummary {
    return {
        id,
        chatId,
        sequence: "0",
        changePts: "0",
        kind: "user",
        text: input.text ?? "",
        threadRootMessageId: input.threadRootMessageId,
        threadReplyCount: 0,
        revision: 1,
        mentions: [],
        attachments: [],
        reactions: [],
        receipts: [],
        expiryMode: input.expiryMode ?? (input.selfDestructSeconds ? "after_send" : "none"),
        selfDestructSeconds: input.selfDestructSeconds,
        createdAt: new Date(now).toISOString(),
    };
}

function sortedMessages(messages: readonly ClientMessage[]): ClientMessage[] {
    return [...messages].sort((left, right) => {
        const leftLocal = left.message.id.startsWith("local:");
        const rightLocal = right.message.id.startsWith("local:");
        if (leftLocal !== rightLocal) return leftLocal ? 1 : -1;
        const sequence = BigInt(left.message.sequence) - BigInt(right.message.sequence);
        if (sequence !== 0n) return sequence < 0n ? -1 : 1;
        return left.message.id.localeCompare(right.message.id);
    });
}

function retryable(error: unknown): boolean {
    if (error instanceof TransportError) return error.retryable;
    if (!(error instanceof ApiResponseError)) return true;
    if (error.code === "idempotency_in_progress" || error.code === "idempotency_unavailable")
        return true;
    return (
        error.response.status === 408 ||
        error.response.status === 425 ||
        error.response.status === 429 ||
        error.response.status >= 500
    );
}

function typingActorKey(actor: { readonly userId: string }): string {
    return actor.userId;
}

function userError(
    error: unknown,
    fallback = "The requested action could not be completed.",
): UserError {
    if (error instanceof UserError) return error;
    if (error instanceof ApiResponseError)
        return new UserError(error.message || fallback, error.code, error);
    if (error instanceof Error) return new UserError(fallback, undefined, error);
    return new UserError(fallback, undefined, error);
}

function freezeSnapshot(snapshot: ClientStateSnapshot): ClientStateSnapshot {
    const messagesByChat = Object.fromEntries(
        Object.entries(snapshot.messagesByChat).map(([chatId, messages]) => [
            chatId,
            [...messages],
        ]),
    );
    return deepFreeze({
        ...snapshot,
        chats: [...snapshot.chats],
        messagesByChat,
        typing: [...snapshot.typing],
        presence: [...snapshot.presence],
        operationResults: { ...snapshot.operationResults },
    });
}

function deepFreeze<T>(value: T): T {
    if (value === null || typeof value !== "object" || Object.isFrozen(value)) return value;
    const prototype = Object.getPrototypeOf(value) as unknown;
    if (!Array.isArray(value) && prototype !== Object.prototype && prototype !== null) return value;
    for (const child of Object.values(value)) deepFreeze(child);
    return Object.freeze(value);
}

function defaultId(): string {
    return (
        globalThis.crypto?.randomUUID?.() ??
        `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
    );
}

function defaultSleep(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
