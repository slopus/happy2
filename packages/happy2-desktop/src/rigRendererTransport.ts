import type {
    RigCatalogProjection,
    RigDaemonHealth,
    RigEventId,
    RigEventObserver,
    RigGlobalEvent,
    RigModelSelection,
    RigPermissionMode,
    RigServiceTier,
    RigSessionCreateInput,
    RigSessionEvent,
    RigSessionId,
    RigSessionProjection,
    RigSessionSummaryProjection,
    RigSubagentProjection,
    RigDirectTerminalConnection,
    RigTerminalCreateInput,
    RigTerminalId,
    RigTerminalObserver,
    RigTerminalSummaryProjection,
    RigTransport,
    RigUserInputAnswers,
} from "happy2-state";
import type {
    HappyDesktopBridge,
    RigClientRequest,
    RigStreamEvent,
    RigStreamOpenRequest,
} from "./shared/desktopContract";

interface StreamLease {
    closed: boolean;
    id?: string;
    receive(event: RigStreamEvent): void;
}

/** Serialization-only renderer transport over the context-isolated desktop bridge. */
export class RigRendererTransport implements RigTransport, Disposable {
    private readonly buffered = new Map<string, RigStreamEvent[]>();
    private readonly leases = new Set<StreamLease>();
    private readonly streams = new Map<string, StreamLease>();
    private readonly unsubscribe: () => void;
    private disposed = false;

    constructor(private readonly bridge: HappyDesktopBridge) {
        this.unsubscribe = bridge.rigSubscribe((event) => this.receive(event));
    }

    healthRead(): Promise<RigDaemonHealth> {
        return this.request({ type: "healthRead" });
    }

    catalogRead(): Promise<RigCatalogProjection> {
        return this.request({ type: "catalogRead" });
    }

    sessionsRead(): Promise<readonly RigSessionSummaryProjection[]> {
        return this.request({ type: "sessionsRead" });
    }

    sessionRead(sessionId: RigSessionId): Promise<RigSessionProjection> {
        return this.request({ type: "sessionRead", sessionId });
    }

    subagentsRead(sessionId: RigSessionId): Promise<readonly RigSubagentProjection[]> {
        return this.request({ type: "subagentsRead", sessionId });
    }

    terminalsRead(sessionId: RigSessionId): Promise<readonly RigTerminalSummaryProjection[]> {
        return this.request({ type: "terminalsRead", sessionId });
    }

    sessionCreate(input: RigSessionCreateInput): Promise<RigSessionProjection> {
        return this.request({ type: "sessionCreate", input });
    }

    sessionFork(sessionId: RigSessionId): Promise<RigSessionProjection> {
        return this.request({ type: "sessionFork", sessionId });
    }

    sessionReset(sessionId: RigSessionId): Promise<RigSessionProjection> {
        return this.request({ type: "sessionReset", sessionId });
    }

    messageSubmit(
        sessionId: RigSessionId,
        text: string,
        clientSubmissionId: string,
    ): Promise<void> {
        return this.request({ type: "messageSubmit", sessionId, text, clientSubmissionId });
    }

    messageSteer(
        sessionId: RigSessionId,
        text: string,
        clientSubmissionId: string,
        expectedRunId?: string,
    ): Promise<void> {
        return this.request({
            type: "messageSteer",
            sessionId,
            text,
            clientSubmissionId,
            ...(expectedRunId ? { expectedRunId } : {}),
        });
    }

    runAbort(sessionId: RigSessionId, expectedRunId?: string): Promise<void> {
        return this.request({
            type: "runAbort",
            sessionId,
            ...(expectedRunId ? { expectedRunId } : {}),
        });
    }

    userInputAnswer(
        sessionId: RigSessionId,
        input: RigUserInputAnswers,
    ): Promise<RigSessionProjection> {
        return this.request({ type: "userInputAnswer", sessionId, input });
    }

    modelChange(sessionId: RigSessionId, input: RigModelSelection): Promise<RigSessionProjection> {
        return this.request({ type: "modelChange", sessionId, input });
    }

    effortChange(sessionId: RigSessionId, effort?: string): Promise<RigSessionProjection> {
        return this.request({
            type: "effortChange",
            sessionId,
            ...(effort ? { effort } : {}),
        });
    }

    serviceTierChange(
        sessionId: RigSessionId,
        serviceTier?: RigServiceTier,
    ): Promise<RigSessionProjection> {
        return this.request({
            type: "serviceTierChange",
            sessionId,
            ...(serviceTier ? { serviceTier } : {}),
        });
    }

    permissionModeChange(
        sessionId: RigSessionId,
        permissionMode: RigPermissionMode,
    ): Promise<RigSessionProjection> {
        return this.request({ type: "permissionModeChange", sessionId, permissionMode });
    }

    terminalCreate(
        sessionId: RigSessionId,
        input: RigTerminalCreateInput,
    ): Promise<RigTerminalSummaryProjection> {
        return this.request({ type: "terminalCreate", sessionId, input });
    }

    terminalStop(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
    ): Promise<RigTerminalSummaryProjection> {
        return this.request({ type: "terminalStop", sessionId, terminalId });
    }

    globalEventsSubscribe(observer: RigEventObserver<RigGlobalEvent>, after?: number): () => void {
        return this.eventsSubscribe(
            { type: "globalEvents", ...(after === undefined ? {} : { after }) },
            (event) => {
                if (event.type === "globalEvent") observer.event(event.event);
                else if (event.type === "error") observer.error(new Error(event.message));
                else if (event.type === "ended") observer.end();
            },
            observer,
        );
    }

    sessionEventsSubscribe(
        sessionId: RigSessionId,
        observer: RigEventObserver<RigSessionEvent>,
        after?: RigEventId,
    ): () => void {
        return this.eventsSubscribe(
            {
                type: "sessionEvents",
                sessionId,
                ...(after ? { after } : {}),
            },
            (event) => {
                if (event.type === "sessionEvent") observer.event(event.event);
                else if (event.type === "error") observer.error(new Error(event.message));
                else if (event.type === "ended") observer.end();
            },
            observer,
        );
    }

    async terminalConnect(
        sessionId: RigSessionId,
        terminalId: RigTerminalId,
        observer: RigTerminalObserver,
    ): Promise<RigDirectTerminalConnection> {
        this.assertActive();
        const lease: StreamLease = {
            closed: false,
            receive: (event) => {
                if (event.type === "terminalConnected") observer.connected();
                else if (event.type === "terminalGrid") observer.grid(event.grid);
                else if (event.type === "terminalExited") observer.exit(event.exitCode);
                else if (event.type === "error") observer.error(new Error(event.message));
                else if (event.type === "ended")
                    observer.error(new Error("The Rig terminal stream ended."));
            },
        };
        this.leases.add(lease);
        try {
            const streamId = await this.bridge.rigStreamOpen({
                type: "terminal",
                sessionId,
                terminalId,
            });
            if (this.disposed || lease.closed) {
                this.buffered.delete(streamId);
                void this.bridge.rigStreamClose(streamId).catch(() => undefined);
                throw new Error("The Rig terminal connection was closed.");
            }
            this.leaseRegister(lease, streamId);
            return {
                write: (data) => {
                    if (!lease.closed)
                        void this.bridge
                            .rigTerminalWrite(streamId, data)
                            .catch((error: unknown) => observer.error(error));
                },
                resize: (cols, rows) => {
                    if (!lease.closed)
                        void this.bridge
                            .rigTerminalResize(streamId, cols, rows)
                            .catch((error: unknown) => observer.error(error));
                },
                scrollback: (start, count, basis) =>
                    this.bridge.rigTerminalScrollback(streamId, start, count, basis),
                close: () => this.leaseClose(lease),
            };
        } catch (error) {
            this.leases.delete(lease);
            throw error;
        }
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        this.unsubscribe();
        for (const lease of this.leases) this.leaseClose(lease);
        this.buffered.clear();
    }

    private request<Request extends RigClientRequest>(request: Request) {
        this.assertActive();
        return this.bridge.rigRequest(request);
    }

    private eventsSubscribe<Event>(
        request: RigStreamOpenRequest,
        receive: (event: RigStreamEvent) => void,
        observer: RigEventObserver<Event>,
    ): () => void {
        this.assertActive();
        const lease: StreamLease = { closed: false, receive };
        this.leases.add(lease);
        void this.bridge.rigStreamOpen(request).then(
            (streamId) => {
                if (this.disposed || lease.closed) {
                    this.buffered.delete(streamId);
                    void this.bridge.rigStreamClose(streamId).catch(() => undefined);
                    return;
                }
                this.leaseRegister(lease, streamId);
            },
            (error: unknown) => {
                this.leases.delete(lease);
                if (!lease.closed) observer.error(error);
            },
        );
        return () => this.leaseClose(lease);
    }

    private leaseRegister(lease: StreamLease, streamId: string): void {
        lease.id = streamId;
        this.streams.set(streamId, lease);
        const buffered = this.buffered.get(streamId);
        this.buffered.delete(streamId);
        for (const event of buffered ?? []) {
            if (!lease.closed) lease.receive(event);
        }
    }

    private leaseClose(lease: StreamLease): void {
        if (lease.closed) return;
        lease.closed = true;
        this.leases.delete(lease);
        if (!lease.id) return;
        this.streams.delete(lease.id);
        this.buffered.delete(lease.id);
        void this.bridge.rigStreamClose(lease.id).catch(() => undefined);
    }

    private receive(event: RigStreamEvent): void {
        if (this.disposed) return;
        const lease = this.streams.get(event.streamId);
        if (lease) {
            if (!lease.closed) lease.receive(event);
            return;
        }
        if (![...this.leases].some((pending) => !pending.closed && !pending.id)) return;
        const events = this.buffered.get(event.streamId) ?? [];
        if (events.length < 64) events.push(event);
        this.buffered.set(event.streamId, events);
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("The renderer Rig transport is closed.");
    }
}
