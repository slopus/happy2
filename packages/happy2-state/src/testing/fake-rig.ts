import type {
    RigCatalogProjection,
    RigDaemonHealth,
    RigModelSelection,
    RigSessionCreateInput,
    RigSessionId,
    RigSessionProjection,
    RigSessionSummaryProjection,
    RigSubagentProjection,
    RigTerminalCreateInput,
    RigTerminalGridProjection,
    RigTerminalId,
    RigTerminalScrollbackProjection,
    RigTerminalSummaryProjection,
} from "../rig/rigTypes.js";
import type {
    RigEventObserver,
    RigGlobalEvent,
    RigSessionEvent,
    RigTerminalConnection,
    RigTerminalObserver,
    RigTransport,
} from "../rig/rigTransport.js";

export type FakeRigOperation =
    | "healthRead"
    | "catalogRead"
    | "sessionsRead"
    | "sessionRead"
    | "subagentsRead"
    | "terminalsRead"
    | "sessionCreate"
    | "sessionFork"
    | "sessionReset"
    | "messageSubmit"
    | "messageSteer"
    | "runAbort"
    | "userInputAnswer"
    | "modelChange"
    | "effortChange"
    | "serviceTierChange"
    | "permissionModeChange"
    | "terminalCreate"
    | "terminalStop"
    | "terminalConnect"
    | "sessionEventsSubscribe";

export interface FakeRigCall {
    readonly operation: FakeRigOperation;
    readonly after?: string;
    readonly sessionId?: RigSessionId;
    readonly terminalId?: RigTerminalId;
}

export interface FakeRigTerminalController {
    readonly sessionId: RigSessionId;
    readonly terminalId: RigTerminalId;
    readonly writes: readonly string[];
    readonly sizes: readonly { readonly cols: number; readonly rows: number }[];
    readonly closed: boolean;
    connected(): void;
    grid(value: RigTerminalGridProjection): void;
    exit(exitCode: number | null): void;
    error(error: unknown): void;
}

export interface FakeRigTransport {
    readonly transport: RigTransport;
    readonly calls: readonly FakeRigCall[];
    readonly globalSubscriberCount: number;
    readonly sessionSubscriberCount: number;
    sessionSet(session: RigSessionProjection): void;
    sessionRemove(sessionId: RigSessionId): void;
    subagentsSet(sessionId: RigSessionId, subagents: readonly RigSubagentProjection[]): void;
    terminalsSet(sessionId: RigSessionId, terminals: readonly RigTerminalSummaryProjection[]): void;
    deferNext(operation: FakeRigOperation): { release(): void };
    failNext(operation: FakeRigOperation, error?: unknown): void;
    globalEmit(event: RigGlobalEvent): void;
    globalEnd(): void;
    globalFail(error?: unknown): void;
    sessionEmit(event: RigSessionEvent): void;
    sessionEnd(sessionId: RigSessionId): void;
    sessionFail(sessionId: RigSessionId, error?: unknown): void;
    terminalRoute(handler: (controller: FakeRigTerminalController) => void): void;
    close(): void;
}

const catalog: RigCatalogProjection = {
    defaultModelId: "gpt-default",
    defaultProviderId: "openai",
    providers: [
        {
            id: "openai",
            models: [
                {
                    id: "gpt-default",
                    name: "GPT Default",
                    thinkingLevels: ["medium", "high"],
                    defaultThinkingLevel: "medium",
                },
            ],
            serviceTiers: ["fast"],
        },
    ],
};

/** Creates a programmable, resource-counted direct-Rig boundary for deterministic state tests. */
export function createFakeRigTransport(): FakeRigTransport {
    return new FakeRigTransportModel();
}

export function fakeRigSession(
    id: string,
    overrides: Partial<RigSessionProjection> = {},
): RigSessionProjection {
    return {
        id: id as RigSessionId,
        cwd: "/workspace",
        displayCwd: "/workspace",
        providerId: "openai",
        modelId: "gpt-default",
        models: catalog.providers[0]!.models,
        permissionMode: "auto",
        status: "idle",
        modelLocked: false,
        messages: [],
        pendingUserInputs: [],
        backgroundProcesses: [],
        ...overrides,
    };
}

class FakeRigTransportModel implements FakeRigTransport {
    private readonly sessions = new Map<RigSessionId, RigSessionProjection>();
    private readonly subagents = new Map<RigSessionId, readonly RigSubagentProjection[]>();
    private readonly terminals = new Map<RigSessionId, readonly RigTerminalSummaryProjection[]>();
    private readonly failures = new Map<FakeRigOperation, unknown[]>();
    private readonly deferrals = new Map<FakeRigOperation, Promise<void>[]>();
    private readonly globalObservers = new Set<RigEventObserver<RigGlobalEvent>>();
    private readonly sessionObservers = new Map<
        RigSessionId,
        Set<RigEventObserver<RigSessionEvent>>
    >();
    private terminalHandler?: (controller: FakeRigTerminalController) => void;
    private recorded: FakeRigCall[] = [];
    private closed = false;
    private nextSession = 1;
    private nextTerminal = 1;

    readonly transport: RigTransport = {
        healthRead: async () =>
            this.perform(
                "healthRead",
                {},
                async (): Promise<RigDaemonHealth> => ({
                    status: "ready",
                    version: "0.0.45",
                    catalog,
                }),
            ),
        catalogRead: async () =>
            this.perform("catalogRead", {}, async () => structuredClone(catalog)),
        sessionsRead: async () =>
            this.perform("sessionsRead", {}, async () =>
                [...this.sessions.values()].map(sessionSummary),
            ),
        sessionRead: async (sessionId) =>
            this.perform("sessionRead", { sessionId }, async () =>
                structuredClone(this.sessionRequired(sessionId)),
            ),
        subagentsRead: async (sessionId) =>
            this.perform("subagentsRead", { sessionId }, async () =>
                structuredClone(this.subagents.get(sessionId) ?? []),
            ),
        terminalsRead: async (sessionId) =>
            this.perform("terminalsRead", { sessionId }, async () =>
                structuredClone(this.terminals.get(sessionId) ?? []),
            ),
        sessionCreate: async (input) =>
            this.perform("sessionCreate", {}, async () => this.createSession(input)),
        sessionFork: async (sessionId) =>
            this.perform("sessionFork", { sessionId }, async () => {
                const id = `${sessionId}-fork-${this.nextSession++}` as RigSessionId;
                const session = { ...structuredClone(this.sessionRequired(sessionId)), id };
                this.sessions.set(id, session);
                return structuredClone(session);
            }),
        sessionReset: async (sessionId) =>
            this.perform("sessionReset", { sessionId }, async () =>
                this.updateSession(sessionId, {
                    status: "idle",
                    messages: [],
                    pendingUserInputs: [],
                }),
            ),
        messageSubmit: async (sessionId) =>
            this.perform("messageSubmit", { sessionId }, async () => {
                this.updateSession(sessionId, { status: "running" });
            }),
        messageSteer: async (sessionId) =>
            this.perform("messageSteer", { sessionId }, async () => {
                this.sessionRequired(sessionId);
            }),
        runAbort: async (sessionId) =>
            this.perform("runAbort", { sessionId }, async () => {
                this.updateSession(sessionId, { status: "aborted" });
            }),
        userInputAnswer: async (sessionId, input) =>
            this.perform("userInputAnswer", { sessionId }, async () =>
                this.updateSession(sessionId, {
                    pendingUserInputs: this.sessionRequired(sessionId).pendingUserInputs.filter(
                        ({ requestId }) => requestId !== input.requestId,
                    ),
                }),
            ),
        modelChange: async (sessionId, input) =>
            this.perform("modelChange", { sessionId }, async () =>
                this.updateSession(sessionId, modelUpdate(input)),
            ),
        effortChange: async (sessionId, effort) =>
            this.perform("effortChange", { sessionId }, async () =>
                this.updateSession(sessionId, { effort }),
            ),
        serviceTierChange: async (sessionId, serviceTier) =>
            this.perform("serviceTierChange", { sessionId }, async () =>
                this.updateSession(sessionId, { serviceTier }),
            ),
        permissionModeChange: async (sessionId, permissionMode) =>
            this.perform("permissionModeChange", { sessionId }, async () =>
                this.updateSession(sessionId, { permissionMode }),
            ),
        terminalCreate: async (sessionId, input) =>
            this.perform("terminalCreate", { sessionId }, async () =>
                this.createTerminal(sessionId, input),
            ),
        terminalStop: async (sessionId, terminalId) =>
            this.perform("terminalStop", { sessionId, terminalId }, async () =>
                this.stopTerminal(sessionId, terminalId),
            ),
        terminalConnect: async (sessionId, terminalId, observer) =>
            this.perform("terminalConnect", { sessionId, terminalId }, async () =>
                this.terminalConnection(sessionId, terminalId, observer),
            ),
        globalEventsSubscribe: (observer) => {
            this.assertOpen();
            this.globalObservers.add(observer);
            return () => this.globalObservers.delete(observer);
        },
        sessionEventsSubscribe: (sessionId, observer, after) => {
            this.assertOpen();
            this.recorded.push({
                operation: "sessionEventsSubscribe",
                sessionId,
                ...(after ? { after } : {}),
            });
            let observers = this.sessionObservers.get(sessionId);
            if (!observers) {
                observers = new Set();
                this.sessionObservers.set(sessionId, observers);
            }
            observers.add(observer);
            return () => {
                observers!.delete(observer);
                if (observers!.size === 0) this.sessionObservers.delete(sessionId);
            };
        },
    };

    get calls(): readonly FakeRigCall[] {
        return this.recorded;
    }

    get globalSubscriberCount(): number {
        return this.globalObservers.size;
    }

    get sessionSubscriberCount(): number {
        return [...this.sessionObservers.values()].reduce(
            (total, observers) => total + observers.size,
            0,
        );
    }

    sessionSet(session: RigSessionProjection): void {
        this.sessions.set(session.id, structuredClone(session));
    }

    sessionRemove(sessionId: RigSessionId): void {
        this.sessions.delete(sessionId);
    }

    subagentsSet(sessionId: RigSessionId, values: readonly RigSubagentProjection[]): void {
        this.subagents.set(sessionId, structuredClone(values));
    }

    terminalsSet(sessionId: RigSessionId, values: readonly RigTerminalSummaryProjection[]): void {
        this.terminals.set(sessionId, structuredClone(values));
    }

    failNext(
        operation: FakeRigOperation,
        error: unknown = new Error(`Fake ${operation} failed.`),
    ): void {
        const failures = this.failures.get(operation);
        if (failures) failures.push(error);
        else this.failures.set(operation, [error]);
    }

    deferNext(operation: FakeRigOperation): { release(): void } {
        let release: () => void = () => undefined;
        const deferred = new Promise<void>((resolve) => {
            release = resolve;
        });
        const deferrals = this.deferrals.get(operation);
        if (deferrals) deferrals.push(deferred);
        else this.deferrals.set(operation, [deferred]);
        return { release };
    }

    globalEmit(event: RigGlobalEvent): void {
        for (const observer of this.globalObservers) observer.event(structuredClone(event));
    }

    globalEnd(): void {
        const observers = [...this.globalObservers];
        this.globalObservers.clear();
        for (const observer of observers) observer.end();
    }

    globalFail(error: unknown = new Error("Fake global stream failed.")): void {
        const observers = [...this.globalObservers];
        this.globalObservers.clear();
        for (const observer of observers) observer.error(error);
    }

    sessionEmit(event: RigSessionEvent): void {
        for (const observer of this.sessionObservers.get(event.sessionId) ?? [])
            observer.event(structuredClone(event));
    }

    sessionEnd(sessionId: RigSessionId): void {
        const observers = [...(this.sessionObservers.get(sessionId) ?? [])];
        this.sessionObservers.delete(sessionId);
        for (const observer of observers) observer.end();
    }

    sessionFail(
        sessionId: RigSessionId,
        error: unknown = new Error("Fake session stream failed."),
    ): void {
        const observers = [...(this.sessionObservers.get(sessionId) ?? [])];
        this.sessionObservers.delete(sessionId);
        for (const observer of observers) observer.error(error);
    }

    terminalRoute(handler: (controller: FakeRigTerminalController) => void): void {
        this.terminalHandler = handler;
    }

    close(): void {
        if (this.closed) return;
        this.globalFail(new Error("Fake Rig transport closed."));
        for (const id of this.sessionObservers.keys()) this.sessionFail(id);
        this.closed = true;
    }

    private async perform<T>(
        operation: FakeRigOperation,
        target: Omit<FakeRigCall, "operation">,
        work: () => Promise<T>,
    ): Promise<T> {
        this.assertOpen();
        this.recorded.push({ operation, ...target });
        const failures = this.failures.get(operation);
        const failure = failures?.shift();
        if (failures?.length === 0) this.failures.delete(operation);
        if (failure !== undefined) throw failure;
        const result = await work();
        const deferrals = this.deferrals.get(operation);
        const deferred = deferrals?.shift();
        if (deferrals?.length === 0) this.deferrals.delete(operation);
        await deferred;
        return result;
    }

    private createSession(input: RigSessionCreateInput): RigSessionProjection {
        const id = `session-${this.nextSession++}` as RigSessionId;
        const session = fakeRigSession(id, {
            cwd: input.cwd,
            displayCwd: input.cwd,
            providerId: input.providerId ?? catalog.defaultProviderId,
            modelId: input.modelId ?? catalog.defaultModelId,
            effort: input.effort,
            serviceTier: input.serviceTier,
            permissionMode: input.permissionMode ?? "auto",
        });
        this.sessions.set(id, session);
        return structuredClone(session);
    }

    private createTerminal(
        sessionId: RigSessionId,
        input: RigTerminalCreateInput,
    ): RigTerminalSummaryProjection {
        const terminal: RigTerminalSummaryProjection = {
            id: `terminal-${this.nextTerminal++}` as RigTerminalId,
            cols: input.cols,
            rows: input.rows,
            epoch: "epoch-1",
            status: "running",
            exitCode: null,
        };
        this.terminals.set(sessionId, [...(this.terminals.get(sessionId) ?? []), terminal]);
        return terminal;
    }

    private stopTerminal(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
    ): RigTerminalSummaryProjection {
        const current = this.terminals.get(sessionId) ?? [];
        const terminal = current.find(({ id }) => id === terminalId);
        if (!terminal) throw new Error(`Unknown fake terminal ${terminalId}.`);
        const stopped = { ...terminal, status: "exited" as const, exitCode: 0 };
        this.terminals.set(
            sessionId,
            current.map((value) => (value.id === terminalId ? stopped : value)),
        );
        return stopped;
    }

    private terminalConnection(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
        observer: RigTerminalObserver,
    ): RigTerminalConnection {
        const writes: string[] = [];
        const sizes: { cols: number; rows: number }[] = [];
        let closed = false;
        const controller: FakeRigTerminalController = {
            sessionId,
            terminalId,
            writes,
            sizes,
            get closed() {
                return closed;
            },
            connected: () => !closed && observer.connected(),
            grid: (value) => !closed && observer.grid(structuredClone(value)),
            exit: (exitCode) => !closed && observer.exit(exitCode),
            error: (error) => !closed && observer.error(error),
        };
        this.terminalHandler?.(controller);
        return {
            write: (data) => {
                if (!closed) writes.push(data);
            },
            resize: (cols, rows) => {
                if (!closed) sizes.push({ cols, rows });
            },
            scrollback: async (start, count): Promise<RigTerminalScrollbackProjection> => ({
                baseRow: 0,
                count,
                historyEpoch: "epoch-1",
                historyRevision: 1,
                rows: [],
                start,
                totalRows: 0,
            }),
            close: () => {
                closed = true;
            },
        };
    }

    private sessionRequired(sessionId: RigSessionId): RigSessionProjection {
        const session = this.sessions.get(sessionId);
        if (!session) throw new Error(`Unknown fake session ${sessionId}.`);
        return session;
    }

    private updateSession(
        sessionId: RigSessionId,
        update: Partial<RigSessionProjection>,
    ): RigSessionProjection {
        const session = { ...this.sessionRequired(sessionId), ...update };
        this.sessions.set(sessionId, session);
        return structuredClone(session);
    }

    private assertOpen(): void {
        if (this.closed) throw new Error("Fake Rig transport is closed.");
    }
}

function modelUpdate(input: RigModelSelection): Partial<RigSessionProjection> {
    return {
        modelId: input.modelId,
        providerId: input.providerId,
        effort: input.effort,
    };
}

function sessionSummary(session: RigSessionProjection): RigSessionSummaryProjection {
    return {
        id: session.id,
        cwd: session.cwd,
        displayCwd: session.displayCwd,
        providerId: session.providerId,
        modelId: session.modelId,
        permissionMode: session.permissionMode,
        effort: session.effort,
        serviceTier: session.serviceTier,
        status: session.status,
        title: session.title,
        recap: session.recap,
        createdAt: 1,
        updatedAt: 1,
    };
}
