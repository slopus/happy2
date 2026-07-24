import { randomBytes } from "node:crypto";
import type { RigDirectTerminalConnection, RigTransport } from "happy2-state";
import type {
    RigClientRequest,
    RigClientResponse,
    RigStreamEvent,
    RigStreamOpenRequest,
} from "../shared/desktopContract";

interface EventStream {
    readonly kind: "events";
    readonly ownerId: number;
    readonly close: () => void;
}

interface TerminalStream {
    readonly kind: "terminal";
    readonly ownerId: number;
    connection?: RigDirectTerminalConnection;
}

type Stream = EventStream | TerminalStream;

/** Authorizes closed Rig operations and binds every stream to one renderer owner. */
export class RigIpcHost implements Disposable {
    private readonly streams = new Map<string, Stream>();
    private disposed = false;

    constructor(
        private readonly transportGet: () => RigTransport,
        private readonly transportError: (error: unknown) => void = () => undefined,
    ) {}

    request<Request extends RigClientRequest>(
        request: Request,
    ): Promise<RigClientResponse<Request>> {
        this.assertActive();
        const transport = this.transportGet();
        let result: Promise<unknown>;
        switch (request.type) {
            case "healthRead":
                result = transport.healthRead();
                break;
            case "catalogRead":
                result = transport.catalogRead();
                break;
            case "sessionsRead":
                result = transport.sessionsRead();
                break;
            case "sessionRead":
                result = transport.sessionRead(request.sessionId);
                break;
            case "subagentsRead":
                result = transport.subagentsRead(request.sessionId);
                break;
            case "terminalsRead":
                result = transport.terminalsRead(request.sessionId);
                break;
            case "sessionCreate":
                result = transport.sessionCreate(request.input);
                break;
            case "sessionFork":
                result = transport.sessionFork(request.sessionId);
                break;
            case "sessionReset":
                result = transport.sessionReset(request.sessionId);
                break;
            case "messageSubmit":
                result = transport.messageSubmit(
                    request.sessionId,
                    request.text,
                    request.clientSubmissionId,
                );
                break;
            case "messageSteer":
                result = transport.messageSteer(
                    request.sessionId,
                    request.text,
                    request.clientSubmissionId,
                    request.expectedRunId,
                );
                break;
            case "runAbort":
                result = transport.runAbort(request.sessionId, request.expectedRunId);
                break;
            case "userInputAnswer":
                result = transport.userInputAnswer(request.sessionId, request.input);
                break;
            case "modelChange":
                result = transport.modelChange(request.sessionId, request.input);
                break;
            case "effortChange":
                result = transport.effortChange(request.sessionId, request.effort);
                break;
            case "serviceTierChange":
                result = transport.serviceTierChange(request.sessionId, request.serviceTier);
                break;
            case "permissionModeChange":
                result = transport.permissionModeChange(request.sessionId, request.permissionMode);
                break;
            case "terminalCreate":
                result = transport.terminalCreate(request.sessionId, request.input);
                break;
            case "terminalStop":
                result = transport.terminalStop(request.sessionId, request.terminalId);
                break;
        }
        return result.catch((error: unknown) => {
            this.transportError(error);
            throw error;
        }) as Promise<RigClientResponse<Request>>;
    }

    async streamOpen(
        ownerId: number,
        request: RigStreamOpenRequest,
        emit: (event: RigStreamEvent) => void,
    ): Promise<string> {
        this.assertActive();
        const streamId = `rig_stream_${randomBytes(16).toString("hex")}`;
        const transport = this.transportGet();
        if (request.type === "globalEvents") {
            let close: () => void = () => undefined;
            const stream: EventStream = { kind: "events", ownerId, close: () => close() };
            this.streams.set(streamId, stream);
            try {
                close = transport.globalEventsSubscribe(
                    {
                        event: (event) =>
                            this.emitOwned(streamId, stream, emit, {
                                streamId,
                                type: "globalEvent",
                                event,
                            }),
                        error: (error) => this.emitErrorOwned(streamId, stream, emit, error),
                        end: () =>
                            this.emitOwned(streamId, stream, emit, {
                                streamId,
                                type: "ended",
                            }),
                    },
                    request.after,
                );
                return streamId;
            } catch (error) {
                this.streams.delete(streamId);
                this.transportError(error);
                throw error;
            }
        }
        if (request.type === "sessionEvents") {
            let close: () => void = () => undefined;
            const stream: EventStream = { kind: "events", ownerId, close: () => close() };
            this.streams.set(streamId, stream);
            try {
                close = transport.sessionEventsSubscribe(
                    request.sessionId,
                    {
                        event: (event) =>
                            this.emitOwned(streamId, stream, emit, {
                                streamId,
                                type: "sessionEvent",
                                event,
                            }),
                        error: (error) => this.emitErrorOwned(streamId, stream, emit, error),
                        end: () =>
                            this.emitOwned(streamId, stream, emit, {
                                streamId,
                                type: "ended",
                            }),
                    },
                    request.after,
                );
                return streamId;
            } catch (error) {
                this.streams.delete(streamId);
                this.transportError(error);
                throw error;
            }
        }
        const stream: TerminalStream = { kind: "terminal", ownerId };
        this.streams.set(streamId, stream);
        try {
            const connection = await transport.terminalConnect(
                request.sessionId,
                request.terminalId,
                {
                    connected: () =>
                        this.emitOwned(streamId, stream, emit, {
                            streamId,
                            type: "terminalConnected",
                        }),
                    grid: (grid) =>
                        this.emitOwned(streamId, stream, emit, {
                            streamId,
                            type: "terminalGrid",
                            grid,
                        }),
                    exit: (exitCode) =>
                        this.emitOwned(streamId, stream, emit, {
                            streamId,
                            type: "terminalExited",
                            exitCode,
                        }),
                    error: (error) => this.emitErrorOwned(streamId, stream, emit, error),
                },
            );
            if (this.disposed || this.streams.get(streamId) !== stream) {
                connection.close();
                throw new Error("The Rig terminal owner closed while it was connecting.");
            }
            stream.connection = connection;
            return streamId;
        } catch (error) {
            this.streams.delete(streamId);
            this.transportError(error);
            throw error;
        }
    }

    streamClose(ownerId: number, streamId: string): void {
        const stream = this.owned(ownerId, streamId);
        if (stream.kind === "events") stream.close();
        else stream.connection?.close();
        this.streams.delete(streamId);
    }

    terminalWrite(ownerId: number, streamId: string, data: string): void {
        this.terminal(ownerId, streamId).connection?.write(data);
    }

    terminalResize(ownerId: number, streamId: string, cols: number, rows: number): void {
        this.terminal(ownerId, streamId).connection?.resize(cols, rows);
    }

    terminalScrollback(
        ownerId: number,
        streamId: string,
        start: number,
        count: number,
        basis?: { readonly historyEpoch: string; readonly historyRevision: number },
    ) {
        const connection = this.terminal(ownerId, streamId).connection;
        if (!connection) throw new Error("The Rig terminal is still connecting.");
        return connection.scrollback(start, count, basis).catch((error: unknown) => {
            this.transportError(error);
            throw error;
        });
    }

    closeOwner(ownerId: number): void {
        for (const [streamId, stream] of this.streams) {
            if (stream.ownerId !== ownerId) continue;
            if (stream.kind === "events") stream.close();
            else stream.connection?.close();
            this.streams.delete(streamId);
        }
    }

    [Symbol.dispose](): void {
        if (this.disposed) return;
        this.disposed = true;
        for (const stream of this.streams.values()) {
            if (stream.kind === "events") stream.close();
            else stream.connection?.close();
        }
        this.streams.clear();
    }

    private terminal(ownerId: number, streamId: string): TerminalStream {
        const stream = this.owned(ownerId, streamId);
        if (stream.kind !== "terminal") throw new Error("The Rig stream is not a terminal.");
        return stream;
    }

    private owned(ownerId: number, streamId: string): Stream {
        this.assertActive();
        const stream = this.streams.get(streamId);
        if (!stream || stream.ownerId !== ownerId)
            throw new Error("The Rig stream is unavailable.");
        return stream;
    }

    private emitOwned(
        streamId: string,
        stream: Stream,
        emit: (event: RigStreamEvent) => void,
        event: RigStreamEvent,
    ): void {
        if (!this.disposed && this.streams.get(streamId) === stream) emit(event);
    }

    private emitErrorOwned(
        streamId: string,
        stream: Stream,
        emit: (event: RigStreamEvent) => void,
        error: unknown,
    ): void {
        this.transportError(error);
        this.emitOwned(streamId, stream, emit, {
            streamId,
            type: "error",
            message: error instanceof Error ? error.message : String(error),
        });
    }

    private assertActive(): void {
        if (this.disposed) throw new Error("The Rig IPC host is closed.");
    }
}
