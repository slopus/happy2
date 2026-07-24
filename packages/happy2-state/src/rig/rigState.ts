import type {
    RigActivityHandle,
    RigActivitySnapshot,
    RigDirectoryGroupProjection,
    RigDirectorySnapshot,
    RigDirectoryStore,
    RigSessionHandle,
    RigSessionId,
    RigSessionProjection,
    RigSessionSnapshot,
    RigSessionSummaryProjection,
    RigStateError,
    RigStateOutput,
    RigSurfaceStore,
    RigTerminalId,
    RigTerminalListHandle,
    RigTerminalListSnapshot,
    RigTerminalSnapshot,
    RigTerminalStore,
} from "./rigTypes.js";
import type { RigSessionEvent, RigTerminalConnection, RigTransport } from "./rigTransport.js";

export interface RigStateOptions {
    readonly transport: RigTransport;
    readonly event?: (event: RigStateOutput) => void;
    readonly backgroundError?: (error: RigStateError) => void;
    readonly createId?: () => string;
}

class Surface<Snapshot> implements RigSurfaceStore<Snapshot> {
    private readonly listeners = new Set<() => void>();

    constructor(private value: Snapshot) {}

    get(): Snapshot {
        return this.value;
    }

    subscribe(listener: () => void): () => void {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    }

    set(value: Snapshot): void {
        if (value === this.value) return;
        this.value = value;
        for (const listener of this.listeners) listener();
    }
}

interface SessionBinding {
    readonly store: Surface<RigSessionSnapshot>;
    references?: RigSessionProjection;
    acquisitions: number;
    generation: number;
    cursor?: RigSessionProjection["lastEventId"];
    closeStream?: () => void;
    retryAttempt: number;
    retryTimer?: ReturnType<typeof setTimeout>;
}

interface ActivityBinding {
    readonly store: Surface<RigActivitySnapshot>;
    acquisitions: number;
    generation: number;
    cursor?: RigSessionProjection["lastEventId"];
    closeStream?: () => void;
    retryAttempt: number;
    retryTimer?: ReturnType<typeof setTimeout>;
}

interface TerminalListBinding {
    readonly store: Surface<RigTerminalListSnapshot>;
    acquisitions: number;
    generation: number;
    cursor?: RigSessionProjection["lastEventId"];
    closeStream?: () => void;
    retryAttempt: number;
    retryTimer?: ReturnType<typeof setTimeout>;
}

type ResumableBinding = SessionBinding | ActivityBinding | TerminalListBinding;

/** Owns direct-Rig surface lifetimes without constructing a process-global instance. */
export class RigState implements Disposable, AsyncDisposable {
    private readonly transport: RigTransport;
    private readonly output: (event: RigStateOutput) => void;
    private readonly backgroundError: (error: RigStateError) => void;
    private readonly createId: () => string;
    private readonly pending = new Set<Promise<unknown>>();
    private readonly sessions = new Map<RigSessionId, SessionBinding>();
    private readonly activities = new Map<RigSessionId, ActivityBinding>();
    private readonly terminalLists = new Map<RigSessionId, TerminalListBinding>();
    private readonly terminals = new Set<RigTerminalStore>();
    private directoryBinding?: Surface<RigDirectorySnapshot>;
    private directoryStoreValue?: RigDirectoryStore;
    private directoryGeneration = 0;
    private disposed = false;

    constructor(options: RigStateOptions) {
        this.transport = options.transport;
        this.output = options.event ?? (() => undefined);
        this.backgroundError = options.backgroundError ?? (() => undefined);
        this.createId =
            options.createId ??
            (() => `rig_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`);
    }

    /** Materializes the grouped session catalog and its one global event subscription. */
    directory(): RigDirectoryStore {
        this.assertActive();
        if (this.directoryStoreValue) return this.directoryStoreValue;
        const binding = new Surface<RigDirectorySnapshot>({
            status: { type: "loading" },
            groups: [],
        });
        this.directoryBinding = binding;
        this.background(this.directoryReconcile());
        this.directoryStoreValue = this.directoryStore(binding);
        return this.directoryStoreValue;
    }

    /** Acquires one live session surface; disposal cancels its resumable stream. */
    sessionOpen(sessionId: RigSessionId): RigSessionHandle {
        this.assertActive();
        let binding = this.sessions.get(sessionId);
        if (!binding) {
            binding = {
                store: new Surface<RigSessionSnapshot>({
                    status: { type: "loading" },
                }),
                acquisitions: 0,
                generation: 0,
                retryAttempt: 0,
            };
            this.sessions.set(sessionId, binding);
        }
        binding.acquisitions += 1;
        if (binding.acquisitions === 1) this.sessionStart(sessionId, binding);
        const store = binding.store;
        let released = false;
        return {
            get: () => store.get(),
            subscribe: (listener) => store.subscribe(listener),
            messageSubmit: (input) =>
                this.sessionMutate(sessionId, binding!, () =>
                    this.transport
                        .messageSubmit(sessionId, input.text, this.createId())
                        .then(() => this.sessionReconcile(sessionId, binding!))
                        .then(() => this.output({ type: "sessionSubmitted", sessionId })),
                ),
            messageSteer: (input) =>
                this.sessionMutate(sessionId, binding!, () =>
                    this.transport
                        .messageSteer(sessionId, input.text, this.createId(), input.expectedRunId)
                        .then(() => this.sessionReconcile(sessionId, binding!))
                        .then(() => this.output({ type: "sessionSteered", sessionId })),
                ),
            runAbort: (expectedRunId) =>
                this.sessionMutate(sessionId, binding!, () =>
                    this.transport
                        .runAbort(sessionId, expectedRunId)
                        .then(() => this.sessionReconcile(sessionId, binding!)),
                ),
            userInputAnswer: (input) =>
                this.sessionMutate(sessionId, binding!, async () => {
                    await this.transport.userInputAnswer(sessionId, input);
                    await this.sessionReconcile(sessionId, binding!);
                }),
            modelChange: (input) =>
                this.sessionMutate(sessionId, binding!, async () => {
                    await this.transport.modelChange(sessionId, input);
                    await this.sessionReconcile(sessionId, binding!);
                }),
            effortChange: (effort) =>
                this.sessionMutate(sessionId, binding!, async () => {
                    await this.transport.effortChange(sessionId, effort);
                    await this.sessionReconcile(sessionId, binding!);
                }),
            serviceTierChange: (serviceTier) =>
                this.sessionMutate(sessionId, binding!, async () => {
                    await this.transport.serviceTierChange(sessionId, serviceTier);
                    await this.sessionReconcile(sessionId, binding!);
                }),
            permissionModeChange: (permissionMode) =>
                this.sessionMutate(sessionId, binding!, async () => {
                    await this.transport.permissionModeChange(sessionId, permissionMode);
                    await this.sessionReconcile(sessionId, binding!);
                }),
            [Symbol.dispose]: () => {
                if (released) return;
                released = true;
                this.sessionRelease(sessionId, binding!);
            },
        };
    }

    /** Acquires subagent and background-process activity for one session. */
    activityOpen(sessionId: RigSessionId): RigActivityHandle {
        this.assertActive();
        let binding = this.activities.get(sessionId);
        if (!binding) {
            binding = {
                store: new Surface<RigActivitySnapshot>({
                    status: { type: "loading" },
                    subagents: [],
                    backgroundProcesses: [],
                }),
                acquisitions: 0,
                generation: 0,
                retryAttempt: 0,
            };
            this.activities.set(sessionId, binding);
        }
        binding.acquisitions += 1;
        if (binding.acquisitions === 1) this.activityStart(sessionId, binding);
        const store = binding.store;
        let released = false;
        return {
            get: () => store.get(),
            subscribe: (listener) => store.subscribe(listener),
            [Symbol.dispose]: () => {
                if (released) return;
                released = true;
                this.activityRelease(sessionId, binding!);
            },
        };
    }

    /** Acquires the authoritative terminal list for one session. */
    terminalListOpen(sessionId: RigSessionId): RigTerminalListHandle {
        this.assertActive();
        let binding = this.terminalLists.get(sessionId);
        if (!binding) {
            binding = {
                store: new Surface<RigTerminalListSnapshot>({
                    status: { type: "loading" },
                    terminals: [],
                }),
                acquisitions: 0,
                generation: 0,
                retryAttempt: 0,
            };
            this.terminalLists.set(sessionId, binding);
        }
        binding.acquisitions += 1;
        if (binding.acquisitions === 1) this.terminalListStart(sessionId, binding);
        const store = binding.store;
        let released = false;
        return {
            get: () => store.get(),
            subscribe: (listener) => store.subscribe(listener),
            terminalCreate: (input) =>
                this.terminalListMutate(binding!, async () => {
                    const terminal = await this.transport.terminalCreate(sessionId, input);
                    await this.terminalListReconcile(sessionId, binding!);
                    this.output({ type: "terminalCreated", terminalId: terminal.id });
                }),
            terminalStop: (terminalId) =>
                this.terminalListMutate(binding!, async () => {
                    await this.transport.terminalStop(sessionId, terminalId);
                    await this.terminalListReconcile(sessionId, binding!);
                }),
            [Symbol.dispose]: () => {
                if (released) return;
                released = true;
                this.terminalListRelease(sessionId, binding!);
            },
        };
    }

    /** Opens one independently disposable terminal attachment. */
    terminalOpen(sessionId: RigSessionId, terminalId: RigTerminalId): RigTerminalStore {
        this.assertActive();
        const store = new Surface<RigTerminalSnapshot>({
            status: "connecting",
            exitCode: null,
        });
        let connection: RigTerminalConnection | undefined;
        let disposed = false;
        let stopRequested = false;
        let connectGeneration = 0;
        const connect = () => {
            const generation = ++connectGeneration;
            store.set({ ...store.get(), status: "connecting", error: undefined });
            this.background(
                this.transport
                    .terminalConnect(sessionId, terminalId, {
                        connected: () => {
                            if (!disposed && generation === connectGeneration)
                                store.set({
                                    ...store.get(),
                                    status: "connected",
                                    error: undefined,
                                });
                        },
                        grid: (grid) => {
                            if (!disposed && generation === connectGeneration)
                                store.set({ ...store.get(), grid });
                        },
                        exit: (exitCode) => {
                            if (!disposed && generation === connectGeneration)
                                store.set({ ...store.get(), status: "exited", exitCode });
                        },
                        error: (error) => {
                            if (!disposed && generation === connectGeneration)
                                store.set({
                                    ...store.get(),
                                    status: "disconnected",
                                    error: stateError(error),
                                });
                        },
                    })
                    .then((value) => {
                        if (disposed || stopRequested || generation !== connectGeneration)
                            value.close();
                        else connection = value;
                    })
                    .catch((error: unknown) => {
                        if (!disposed && !stopRequested && generation === connectGeneration)
                            store.set({
                                ...store.get(),
                                status: "error",
                                error: stateError(error),
                            });
                        throw error;
                    }),
            );
        };
        const terminal: RigTerminalStore = {
            get: () => store.get(),
            subscribe: (listener) => store.subscribe(listener),
            terminalWrite: (data) => {
                if (!disposed && data) connection?.write(data);
            },
            terminalResize: (cols, rows) => {
                if (!disposed) connection?.resize(cols, rows);
            },
            terminalScrollback: (start, count, basis) => {
                if (disposed) return Promise.reject(new Error("The Rig terminal is disposed."));
                if (!connection)
                    return Promise.reject(new Error("The Rig terminal is still connecting."));
                return connection.scrollback(start, count, basis);
            },
            terminalReconnect: () => {
                if (disposed || stopRequested || store.get().status === "connected") return;
                connection?.close();
                connection = undefined;
                connect();
            },
            terminalStop: () => {
                if (!disposed && !stopRequested) {
                    stopRequested = true;
                    connectGeneration += 1;
                    connection?.close();
                    connection = undefined;
                    this.background(
                        this.transport.terminalStop(sessionId, terminalId).then((value) =>
                            store.set({
                                ...store.get(),
                                status: "exited",
                                exitCode: value.exitCode,
                            }),
                        ),
                    );
                }
            },
            [Symbol.dispose]: () => {
                if (disposed) return;
                disposed = true;
                connectGeneration += 1;
                connection?.close();
                connection = undefined;
                this.terminals.delete(terminal);
            },
        };
        this.terminals.add(terminal);
        connect();
        return terminal;
    }

    async whenIdle(): Promise<void> {
        while (this.pending.size) await Promise.allSettled(this.pending);
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const binding of this.sessions.values()) {
            this.streamRetryCancel(binding);
            binding.closeStream?.();
        }
        for (const binding of this.activities.values()) {
            this.streamRetryCancel(binding);
            binding.closeStream?.();
        }
        for (const binding of this.terminalLists.values()) {
            this.streamRetryCancel(binding);
            binding.closeStream?.();
        }
        for (const terminal of this.terminals) terminal[Symbol.dispose]();
        this.sessions.clear();
        this.activities.clear();
        this.terminalLists.clear();
    }

    async [Symbol.asyncDispose](): Promise<void> {
        this[Symbol.dispose]();
        await this.whenIdle();
    }

    private directoryStore(binding: Surface<RigDirectorySnapshot>): RigDirectoryStore {
        return {
            get: () => binding.get(),
            subscribe: (listener) => binding.subscribe(listener),
            sessionCreate: (input) =>
                this.directoryMutate(async () => {
                    const session = await this.transport.sessionCreate(input);
                    await this.directoryReconcile();
                    this.output({ type: "sessionCreated", sessionId: session.id });
                }),
            sessionFork: (sessionId) =>
                this.directoryMutate(async () => {
                    const session = await this.transport.sessionFork(sessionId);
                    await this.directoryReconcile();
                    this.output({ type: "sessionForked", sessionId: session.id });
                }),
            sessionReset: (sessionId) =>
                this.directoryMutate(async () => {
                    const session = await this.transport.sessionReset(sessionId);
                    const open = this.sessions.get(sessionId);
                    if (open) this.sessionApply(open, session);
                    await this.directoryReconcile();
                }),
        };
    }

    private async directoryReconcile(): Promise<void> {
        const binding = this.directoryBinding;
        if (!binding || this.disposed) return;
        const generation = ++this.directoryGeneration;
        try {
            const sessions = await this.transport.sessionsRead();
            if (this.disposed || generation !== this.directoryGeneration) return;
            binding.set({
                status: { type: "ready" },
                groups: directoryGroupsProject(binding.get().groups, sessions),
            });
        } catch (error) {
            if (this.disposed || generation !== this.directoryGeneration) return;
            binding.set({ ...binding.get(), status: { type: "error", error: stateError(error) } });
            throw error;
        }
    }

    private streamStart(
        binding: ResumableBinding,
        active: () => boolean,
        reconcile: () => Promise<void>,
        streamOpen: () => void,
    ): void {
        if (!active()) return;
        this.streamRetryCancel(binding);
        this.background(
            reconcile()
                .then(() => {
                    if (!active()) return;
                    binding.retryAttempt = 0;
                    streamOpen();
                })
                .catch((error: unknown) => {
                    if (active())
                        this.streamRetrySchedule(binding, active, () =>
                            this.streamStart(binding, active, reconcile, streamOpen),
                        );
                    throw error;
                }),
        );
    }

    private streamRetrySchedule(
        binding: ResumableBinding,
        active: () => boolean,
        retry: () => void,
    ): void {
        this.streamRetryCancel(binding);
        const delay = Math.min(5_000, 250 * 2 ** Math.min(binding.retryAttempt, 5));
        binding.retryAttempt += 1;
        binding.retryTimer = setTimeout(() => {
            binding.retryTimer = undefined;
            if (active()) retry();
        }, delay);
    }

    private streamRetryCancel(binding: ResumableBinding): void {
        if (binding.retryTimer) clearTimeout(binding.retryTimer);
        binding.retryTimer = undefined;
    }

    private sessionStart(sessionId: RigSessionId, binding: SessionBinding): void {
        this.streamStart(
            binding,
            () =>
                !this.disposed &&
                binding.acquisitions > 0 &&
                this.sessions.get(sessionId) === binding,
            () => this.sessionReconcile(sessionId, binding),
            () => this.sessionStreamOpen(sessionId, binding),
        );
    }

    private async sessionReconcile(
        sessionId: RigSessionId,
        binding: SessionBinding,
    ): Promise<void> {
        const generation = ++binding.generation;
        try {
            const session = await this.transport.sessionRead(sessionId);
            if (this.disposed || binding.acquisitions === 0 || generation !== binding.generation)
                return;
            this.sessionApply(binding, session);
        } catch (error) {
            if (this.disposed || binding.acquisitions === 0 || generation !== binding.generation)
                return;
            binding.store.set({
                ...binding.store.get(),
                status: { type: "error", error: stateError(error) },
            });
            throw error;
        }
    }

    private sessionApply(binding: SessionBinding, value: RigSessionProjection): void {
        const session = sessionReferencesPreserve(binding.references, value);
        binding.references = session;
        binding.cursor = session.lastEventId ?? binding.cursor;
        const current = binding.store.get();
        binding.store.set({
            status: { type: "ready" },
            session,
            ...(current.streaming && session.status === "running"
                ? { streaming: current.streaming }
                : {}),
        });
    }

    private sessionStreamOpen(sessionId: RigSessionId, binding: SessionBinding): void {
        binding.closeStream?.();
        if (this.disposed || binding.acquisitions === 0 || this.sessions.get(sessionId) !== binding)
            return;
        binding.closeStream = this.transport.sessionEventsSubscribe(
            sessionId,
            {
                event: (event) => this.sessionEvent(sessionId, binding, event),
                error: (error) => {
                    binding.closeStream = undefined;
                    this.backgroundError(stateError(error));
                    this.sessionStart(sessionId, binding);
                },
                end: () => {
                    binding.closeStream = undefined;
                    this.sessionStart(sessionId, binding);
                },
            },
            binding.cursor,
        );
    }

    private sessionEvent(
        sessionId: RigSessionId,
        binding: SessionBinding,
        event: RigSessionEvent,
    ): void {
        if (this.disposed || binding.acquisitions === 0 || this.sessions.get(sessionId) !== binding)
            return;
        binding.cursor = event.eventId;
        if (event.kind === "streamingMessageChanged")
            binding.store.set({ ...binding.store.get(), streaming: event.message });
        this.background(this.sessionReconcile(sessionId, binding));
    }

    private sessionRelease(sessionId: RigSessionId, binding: SessionBinding): void {
        binding.acquisitions -= 1;
        if (binding.acquisitions > 0) return;
        binding.generation += 1;
        this.streamRetryCancel(binding);
        binding.closeStream?.();
        binding.closeStream = undefined;
        this.sessions.delete(sessionId);
    }

    private activityStart(sessionId: RigSessionId, binding: ActivityBinding): void {
        this.streamStart(
            binding,
            () =>
                !this.disposed &&
                binding.acquisitions > 0 &&
                this.activities.get(sessionId) === binding,
            () => this.activityReconcile(sessionId, binding),
            () => this.activityStreamOpen(sessionId, binding),
        );
    }

    private async activityReconcile(
        sessionId: RigSessionId,
        binding: ActivityBinding,
    ): Promise<void> {
        const generation = ++binding.generation;
        try {
            const [session, subagents] = await Promise.all([
                this.transport.sessionRead(sessionId),
                this.transport.subagentsRead(sessionId),
            ]);
            if (this.disposed || binding.acquisitions === 0 || generation !== binding.generation)
                return;
            binding.cursor = session.lastEventId ?? binding.cursor;
            binding.store.set({
                status: { type: "ready" },
                subagents: referencesPreserve(binding.store.get().subagents, subagents, "id"),
                backgroundProcesses: referencesPreserve(
                    binding.store.get().backgroundProcesses,
                    session.backgroundProcesses,
                    "id",
                ),
            });
        } catch (error) {
            if (!this.disposed && binding.acquisitions > 0 && generation === binding.generation)
                binding.store.set({
                    ...binding.store.get(),
                    status: { type: "error", error: stateError(error) },
                });
            throw error;
        }
    }

    private activityStreamOpen(sessionId: RigSessionId, binding: ActivityBinding): void {
        binding.closeStream?.();
        if (
            this.disposed ||
            binding.acquisitions === 0 ||
            this.activities.get(sessionId) !== binding
        )
            return;
        binding.closeStream = this.transport.sessionEventsSubscribe(
            sessionId,
            {
                event: (event) => {
                    binding.cursor = event.eventId;
                    this.background(this.activityReconcile(sessionId, binding));
                },
                error: (error) => {
                    binding.closeStream = undefined;
                    this.backgroundError(stateError(error));
                    this.activityStart(sessionId, binding);
                },
                end: () => {
                    binding.closeStream = undefined;
                    this.activityStart(sessionId, binding);
                },
            },
            binding.cursor,
        );
    }

    private activityRelease(sessionId: RigSessionId, binding: ActivityBinding): void {
        binding.acquisitions -= 1;
        if (binding.acquisitions > 0) return;
        binding.generation += 1;
        this.streamRetryCancel(binding);
        binding.closeStream?.();
        binding.closeStream = undefined;
        this.activities.delete(sessionId);
    }

    private terminalListStart(sessionId: RigSessionId, binding: TerminalListBinding): void {
        this.streamStart(
            binding,
            () =>
                !this.disposed &&
                binding.acquisitions > 0 &&
                this.terminalLists.get(sessionId) === binding,
            () => this.terminalListReconcile(sessionId, binding),
            () => this.terminalListStreamOpen(sessionId, binding),
        );
    }

    private async terminalListReconcile(
        sessionId: RigSessionId,
        binding: TerminalListBinding,
    ): Promise<void> {
        const generation = ++binding.generation;
        try {
            const [session, terminals] = await Promise.all([
                this.transport.sessionRead(sessionId),
                this.transport.terminalsRead(sessionId),
            ]);
            if (this.disposed || binding.acquisitions === 0 || generation !== binding.generation)
                return;
            binding.cursor = session.lastEventId ?? binding.cursor;
            binding.store.set({
                status: { type: "ready" },
                terminals: referencesPreserve(binding.store.get().terminals, terminals, "id"),
            });
        } catch (error) {
            if (!this.disposed && binding.acquisitions > 0 && generation === binding.generation)
                binding.store.set({
                    ...binding.store.get(),
                    status: { type: "error", error: stateError(error) },
                });
            throw error;
        }
    }

    private terminalListStreamOpen(sessionId: RigSessionId, binding: TerminalListBinding): void {
        binding.closeStream?.();
        if (
            this.disposed ||
            binding.acquisitions === 0 ||
            this.terminalLists.get(sessionId) !== binding
        )
            return;
        binding.closeStream = this.transport.sessionEventsSubscribe(
            sessionId,
            {
                event: (event) => {
                    binding.cursor = event.eventId;
                    this.background(this.terminalListReconcile(sessionId, binding));
                },
                error: (error) => {
                    binding.closeStream = undefined;
                    this.backgroundError(stateError(error));
                    this.terminalListStart(sessionId, binding);
                },
                end: () => {
                    binding.closeStream = undefined;
                    this.terminalListStart(sessionId, binding);
                },
            },
            binding.cursor,
        );
    }

    private terminalListRelease(sessionId: RigSessionId, binding: TerminalListBinding): void {
        binding.acquisitions -= 1;
        if (binding.acquisitions > 0) return;
        binding.generation += 1;
        this.streamRetryCancel(binding);
        binding.closeStream?.();
        binding.closeStream = undefined;
        this.terminalLists.delete(sessionId);
    }

    private directoryMutate(operation: () => Promise<void>): void {
        const binding = this.directoryBinding;
        if (!binding) return;
        binding.set({ ...binding.get(), mutationError: undefined });
        this.background(
            operation().catch((error: unknown) => {
                const failure = stateError(error);
                binding.set({ ...binding.get(), mutationError: failure });
                throw error;
            }),
        );
    }

    private sessionMutate(
        _sessionId: RigSessionId,
        binding: SessionBinding,
        operation: () => Promise<void>,
    ): void {
        binding.store.set({ ...binding.store.get(), mutationError: undefined });
        this.background(
            operation().catch((error: unknown) => {
                binding.store.set({
                    ...binding.store.get(),
                    mutationError: stateError(error),
                });
                throw error;
            }),
        );
    }

    private terminalListMutate(binding: TerminalListBinding, operation: () => Promise<void>): void {
        binding.store.set({ ...binding.store.get(), mutationError: undefined });
        this.background(
            operation().catch((error: unknown) => {
                binding.store.set({
                    ...binding.store.get(),
                    mutationError: stateError(error),
                });
                throw error;
            }),
        );
    }

    private background<T>(operation: Promise<T>): void {
        const tracked = operation.catch((error: unknown) => {
            if (!this.disposed) this.backgroundError(stateError(error));
        });
        this.pending.add(tracked);
        void tracked.finally(() => this.pending.delete(tracked));
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("RigState is disposed.");
    }
}

export function rigStateCreate(options: RigStateOptions): RigState {
    return new RigState(options);
}

function directoryGroupsProject(
    previous: readonly RigDirectoryGroupProjection[],
    sessions: readonly RigSessionSummaryProjection[],
): readonly RigDirectoryGroupProjection[] {
    const previousSessions = new Map(
        previous.flatMap((group) =>
            group.sessions.map((session) => [session.id, session] as const),
        ),
    );
    const byDirectory = new Map<string, RigSessionSummaryProjection[]>();
    for (const candidate of sessions) {
        const prior = previousSessions.get(candidate.id);
        const session = prior && shallowEqual(prior, candidate) ? prior : candidate;
        const directory = byDirectory.get(session.cwd);
        if (directory) directory.push(session);
        else byDirectory.set(session.cwd, [session]);
    }
    const previousGroups = new Map(previous.map((group) => [group.id, group]));
    const groups: RigDirectoryGroupProjection[] = [];
    for (const [cwd, values] of byDirectory) {
        values.sort(sessionCompare);
        const latestActivityAt = Math.max(...values.map(sessionActivityAt));
        const displayPath = values[0]?.displayCwd ?? cwd;
        const prior = previousGroups.get(cwd);
        if (
            prior &&
            prior.displayPath === displayPath &&
            prior.latestActivityAt === latestActivityAt &&
            arrayReferencesEqual(prior.sessions, values)
        )
            groups.push(prior);
        else
            groups.push({
                id: cwd,
                displayPath,
                sessions: values,
                latestActivityAt,
            });
    }
    groups.sort(
        (left, right) =>
            right.latestActivityAt - left.latestActivityAt ||
            normalizedPath(left.id).localeCompare(normalizedPath(right.id)) ||
            left.id.localeCompare(right.id),
    );
    return arrayReferencesEqual(previous, groups) ? previous : groups;
}

function sessionCompare(
    left: RigSessionSummaryProjection,
    right: RigSessionSummaryProjection,
): number {
    return sessionActivityAt(right) - sessionActivityAt(left) || left.id.localeCompare(right.id);
}

function sessionActivityAt(value: RigSessionSummaryProjection): number {
    return value.lastMessageAt ?? value.updatedAt;
}

function normalizedPath(value: string): string {
    return value.normalize("NFC").toLocaleLowerCase();
}

function sessionReferencesPreserve(
    previous: RigSessionProjection | undefined,
    next: RigSessionProjection,
): RigSessionProjection {
    if (!previous) return next;
    const messages = referencesPreserve(previous.messages, next.messages, "id");
    const pendingUserInputs = referencesPreserve(
        previous.pendingUserInputs,
        next.pendingUserInputs,
        "requestId",
    );
    const backgroundProcesses = referencesPreserve(
        previous.backgroundProcesses,
        next.backgroundProcesses,
        "id",
    );
    const models = referencesPreserve(previous.models, next.models, "id");
    const candidate = { ...next, messages, pendingUserInputs, backgroundProcesses, models };
    return shallowEqual(previous, candidate) ? previous : candidate;
}

function referencesPreserve<
    Value extends Readonly<Record<Key, PropertyKey>>,
    Key extends keyof Value,
>(previous: readonly Value[], next: readonly Value[], key: Key): readonly Value[] {
    const byId = new Map(previous.map((value) => [value[key], value]));
    const values = next.map((value) => {
        const prior = byId.get(value[key]);
        return prior && deepEqual(prior, value) ? prior : value;
    });
    return arrayReferencesEqual(previous, values) ? previous : values;
}

function arrayReferencesEqual(left: readonly unknown[], right: readonly unknown[]): boolean {
    return left.length === right.length && left.every((value, index) => value === right[index]);
}

function shallowEqual(left: object, right: object): boolean {
    const leftEntries = Object.entries(left);
    const rightEntries = Object.entries(right);
    return (
        leftEntries.length === rightEntries.length &&
        leftEntries.every(([key, value]) => value === (right as Record<string, unknown>)[key])
    );
}

function deepEqual(left: unknown, right: unknown): boolean {
    if (left === right) return true;
    if (
        !left ||
        !right ||
        typeof left !== "object" ||
        typeof right !== "object" ||
        Array.isArray(left) !== Array.isArray(right)
    )
        return false;
    if (Array.isArray(left) && Array.isArray(right))
        return (
            left.length === right.length &&
            left.every((value, index) => deepEqual(value, right[index]))
        );
    const leftRecord = left as Record<string, unknown>;
    const rightRecord = right as Record<string, unknown>;
    const keys = Object.keys(leftRecord);
    return (
        keys.length === Object.keys(rightRecord).length &&
        keys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
    );
}

function stateError(error: unknown): RigStateError {
    return { message: error instanceof Error ? error.message : String(error) };
}
