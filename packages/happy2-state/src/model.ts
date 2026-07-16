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
    ClientWorkspace,
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
    WorkspaceFileWriteInput,
    WorkspaceTextFile,
    WorkspaceTextPatch,
} from "./types.js";
import { UserError, WorkspaceFileConflictError } from "./types.js";
import {
    clientWorkspace,
    createWorkspaceRecord,
    removeWorkspaceDirectory,
    replaceWorkspaceInitial,
    setWorkspaceDirectory,
    setWorkspaceRequestedDirectories,
    type WorkspaceDirectoryRecord,
    type WorkspaceRecord,
} from "./workspace.js";

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
    /** Lazily loads the adaptive initial tree for a chat workspace. */
    loadWorkspace(chatId: string): Promise<ClientWorkspace>;
    /**
     * Makes the workspace match the host's currently requested (usually expanded)
     * directories and returns one aggregate ready for the file-tree component.
     */
    syncWorkspace(
        chatId: string,
        requestedDirectories: readonly string[],
    ): Promise<ClientWorkspace>;
    /** Convenience action that adds one directory to the requested set. */
    loadWorkspaceDirectory(chatId: string, directory: string): Promise<ClientWorkspace>;
    /** Loads at most one additional page for an already expanded directory. */
    loadMoreWorkspaceDirectory(chatId: string, directory: string): Promise<ClientWorkspace>;
    /** Reads and materializes one UTF-8 file with its conflict-detection version. */
    readWorkspaceFile(chatId: string, path: string): Promise<WorkspaceTextFile>;
    /** Stops retaining and live-reconciling a file after its editor surface closes. */
    unloadWorkspaceFile(chatId: string, path: string): Promise<void>;
    /**
     * Writes full content or a text patch. On a version conflict, non-overlapping
     * edits are reapplied to the latest file and retried automatically.
     */
    writeWorkspaceFile(chatId: string, input: WorkspaceFileWriteInput): Promise<WorkspaceTextFile>;
    /** Deletes only if the file still has the supplied last-read version. */
    deleteWorkspaceFile(chatId: string, path: string, expectedVersion: string): Promise<void>;
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
    private readonly workspaceRecords = new Map<string, WorkspaceRecord>();
    private readonly workspaceChains = new Map<string, Promise<void>>();
    private readonly workspaceEpochs = new Map<string, number>();
    private readonly workspaceHints = new Map<string, number>();
    private readonly workspaceReconcileAgain = new Set<string>();
    private readonly workspaceReconcilePromises = new Map<string, Promise<void>>();
    private readonly workspaceFileChains = new Map<string, Promise<void>>();
    private readonly workspaceFileBases = new Map<string, WorkspaceTextFile>();
    private readonly openWorkspaceFilePaths = new Map<string, Set<string>>();
    private readonly workspaceFileReconcileAgain = new Set<string>();
    private readonly workspaceFileReconcilePromises = new Map<string, Promise<void>>();
    private snapshot: ClientStateSnapshot = freezeSnapshot({
        revision: 0,
        status: "idle",
        chats: [],
        messagesByChat: {},
        workspacesByChat: {},
        workspaceFilesByChat: {},
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
        this.workspaceReconcileAgain.clear();
        this.workspaceFileReconcileAgain.clear();
        this.workspaceFileBases.clear();
        this.openWorkspaceFilePaths.clear();
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

    async loadWorkspace(chatId: string): Promise<ClientWorkspace> {
        this.assertActive();
        const loaded = this.workspaceRecords.get(chatId);
        if (loaded) return clientWorkspace(chatId, loaded);
        const hint = this.workspaceHints.get(chatId) ?? 0;
        try {
            const workspace = await this.enqueueWorkspace(chatId, async () => {
                const current = this.workspaceRecords.get(chatId);
                if (current) return clientWorkspace(chatId, current);
                const epoch = this.workspaceEpochs.get(chatId) ?? 0;
                const response = await this.retryRead(() => this.api.workspace(chatId));
                if (response.notModified)
                    throw new Error("An unloaded workspace cannot be not modified");
                if (this.stopped)
                    throw new UserError("This client state instance has been stopped.");
                if ((this.workspaceEpochs.get(chatId) ?? 0) !== epoch)
                    throw new UserError("Chat workspace is no longer available.", "not_found");
                const record = createWorkspaceRecord(response.workspace, response.etag);
                this.commitWorkspace(chatId, record, "initial", []);
                return clientWorkspace(chatId, record);
            });
            if ((this.workspaceHints.get(chatId) ?? 0) !== hint)
                this.queueWorkspaceReconcile(chatId);
            return workspace;
        } catch (error) {
            throw userError(error);
        }
    }

    async loadWorkspaceDirectory(chatId: string, directory: string): Promise<ClientWorkspace> {
        this.assertActive();
        await this.loadWorkspace(chatId);
        const requested = [...this.requireWorkspace(chatId).requestedDirectories];
        if (!requested.includes(directory)) requested.push(directory);
        return this.syncWorkspace(chatId, requested);
    }

    async syncWorkspace(
        chatId: string,
        requestedDirectories: readonly string[],
    ): Promise<ClientWorkspace> {
        this.assertActive();
        await this.loadWorkspace(chatId);
        const requested = [...new Set(requestedDirectories)].sort(compareWorkspacePaths);
        try {
            return await this.enqueueWorkspace(chatId, async () => {
                const current = this.requireWorkspace(chatId);
                let next = current;
                let changed =
                    next.requestedDirectories.length !== requested.length ||
                    next.requestedDirectories.some(
                        (directory, index) => directory !== requested[index],
                    );
                next = setWorkspaceRequestedDirectories(next, requested);
                const desired = new Set(requested);
                for (const directory of next.directories.keys()) {
                    if (desired.has(directory)) continue;
                    next = removeWorkspaceDirectory(next, directory);
                    changed = true;
                }

                const aggregate = clientWorkspace(chatId, next);
                const visible = new Set(aggregate.paths);
                const unloaded = new Set(aggregate.unloadedDirectories);
                const missing = requested.filter(
                    (directory) =>
                        !next.directories.has(directory) &&
                        (unloaded.has(directory) || !visible.has(directory)),
                );
                const loaded = new Map<string, WorkspaceDirectoryRecord>();
                let nextIndex = 0;
                const worker = async (): Promise<void> => {
                    while (nextIndex < missing.length) {
                        const directory = missing[nextIndex++]!;
                        loaded.set(directory, {
                            pages: await this.fetchWorkspaceDirectory(chatId, directory, 1),
                        });
                    }
                };
                await Promise.all(
                    Array.from({ length: Math.min(4, missing.length) }, () => worker()),
                );
                for (const [directory, value] of loaded) {
                    next = setWorkspaceDirectory(next, directory, value);
                    changed = true;
                }
                if (!changed) return clientWorkspace(chatId, next);
                this.assertCurrentWorkspace(chatId, current);
                this.commitWorkspace(chatId, next, "directory", requested);
                return clientWorkspace(chatId, next);
            });
        } catch (error) {
            throw userError(error);
        }
    }

    async loadMoreWorkspaceDirectory(chatId: string, directory: string): Promise<ClientWorkspace> {
        this.assertActive();
        await this.loadWorkspaceDirectory(chatId, directory);
        try {
            return await this.enqueueWorkspace(chatId, async () => {
                const current = this.requireWorkspace(chatId);
                const loaded = current.directories.get(directory);
                if (!loaded) return clientWorkspace(chatId, current);
                const cursor = loaded.pages.at(-1)?.nextCursor;
                if (!cursor) return clientWorkspace(chatId, current);
                let pages: readonly import("./api.js").WorkspaceListing[];
                try {
                    const response = await this.retryRead(() =>
                        this.api.workspace(chatId, { directory, cursor }),
                    );
                    if (response.notModified)
                        throw new Error("A directory page cannot be not modified");
                    this.assertWorkspaceDirectory(response.workspace, directory);
                    pages = [...loaded.pages, response.workspace];
                } catch (error) {
                    if (!isStaleWorkspaceCursor(error)) throw error;
                    pages = await this.fetchWorkspaceDirectory(
                        chatId,
                        directory,
                        loaded.pages.length + 1,
                    );
                }
                const next = setWorkspaceDirectory(current, directory, { pages });
                this.assertCurrentWorkspace(chatId, current);
                this.commitWorkspace(chatId, next, "directory", [directory]);
                return clientWorkspace(chatId, next);
            });
        } catch (error) {
            throw userError(error);
        }
    }

    async readWorkspaceFile(chatId: string, path: string): Promise<WorkspaceTextFile> {
        this.assertActive();
        try {
            return await this.enqueueWorkspaceFile(chatId, path, async () => {
                const file = await this.fetchWorkspaceFile(chatId, path);
                this.commitWorkspaceFile(chatId, file, "read");
                this.rememberWorkspaceFileBase(chatId, file);
                return file;
            });
        } catch (error) {
            throw userError(error, "Could not read the workspace file.");
        }
    }

    async unloadWorkspaceFile(chatId: string, path: string): Promise<void> {
        this.assertActive();
        return this.enqueueWorkspaceFile(chatId, path, async () => {
            this.forgetWorkspaceFile(chatId, path);
            this.removeWorkspaceFile(chatId, path, "unload");
        });
    }

    async writeWorkspaceFile(
        chatId: string,
        input: WorkspaceFileWriteInput,
    ): Promise<WorkspaceTextFile> {
        this.assertActive();
        try {
            return await this.enqueueWorkspaceFile(chatId, input.path, async () => {
                let expectedVersion = input.expectedVersion;
                let base =
                    expectedVersion === null
                        ? undefined
                        : this.cachedWorkspaceFile(chatId, input.path, expectedVersion);
                let patch =
                    input.patch ??
                    (base && input.content !== undefined
                        ? patchFromContents(base.content, input.content)
                        : undefined);
                let attemptedContent = input.content;
                if (attemptedContent === undefined && patch && (base || expectedVersion === null))
                    attemptedContent = applyTextPatch(base?.content ?? "", patch);
                let request: WorkspaceFileWriteInput = input;

                for (
                    let conflictAttempt = 1;
                    conflictAttempt <= this.attempts;
                    conflictAttempt += 1
                ) {
                    try {
                        const result = await this.retryMutation((idempotencyKey) =>
                            this.api.writeWorkspaceFile(chatId, request, idempotencyKey),
                        );
                        const file =
                            attemptedContent === undefined
                                ? await this.fetchWorkspaceFile(chatId, input.path)
                                : {
                                      path: result.path,
                                      content: attemptedContent,
                                      size: result.size,
                                      version: result.version,
                                  };
                        this.commitWorkspaceFile(chatId, file, "write");
                        this.rememberWorkspaceFileBase(chatId, file);
                        if (this.workspaceRecords.has(chatId)) this.queueWorkspaceReconcile(chatId);
                        return file;
                    } catch (error) {
                        if (!isWorkspaceFileConflict(error))
                            throw userError(error, "Could not write the workspace file.");
                        const latest = await this.fetchWorkspaceFileIfPresent(chatId, input.path);
                        if (latest) this.commitWorkspaceFile(chatId, latest, "conflict");
                        else this.removeWorkspaceFile(chatId, input.path, "conflict");
                        if (
                            conflictAttempt === this.attempts ||
                            expectedVersion === null ||
                            !base ||
                            !latest ||
                            !patch
                        )
                            throw new WorkspaceFileConflictError(
                                input.path,
                                latest,
                                attemptedContent,
                                error,
                            );
                        const rebased = rebaseTextPatch(base.content, latest.content, patch);
                        if (!rebased)
                            throw new WorkspaceFileConflictError(
                                input.path,
                                latest,
                                attemptedContent,
                                error,
                            );
                        base = latest;
                        patch = rebased;
                        attemptedContent = applyTextPatch(latest.content, rebased);
                        expectedVersion = latest.version;
                        request = {
                            path: input.path,
                            expectedVersion,
                            patch: rebased,
                        };
                    }
                }
                throw new WorkspaceFileConflictError(input.path, base, attemptedContent);
            });
        } catch (error) {
            throw userError(error, "Could not write the workspace file.");
        }
    }

    async deleteWorkspaceFile(
        chatId: string,
        path: string,
        expectedVersion: string,
    ): Promise<void> {
        this.assertActive();
        try {
            return await this.enqueueWorkspaceFile(chatId, path, async () => {
                let expected = expectedVersion;
                let base = this.cachedWorkspaceFile(chatId, path, expectedVersion);
                for (
                    let conflictAttempt = 1;
                    conflictAttempt <= this.attempts;
                    conflictAttempt += 1
                ) {
                    try {
                        await this.retryMutation((idempotencyKey) =>
                            this.api.deleteWorkspaceFile(chatId, path, expected, idempotencyKey),
                        );
                        this.forgetWorkspaceFile(chatId, path);
                        this.removeWorkspaceFile(chatId, path, "delete");
                        if (this.workspaceRecords.has(chatId)) this.queueWorkspaceReconcile(chatId);
                        return;
                    } catch (error) {
                        if (!isWorkspaceFileConflict(error))
                            throw userError(error, "Could not delete the workspace file.");
                        const latest = await this.fetchWorkspaceFileIfPresent(chatId, path);
                        if (latest) this.commitWorkspaceFile(chatId, latest, "conflict");
                        else this.removeWorkspaceFile(chatId, path, "conflict");
                        if (
                            conflictAttempt === this.attempts ||
                            !base ||
                            !latest ||
                            base.content !== latest.content
                        )
                            throw new WorkspaceFileConflictError(path, latest, undefined, error);
                        base = latest;
                        expected = latest.version;
                    }
                }
            });
        } catch (error) {
            throw userError(error, "Could not delete the workspace file.");
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
        if (event.type === "workspace.changed") {
            this.workspaceHints.set(event.chatId, (this.workspaceHints.get(event.chatId) ?? 0) + 1);
            if (this.workspaceRecords.has(event.chatId)) this.queueWorkspaceReconcile(event.chatId);
            if ((this.openWorkspaceFilePaths.get(event.chatId)?.size ?? 0) > 0)
                this.queueWorkspaceFilesReconcile(event.chatId);
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
        const removedChatIds = [...previousChatIds].filter((chatId) => !visible.has(chatId));
        for (const chatId of removedChatIds) {
            this.invalidateWorkspace(chatId);
            this.forgetWorkspaceChat(chatId);
        }
        const messagesByChat = Object.fromEntries(
            Object.entries(this.snapshot.messagesByChat).filter(([chatId]) => visible.has(chatId)),
        );
        const workspaceFilesByChat = Object.fromEntries(
            Object.entries(this.snapshot.workspaceFilesByChat).filter(([chatId]) =>
                visible.has(chatId),
            ),
        );
        const workspacesByChat = { ...this.snapshot.workspacesByChat };
        const removedWorkspaceIds: string[] = [];
        for (const chatId of this.workspaceRecords.keys()) {
            if (visible.has(chatId)) continue;
            this.workspaceRecords.delete(chatId);
            this.workspaceReconcileAgain.delete(chatId);
            this.workspaceFileReconcileAgain.delete(chatId);
            delete workspacesByChat[chatId];
            removedWorkspaceIds.push(chatId);
        }
        this.replaceSnapshot({
            sync: state,
            chats: [...chats.chats],
            messagesByChat,
            workspacesByChat,
            workspaceFilesByChat,
        });
        for (const chatId of removedWorkspaceIds)
            this.emit({ type: "workspace", reason: "removed", chatId, directories: [] });
        this.emit({
            type: "chats",
            reason: "sync",
            chatIds: chats.chats.map((chat) => chat.id),
            removedChatIds,
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
        const workspacesByChat = { ...this.snapshot.workspacesByChat };
        const workspaceFilesByChat = { ...this.snapshot.workspaceFilesByChat };
        const removedWorkspaceIds: string[] = [];
        for (const id of removedIds) {
            this.invalidateWorkspace(id);
            this.forgetWorkspaceChat(id);
            delete messagesByChat[id];
            delete workspaceFilesByChat[id];
            this.workspaceFileReconcileAgain.delete(id);
            if (this.workspaceRecords.delete(id) || workspacesByChat[id]) {
                delete workspacesByChat[id];
                this.workspaceReconcileAgain.delete(id);
                removedWorkspaceIds.push(id);
            }
        }
        this.replaceSnapshot({
            chats: [...chats.values()],
            messagesByChat,
            workspacesByChat,
            workspaceFilesByChat,
        });
        for (const chatId of removedWorkspaceIds)
            this.emit({ type: "workspace", reason: "removed", chatId, directories: [] });
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

    private enqueueWorkspaceFile<T>(
        chatId: string,
        path: string,
        action: () => Promise<T>,
    ): Promise<T> {
        const key = workspaceFileKey(chatId, path);
        const previous = this.workspaceFileChains.get(key) ?? Promise.resolve();
        const result = previous.catch(() => undefined).then(action);
        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        this.workspaceFileChains.set(key, settled);
        void settled.finally(() => {
            if (this.workspaceFileChains.get(key) === settled) this.workspaceFileChains.delete(key);
        });
        return result;
    }

    private async fetchWorkspaceFile(chatId: string, path: string): Promise<WorkspaceTextFile> {
        return this.retryRead(() => this.api.workspaceFile(chatId, path));
    }

    private async fetchWorkspaceFileIfPresent(
        chatId: string,
        path: string,
    ): Promise<WorkspaceTextFile | undefined> {
        try {
            return await this.fetchWorkspaceFile(chatId, path);
        } catch (error) {
            if (isMissingWorkspace(error)) return undefined;
            throw error;
        }
    }

    private cachedWorkspaceFile(
        chatId: string,
        path: string,
        version?: string,
    ): WorkspaceTextFile | undefined {
        const base = this.workspaceFileBases.get(workspaceFileKey(chatId, path));
        if (base && (version === undefined || base.version === version)) return base;
        const file = this.snapshot.workspaceFilesByChat[chatId]?.[path];
        return version === undefined || file?.version === version ? file : undefined;
    }

    private rememberWorkspaceFileBase(chatId: string, file: WorkspaceTextFile): void {
        this.workspaceFileBases.set(workspaceFileKey(chatId, file.path), file);
        const paths = this.openWorkspaceFilePaths.get(chatId) ?? new Set<string>();
        paths.add(file.path);
        this.openWorkspaceFilePaths.set(chatId, paths);
    }

    private forgetWorkspaceFile(chatId: string, path: string): void {
        this.workspaceFileBases.delete(workspaceFileKey(chatId, path));
        const paths = this.openWorkspaceFilePaths.get(chatId);
        paths?.delete(path);
        if (paths?.size === 0) this.openWorkspaceFilePaths.delete(chatId);
    }

    private forgetWorkspaceChat(chatId: string): void {
        for (const path of this.openWorkspaceFilePaths.get(chatId) ?? [])
            this.workspaceFileBases.delete(workspaceFileKey(chatId, path));
        this.openWorkspaceFilePaths.delete(chatId);
        this.workspaceFileReconcileAgain.delete(chatId);
    }

    private commitWorkspaceFile(
        chatId: string,
        file: WorkspaceTextFile,
        reason: Extract<ClientStateEvent, { type: "workspace-file" }>["reason"],
    ): void {
        const previous = this.snapshot.workspaceFilesByChat[chatId]?.[file.path];
        if (
            previous?.version === file.version &&
            previous.content === file.content &&
            previous.size === file.size
        )
            return;
        this.replaceSnapshot({
            workspaceFilesByChat: {
                ...this.snapshot.workspaceFilesByChat,
                [chatId]: {
                    ...this.snapshot.workspaceFilesByChat[chatId],
                    [file.path]: file,
                },
            },
        });
        this.emit({ type: "workspace-file", reason, chatId, path: file.path, file });
    }

    private removeWorkspaceFile(
        chatId: string,
        path: string,
        reason: Extract<ClientStateEvent, { type: "workspace-file" }>["reason"],
    ): void {
        const current = this.snapshot.workspaceFilesByChat[chatId];
        if (!current?.[path]) {
            if (reason === "conflict") this.emit({ type: "workspace-file", reason, chatId, path });
            return;
        }
        const chatFiles = { ...current };
        delete chatFiles[path];
        const workspaceFilesByChat = { ...this.snapshot.workspaceFilesByChat };
        if (Object.keys(chatFiles).length > 0) workspaceFilesByChat[chatId] = chatFiles;
        else delete workspaceFilesByChat[chatId];
        this.replaceSnapshot({ workspaceFilesByChat });
        this.emit({ type: "workspace-file", reason, chatId, path });
    }

    private queueWorkspaceFilesReconcile(chatId: string): void {
        this.workspaceFileReconcileAgain.add(chatId);
        if (this.workspaceFileReconcilePromises.has(chatId) || this.stopped) return;
        const task = (async () => {
            while (this.workspaceFileReconcileAgain.delete(chatId) && !this.stopped) {
                const paths = [...(this.openWorkspaceFilePaths.get(chatId) ?? [])];
                await Promise.all(
                    paths.map((path) =>
                        this.enqueueWorkspaceFile(chatId, path, async () => {
                            try {
                                const file = await this.fetchWorkspaceFile(chatId, path);
                                this.commitWorkspaceFile(chatId, file, "sync");
                            } catch (error) {
                                if (isMissingWorkspace(error)) {
                                    this.removeWorkspaceFile(chatId, path, "sync");
                                    return;
                                }
                                throw error;
                            }
                        }),
                    ),
                );
            }
        })()
            .catch((error) => {
                this.emit({
                    type: "background-error",
                    action: "workspace-file",
                    error: userError(error, "Could not synchronize open workspace files."),
                    chatId,
                });
            })
            .finally(() => {
                this.workspaceFileReconcilePromises.delete(chatId);
                if (this.workspaceFileReconcileAgain.has(chatId))
                    this.queueWorkspaceFilesReconcile(chatId);
            });
        this.workspaceFileReconcilePromises.set(chatId, task);
        this.track(task);
    }

    private enqueueWorkspace<T>(chatId: string, action: () => Promise<T>): Promise<T> {
        const previous = this.workspaceChains.get(chatId) ?? Promise.resolve();
        const result = previous.catch(() => undefined).then(action);
        const settled = result.then(
            () => undefined,
            () => undefined,
        );
        this.workspaceChains.set(chatId, settled);
        void settled.finally(() => {
            if (this.workspaceChains.get(chatId) === settled) this.workspaceChains.delete(chatId);
        });
        return result;
    }

    private queueWorkspaceReconcile(chatId: string): void {
        this.workspaceReconcileAgain.add(chatId);
        if (this.workspaceReconcilePromises.has(chatId) || this.stopped) return;
        const task = this.enqueueWorkspace(chatId, async () => {
            while (this.workspaceReconcileAgain.delete(chatId) && !this.stopped) {
                const current = this.workspaceRecords.get(chatId);
                if (!current) return;
                try {
                    const next = await this.reconcileWorkspace(chatId, current);
                    if (next) {
                        if (this.workspaceRecords.get(chatId) !== current) return;
                        this.commitWorkspace(chatId, next, "sync", [...next.directories.keys()]);
                    }
                } catch (error) {
                    if (isMissingWorkspace(error)) {
                        this.removeWorkspace(chatId);
                        return;
                    }
                    this.emit({
                        type: "background-error",
                        action: "workspace",
                        error: userError(error, "Could not synchronize workspace files."),
                        chatId,
                    });
                    return;
                }
            }
        }).finally(() => {
            this.workspaceReconcilePromises.delete(chatId);
            if (this.workspaceReconcileAgain.has(chatId)) this.queueWorkspaceReconcile(chatId);
        });
        this.workspaceReconcilePromises.set(chatId, task);
        this.track(task);
    }

    private async reconcileWorkspace(
        chatId: string,
        current: WorkspaceRecord,
    ): Promise<WorkspaceRecord | undefined> {
        const response = await this.retryRead(() =>
            this.api.workspace(chatId, { etag: current.initialEtag }),
        );
        if (response.notModified) return undefined;

        const entries = [...current.directories];
        const directories = new Map<string, WorkspaceDirectoryRecord>();
        let nextIndex = 0;
        const worker = async (): Promise<void> => {
            while (nextIndex < entries.length) {
                const [directory, loaded] = entries[nextIndex++]!;
                try {
                    const pages = await this.fetchWorkspaceDirectory(
                        chatId,
                        directory,
                        loaded.pages.length,
                    );
                    directories.set(directory, { pages });
                } catch (error) {
                    if (!isMissingWorkspace(error)) throw error;
                }
            }
        };
        await Promise.all(Array.from({ length: Math.min(4, entries.length) }, () => worker()));
        let next = replaceWorkspaceInitial(current, response.workspace, response.etag, directories);
        const unloaded = new Set(clientWorkspace(chatId, next).unloadedDirectories);
        for (const directory of next.requestedDirectories) {
            if (next.directories.has(directory) || !unloaded.has(directory)) continue;
            const pages = await this.fetchWorkspaceDirectory(chatId, directory, 1);
            next = setWorkspaceDirectory(next, directory, { pages });
        }
        return next;
    }

    private async fetchWorkspaceDirectory(
        chatId: string,
        directory: string,
        pageCount: number,
    ): Promise<readonly import("./api.js").WorkspaceListing[]> {
        let lastError: unknown;
        for (let restart = 0; restart < 3; restart += 1) {
            const pages: import("./api.js").WorkspaceListing[] = [];
            let cursor: string | undefined;
            try {
                while (pages.length < pageCount) {
                    const response = await this.retryRead(() =>
                        this.api.workspace(chatId, { directory, cursor }),
                    );
                    if (response.notModified)
                        throw new Error("A directory page cannot be not modified");
                    this.assertWorkspaceDirectory(response.workspace, directory);
                    pages.push(response.workspace);
                    cursor = response.workspace.nextCursor;
                    if (!cursor) break;
                }
                return pages;
            } catch (error) {
                lastError = error;
                if (!isStaleWorkspaceCursor(error)) throw error;
            }
        }
        throw lastError;
    }

    private assertWorkspaceDirectory(
        workspace: import("./api.js").WorkspaceListing,
        expected: string,
    ): void {
        if (workspace.directory !== expected)
            throw new Error("The server returned a mismatched workspace directory");
    }

    private requireWorkspace(chatId: string): WorkspaceRecord {
        const workspace = this.workspaceRecords.get(chatId);
        if (!workspace) throw new Error("Workspace was not loaded");
        return workspace;
    }

    private assertCurrentWorkspace(chatId: string, expected: WorkspaceRecord): void {
        if (this.workspaceRecords.get(chatId) !== expected)
            throw new UserError("Chat workspace is no longer available.", "not_found");
    }

    private invalidateWorkspace(chatId: string): void {
        this.workspaceEpochs.set(chatId, (this.workspaceEpochs.get(chatId) ?? 0) + 1);
        this.workspaceReconcileAgain.delete(chatId);
    }

    private commitWorkspace(
        chatId: string,
        record: WorkspaceRecord,
        reason: Extract<ClientStateEvent, { type: "workspace" }>["reason"],
        directories: readonly string[],
    ): void {
        this.workspaceRecords.set(chatId, record);
        this.replaceSnapshot({
            workspacesByChat: {
                ...this.snapshot.workspacesByChat,
                [chatId]: clientWorkspace(chatId, record),
            },
        });
        this.emit({ type: "workspace", reason, chatId, directories });
    }

    private removeWorkspace(chatId: string): void {
        this.invalidateWorkspace(chatId);
        this.forgetWorkspaceChat(chatId);
        const hadWorkspace =
            this.workspaceRecords.delete(chatId) || Boolean(this.snapshot.workspacesByChat[chatId]);
        const removedFiles = Object.keys(this.snapshot.workspaceFilesByChat[chatId] ?? {});
        if (!hadWorkspace && removedFiles.length === 0) return;
        const workspacesByChat = { ...this.snapshot.workspacesByChat };
        delete workspacesByChat[chatId];
        const workspaceFilesByChat = { ...this.snapshot.workspaceFilesByChat };
        delete workspaceFilesByChat[chatId];
        this.replaceSnapshot({ workspacesByChat, workspaceFilesByChat });
        if (hadWorkspace)
            this.emit({ type: "workspace", reason: "removed", chatId, directories: [] });
        for (const path of removedFiles)
            this.emit({ type: "workspace-file", reason: "sync", chatId, path });
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

function workspaceFileKey(chatId: string, path: string): string {
    return `${chatId}\u0000${path}`;
}

function isWorkspaceFileConflict(error: unknown): error is ApiResponseError {
    return error instanceof ApiResponseError && error.code === "workspace_file_conflict";
}

function applyTextPatch(content: string, patch: WorkspaceTextPatch): string {
    let cursor = 0;
    let result = "";
    for (const edit of patch.edits) {
        if (
            !Number.isSafeInteger(edit.start) ||
            !Number.isSafeInteger(edit.end) ||
            edit.start < cursor ||
            edit.end < edit.start ||
            edit.end > content.length
        )
            throw new UserError(
                "Workspace file edits must be sorted, non-overlapping, and within the file.",
                "workspace_invalid_patch",
            );
        result += content.slice(cursor, edit.start) + edit.text;
        cursor = edit.end;
    }
    return result + content.slice(cursor);
}

/**
 * Produces a compact single-splice representation. That makes rebasing conservative:
 * a remote save may contain many changes, but they are treated as one changed range
 * and an automatic retry happens only when the local edits are clearly outside it.
 */
function patchFromContents(base: string, desired: string): WorkspaceTextPatch {
    if (base === desired) return { edits: [] };
    let prefix = 0;
    const prefixLimit = Math.min(base.length, desired.length);
    while (prefix < prefixLimit && base[prefix] === desired[prefix]) prefix += 1;

    let suffix = 0;
    const suffixLimit = Math.min(base.length - prefix, desired.length - prefix);
    while (
        suffix < suffixLimit &&
        base[base.length - suffix - 1] === desired[desired.length - suffix - 1]
    )
        suffix += 1;

    return {
        edits: [
            {
                start: prefix,
                end: base.length - suffix,
                text: desired.slice(prefix, desired.length - suffix),
            },
        ],
    };
}

function rebaseTextPatch(
    base: string,
    current: string,
    local: WorkspaceTextPatch,
): WorkspaceTextPatch | undefined {
    // Validate the caller's patch even if the remote file happened not to change.
    applyTextPatch(base, local);
    const remote = patchFromContents(base, current).edits[0];
    if (!remote) return local;
    const delta = remote.text.length - (remote.end - remote.start);
    const edits = [] as { start: number; end: number; text: string }[];
    for (const edit of local.edits) {
        const bothInsertAtSamePoint =
            edit.start === edit.end && remote.start === remote.end && edit.start === remote.start;
        if (bothInsertAtSamePoint) return undefined;
        if (edit.end <= remote.start) {
            edits.push(edit);
            continue;
        }
        if (edit.start >= remote.end) {
            edits.push({
                ...edit,
                start: edit.start + delta,
                end: edit.end + delta,
            });
            continue;
        }
        return undefined;
    }
    return { edits };
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
    const workspaceFilesByChat = Object.fromEntries(
        Object.entries(snapshot.workspaceFilesByChat).map(([chatId, files]) => [
            chatId,
            { ...files },
        ]),
    );
    return deepFreeze({
        ...snapshot,
        chats: [...snapshot.chats],
        messagesByChat,
        workspacesByChat: { ...snapshot.workspacesByChat },
        workspaceFilesByChat,
        typing: [...snapshot.typing],
        presence: [...snapshot.presence],
        operationResults: { ...snapshot.operationResults },
    });
}

function isStaleWorkspaceCursor(error: unknown): boolean {
    return error instanceof ApiResponseError && error.code === "workspace_cursor_stale";
}

function isMissingWorkspace(error: unknown): boolean {
    return error instanceof ApiResponseError && error.code === "not_found";
}

function compareWorkspacePaths(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
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
