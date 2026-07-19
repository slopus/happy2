import type {
    ClientTransport,
    HttpRequest,
    HttpResponse,
    HttpStreamObserver,
    RealtimeObserver,
    TerminalConnection,
    TerminalConnectTarget,
} from "../transport.js";
import { TransportError } from "../transport.js";
import type {
    AgentActivityPhase,
    AgentTurnBackgroundTerminalSummary,
    AgentTurnSubagentSummary,
    PresenceSnapshot,
    RealtimeEvent,
} from "../types.js";

export type FakeRouteMatcher = string | RegExp | ((path: string) => boolean);
export type FakeRouteHandler = (
    request: HttpRequest,
    context: { readonly requestNumber: number },
) => HttpResponse | Promise<HttpResponse>;

/** Test-owned controller for one open per-request SSE stream. */
export interface FakeStreamController {
    /** Emits one named event with a JSON payload to the streaming observer. */
    event(event: string, data: unknown): void;
    /** Closes the stream normally. */
    end(): void;
    /** Breaks the stream with a transport-level error. */
    fail(error?: unknown): void;
    /** True once the client cancelled the stream or a terminal call was made. */
    readonly closed: boolean;
    /** True specifically when the client cancelled the stream. */
    readonly aborted: boolean;
}

export type FakeStreamHandler = (
    request: HttpRequest,
    stream: FakeStreamController,
    context: { readonly requestNumber: number },
) => void | Promise<void>;

export interface RecordedRequest extends HttpRequest {
    readonly requestNumber: number;
}

/** The terminal side of one in-memory attach, driven directly by a test. */
export interface FakeTerminalController {
    readonly target: TerminalConnectTarget;
    /** Every outbound frame the client has written to this channel, in order. */
    readonly written: readonly Uint8Array[];
    /** Delivers one inbound frame to the client (buffered while it is paused). */
    emit(chunk: Uint8Array): void;
    /** Closes the channel normally. */
    close(): void;
    /** Breaks the channel with an error. */
    error(error?: Error): void;
    /** True once either side tore the channel down. */
    readonly destroyed: boolean;
}

/** Receives each authenticated terminal attach as a directly driven controller. */
export type FakeTerminalHandler = (controller: FakeTerminalController) => void;

export interface FakeServerEvents {
    emit(event: RealtimeEvent): void;
    sync(input: {
        sequence: string;
        chats?: readonly { readonly chatId: string; readonly pts: string }[];
        areas?: readonly string[];
    }): void;
    typing(input: {
        chatId: string;
        userId: string;
        active: boolean;
        occurredAt?: number;
        expiresAt?: number;
    }): void;
    agentActivity(input: {
        chatId: string;
        agentUserId: string;
        turnId: string;
        active: boolean;
        phase: AgentActivityPhase;
        tokenCount: number;
        startedAt: number;
        occurredAt?: number;
        subagents?: readonly AgentTurnSubagentSummary[];
        backgroundTerminals?: readonly AgentTurnBackgroundTerminalSummary[];
        expiresAt?: number;
    }): void;
    presence(input: {
        change: "activity" | "expired" | "disconnected";
        snapshot: PresenceSnapshot;
        occurredAt?: number;
    }): void;
    workspaceChanged(input: { chatId: string; occurredAt?: number }): void;
    fail(error?: unknown): void;
}

export interface FakeServer {
    readonly transport: ClientTransport;
    readonly requests: readonly RecordedRequest[];
    /** Every terminal attach target the client has opened, in order. */
    readonly terminalConnects: readonly TerminalConnectTarget[];
    readonly events: FakeServerEvents;
    /** Registers the handler that receives each terminal attach byte channel. */
    terminalRoute(handler: FakeTerminalHandler): void;
    route(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        handler: FakeRouteHandler,
    ): void;
    respond(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        ...responses: readonly HttpResponse[]
    ): void;
    /** Registers one handler for per-request SSE streams opened via `requestStream`. */
    streamRoute(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        handler: FakeStreamHandler,
    ): void;
    /** Queues scripted SSE responses: each stream emits its frames in order, then ends. */
    respondStream(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        ...streams: readonly (readonly { readonly event: string; readonly data: unknown }[])[]
    ): void;
    failNext(method: HttpRequest["method"], matcher: FakeRouteMatcher, error?: unknown): void;
    clearRequests(): void;
    close(): void;
}

interface Route {
    readonly method: HttpRequest["method"];
    readonly matcher: FakeRouteMatcher;
    readonly handler: FakeRouteHandler;
}

interface StreamRoute {
    readonly method: HttpRequest["method"];
    readonly matcher: FakeRouteMatcher;
    readonly handler: FakeStreamHandler;
}

export function createFakeServer(): FakeServer {
    return new FakeServerModel();
}

export function jsonResponse<T>(status: number, body: T): HttpResponse<T> {
    return { status, body, headers: { "content-type": "application/json" } };
}

class FakeServerModel implements FakeServer {
    private readonly routes: Route[] = [];
    private readonly streamRoutes: StreamRoute[] = [];
    private readonly failures: Array<Route & { readonly error: unknown }> = [];
    private readonly observers = new Set<RealtimeObserver>();
    private readonly recorded: RecordedRequest[] = [];
    private readonly terminalTargets: TerminalConnectTarget[] = [];
    private terminalHandler?: FakeTerminalHandler;
    private closed = false;

    readonly transport: ClientTransport = {
        request: async <T>(request: HttpRequest): Promise<HttpResponse<T>> => {
            if (this.closed) throw new TransportError("Fake server is closed.", false);
            const recorded = cloneRequest(request, this.recorded.length + 1);
            this.recorded.push(recorded);
            const failureIndex = this.failures.findIndex(
                (candidate) =>
                    candidate.method === request.method && matches(candidate.matcher, request.path),
            );
            if (failureIndex >= 0) {
                const [failure] = this.failures.splice(failureIndex, 1);
                throw failure?.error;
            }
            const route = this.routes.find(
                (candidate) =>
                    candidate.method === request.method && matches(candidate.matcher, request.path),
            );
            if (!route)
                return jsonResponse(404, {
                    error: "fake_route_not_found",
                    message: `No fake ${request.method} route matches ${request.path}`,
                }) as HttpResponse<T>;
            return (await route.handler(recorded, {
                requestNumber: recorded.requestNumber,
            })) as HttpResponse<T>;
        },
        requestStream: (request: HttpRequest, observer: HttpStreamObserver): (() => void) => {
            if (this.closed) {
                observer.onError(new TransportError("Fake server is closed.", false));
                return () => undefined;
            }
            const recorded = cloneRequest(request, this.recorded.length + 1);
            this.recorded.push(recorded);
            const failureIndex = this.failures.findIndex(
                (candidate) =>
                    candidate.method === request.method && matches(candidate.matcher, request.path),
            );
            if (failureIndex >= 0) {
                const [failure] = this.failures.splice(failureIndex, 1);
                observer.onError(failure?.error);
                return () => undefined;
            }
            const streamRoute = this.streamRoutes.find(
                (candidate) =>
                    candidate.method === request.method && matches(candidate.matcher, request.path),
            );
            if (!streamRoute) {
                // A stream against a plain route (or no route) settles as an HTTP failure.
                const route = this.routes.find(
                    (candidate) =>
                        candidate.method === request.method &&
                        matches(candidate.matcher, request.path),
                );
                if (route) {
                    void Promise.resolve(
                        route.handler(recorded, { requestNumber: recorded.requestNumber }),
                    ).then(
                        (response) => observer.onFailure(response),
                        (error: unknown) => observer.onError(error),
                    );
                } else {
                    observer.onFailure(
                        jsonResponse(404, {
                            error: "fake_route_not_found",
                            message: `No fake ${request.method} stream route matches ${request.path}`,
                        }),
                    );
                }
                return () => undefined;
            }
            let closed = false;
            let aborted = false;
            const controller: FakeStreamController = {
                event: (event, data) => {
                    if (closed) return;
                    observer.onEvent({ event, data: structuredClone(data) });
                },
                end: () => {
                    if (closed) return;
                    closed = true;
                    observer.onEnd();
                },
                fail: (error = new TransportError("Fake stream failed.")) => {
                    if (closed) return;
                    closed = true;
                    observer.onError(error);
                },
                get closed() {
                    return closed;
                },
                get aborted() {
                    return aborted;
                },
            };
            void streamRoute.handler(recorded, controller, {
                requestNumber: recorded.requestNumber,
            });
            return () => {
                if (closed) return;
                closed = true;
                aborted = true;
            };
        },
        subscribe: (observer) => {
            if (this.closed) {
                observer.onError?.(new TransportError("Fake server is closed.", false));
                return () => undefined;
            }
            this.observers.add(observer);
            return () => this.observers.delete(observer);
        },
        connectTerminal: (target: TerminalConnectTarget): TerminalConnection => {
            this.terminalTargets.push({ ...target });
            const dataListeners = new Set<(chunk: Uint8Array) => void>();
            const closeListeners = new Set<() => void>();
            const errorListeners = new Set<(error: Error) => void>();
            const written: Uint8Array[] = [];
            const inbound: Uint8Array[] = [];
            let paused = false;
            let destroyed = false;
            const deliver = (chunk: Uint8Array) => {
                if (paused) inbound.push(chunk);
                else for (const listener of dataListeners) listener(chunk);
            };
            const tearDown = (error?: Error) => {
                if (destroyed) return;
                destroyed = true;
                if (error) for (const listener of errorListeners) listener(error);
                for (const listener of closeListeners) listener();
            };
            const connection: TerminalConnection = {
                on: (_event, listener) => {
                    dataListeners.add(listener);
                },
                once: (event, listener) => {
                    if (event === "error") errorListeners.add(listener as (error: Error) => void);
                    else closeListeners.add(listener as () => void);
                },
                write: (chunk) => {
                    if (!destroyed) written.push(chunk);
                },
                pause: () => {
                    paused = true;
                },
                resume: () => {
                    paused = false;
                    for (const chunk of inbound.splice(0)) deliver(chunk);
                },
                destroy: () => tearDown(),
                get destroyed() {
                    return destroyed;
                },
            };
            if (this.closed || !this.terminalHandler) {
                queueMicrotask(() => tearDown(new TransportError("Fake terminal is unavailable.")));
                return connection;
            }
            this.terminalHandler({
                target,
                get written() {
                    return written;
                },
                emit: (chunk) => deliver(chunk),
                close: () => tearDown(),
                error: (error = new TransportError("Fake terminal failed.")) => tearDown(error),
                get destroyed() {
                    return destroyed;
                },
            });
            return connection;
        },
    };

    readonly events: FakeServerEvents = {
        emit: (event) => {
            for (const observer of Array.from(this.observers))
                observer.onEvent(structuredClone(event));
        },
        sync: ({ sequence, chats = [], areas = [] }) => {
            this.events.emit({ type: "sync", sequence, chats, areas });
        },
        typing: ({ chatId, userId, active, occurredAt = Date.now(), expiresAt }) => {
            this.events.emit({ type: "typing", chatId, userId, active, occurredAt, expiresAt });
        },
        agentActivity: ({
            chatId,
            agentUserId,
            turnId,
            active,
            phase,
            tokenCount,
            startedAt,
            occurredAt = Date.now(),
            subagents = [],
            backgroundTerminals = [],
            expiresAt,
        }) => {
            this.events.emit({
                type: "agent.activity",
                chatId,
                agentUserId,
                turnId,
                active,
                phase,
                tokenCount,
                startedAt,
                occurredAt,
                subagents,
                backgroundTerminals,
                expiresAt,
            });
        },
        presence: ({ change, snapshot, occurredAt = Date.now() }) => {
            this.events.emit({ type: "presence", change, snapshot, occurredAt });
        },
        workspaceChanged: ({ chatId, occurredAt = Date.now() }) => {
            this.events.emit({ type: "workspace.changed", chatId, occurredAt });
        },
        fail: (error = new TransportError("Fake realtime stream failed.")) => {
            for (const observer of Array.from(this.observers)) observer.onError?.(error);
        },
    };

    get requests(): readonly RecordedRequest[] {
        return this.recorded;
    }

    get terminalConnects(): readonly TerminalConnectTarget[] {
        return this.terminalTargets;
    }

    terminalRoute(handler: FakeTerminalHandler): void {
        this.terminalHandler = handler;
    }

    route(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        handler: FakeRouteHandler,
    ): void {
        this.routes.push({ method, matcher, handler });
    }

    respond(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        ...responses: readonly HttpResponse[]
    ): void {
        if (responses.length === 0) throw new Error("At least one fake response is required.");
        let index = 0;
        this.route(method, matcher, () => {
            const response = responses[Math.min(index, responses.length - 1)];
            index += 1;
            return structuredClone(response);
        });
    }

    streamRoute(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        handler: FakeStreamHandler,
    ): void {
        this.streamRoutes.push({ method, matcher, handler });
    }

    respondStream(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        ...streams: readonly (readonly { readonly event: string; readonly data: unknown }[])[]
    ): void {
        if (streams.length === 0) throw new Error("At least one fake stream script is required.");
        let index = 0;
        this.streamRoute(method, matcher, (_request, stream) => {
            const frames = streams[Math.min(index, streams.length - 1)]!;
            index += 1;
            for (const frame of frames) stream.event(frame.event, frame.data);
            stream.end();
        });
    }

    failNext(
        method: HttpRequest["method"],
        matcher: FakeRouteMatcher,
        error: unknown = new TransportError("Injected fake network failure."),
    ): void {
        this.failures.push({ method, matcher, error, handler: () => jsonResponse(500, {}) });
    }

    clearRequests(): void {
        this.recorded.splice(0);
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        const error = new TransportError("Fake server closed.", false);
        for (const observer of Array.from(this.observers)) observer.onError?.(error);
        this.observers.clear();
    }
}

function matches(matcher: FakeRouteMatcher, path: string): boolean {
    if (typeof matcher === "string") return matcher === path;
    if (matcher instanceof RegExp) {
        matcher.lastIndex = 0;
        return matcher.test(path);
    }
    return matcher(path);
}

function cloneRequest(request: HttpRequest, requestNumber: number): RecordedRequest {
    return {
        method: request.method,
        path: request.path,
        body: request.body === undefined ? undefined : cloneBody(request.body),
        headers: request.headers ? { ...request.headers } : undefined,
        requestNumber,
    };
}

function cloneBody(body: unknown): unknown {
    // Multipart bodies (FormData) are not structured-cloneable; record them by reference.
    try {
        return structuredClone(body);
    } catch {
        return body;
    }
}
