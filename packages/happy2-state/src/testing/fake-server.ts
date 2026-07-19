import type { ClientTransport, HttpRequest, HttpResponse, RealtimeObserver } from "../transport.js";
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

export interface RecordedRequest extends HttpRequest {
    readonly requestNumber: number;
}

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
    readonly events: FakeServerEvents;
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
    failNext(method: HttpRequest["method"], matcher: FakeRouteMatcher, error?: unknown): void;
    clearRequests(): void;
    close(): void;
}

interface Route {
    readonly method: HttpRequest["method"];
    readonly matcher: FakeRouteMatcher;
    readonly handler: FakeRouteHandler;
}

export function createFakeServer(): FakeServer {
    return new FakeServerModel();
}

export function jsonResponse<T>(status: number, body: T): HttpResponse<T> {
    return { status, body, headers: { "content-type": "application/json" } };
}

class FakeServerModel implements FakeServer {
    private readonly routes: Route[] = [];
    private readonly failures: Array<Route & { readonly error: unknown }> = [];
    private readonly observers = new Set<RealtimeObserver>();
    private readonly recorded: RecordedRequest[] = [];
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
        subscribe: (observer) => {
            if (this.closed) {
                observer.onError?.(new TransportError("Fake server is closed.", false));
                return () => undefined;
            }
            this.observers.add(observer);
            return () => this.observers.delete(observer);
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
        body: request.body === undefined ? undefined : structuredClone(request.body),
        headers: request.headers ? { ...request.headers } : undefined,
        requestNumber,
    };
}
