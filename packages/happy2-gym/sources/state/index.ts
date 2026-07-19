import WebSocket from "ws";
import type {
    ClientTransport,
    HttpRequest,
    HttpResponse,
    HttpStreamObserver,
    RealtimeEvent,
    RealtimeObserver,
    TerminalConnection,
    TerminalConnectTarget,
} from "happy2-state";
import { TransportError } from "happy2-state";
import type { GymServer, GymUser } from "../server/index.js";

const TERMINAL_PROTOCOL = "happy2-terminal.v1";
const MAX_TERMINAL_WIRE_BYTES = 4 * 1024 * 1024 + 20;

export interface GymStateTransport extends ClientTransport {
    /** Resolves after the state model's event stream receives its ready frame. */
    whenConnected(): Promise<void>;
}

/**
 * Adapts a real in-memory gym server to happy2-state's authenticated low-level boundary.
 * Authentication stays here; the state package receives no token or auth behavior.
 */
export async function createGymStateTransport(
    server: GymServer,
    user: GymUser,
): Promise<GymStateTransport> {
    const baseUrl = await server.listen();
    return new GymStateTransportModel(baseUrl, user.token);
}

class GymStateTransportModel implements GymStateTransport {
    private connected = Promise.withResolvers<void>();

    constructor(
        private readonly baseUrl: string,
        private readonly token: string,
    ) {}

    async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
        let response: Response;
        try {
            const rawBody = isRawBody(request.body);
            const init: RequestInit & { duplex?: "half" } = {
                method: request.method,
                headers: {
                    accept: "application/json",
                    authorization: `Bearer ${this.token}`,
                    ...(request.body === undefined || rawBody
                        ? {}
                        : { "content-type": "application/json" }),
                    ...request.headers,
                },
                body:
                    request.body === undefined
                        ? undefined
                        : rawBody
                          ? (request.body as BodyInit)
                          : JSON.stringify(request.body),
            };
            if (request.body instanceof ReadableStream) init.duplex = "half";
            response = await fetch(`${this.baseUrl}${request.path}`, init);
        } catch (error) {
            throw new TransportError("The gym server request failed.", true, { cause: error });
        }
        const body = (
            response.headers.get("content-type")?.includes("application/json")
                ? await response.json().catch(() => ({}))
                : await response.arrayBuffer()
        ) as T;
        return {
            status: response.status,
            body,
            headers: Object.fromEntries(response.headers),
        };
    }

    requestStream(request: HttpRequest, observer: HttpStreamObserver): () => void {
        const controller = new AbortController();
        void this.streamRequest(request, controller.signal, observer);
        return () => controller.abort();
    }

    private async streamRequest(
        request: HttpRequest,
        signal: AbortSignal,
        observer: HttpStreamObserver,
    ): Promise<void> {
        let response: Response;
        try {
            const rawBody = isRawBody(request.body);
            const init: RequestInit & { duplex?: "half" } = {
                method: request.method,
                headers: {
                    accept: "text/event-stream",
                    authorization: `Bearer ${this.token}`,
                    ...(request.body === undefined || rawBody
                        ? {}
                        : { "content-type": "application/json" }),
                    ...request.headers,
                },
                body:
                    request.body === undefined
                        ? undefined
                        : rawBody
                          ? (request.body as BodyInit)
                          : JSON.stringify(request.body),
                signal,
            };
            if (request.body instanceof ReadableStream) init.duplex = "half";
            response = await fetch(`${this.baseUrl}${request.path}`, init);
        } catch (error) {
            if (!signal.aborted)
                observer.onError(
                    new TransportError("The gym stream request failed.", true, { cause: error }),
                );
            return;
        }
        if (signal.aborted) return;
        if (!response.ok || !response.headers.get("content-type")?.includes("text/event-stream")) {
            const body = response.headers.get("content-type")?.includes("application/json")
                ? await response.json().catch(() => ({}))
                : await response.arrayBuffer();
            if (!signal.aborted)
                observer.onFailure({
                    status: response.status,
                    body,
                    headers: Object.fromEntries(response.headers),
                });
            return;
        }
        if (!response.body) {
            observer.onError(new TransportError("The gym stream had no body."));
            return;
        }
        try {
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = "";
            for (;;) {
                const result = await reader.read();
                if (signal.aborted) return;
                buffer += decoder.decode(result.value, { stream: !result.done });
                for (;;) {
                    const boundary = /(?:\r\n|\r(?!\n)|\n){2}/.exec(buffer);
                    if (!boundary || boundary.index === undefined) break;
                    const frame = buffer.slice(0, boundary.index);
                    buffer = buffer.slice(boundary.index + boundary[0].length);
                    const lines = frame.split(/\r\n|\r|\n/);
                    const event = lines
                        .find((line) => line.startsWith("event:"))
                        ?.slice(6)
                        .trim();
                    const data = lines
                        .filter((line) => line.startsWith("data:"))
                        .map((line) => line.slice(5).trimStart())
                        .join("\n");
                    if (data) {
                        let parsed: unknown = data;
                        try {
                            parsed = JSON.parse(data);
                        } catch {
                            // Non-JSON data frames are delivered as raw text.
                        }
                        observer.onEvent({ event: event ?? "message", data: parsed });
                    }
                }
                if (result.done) {
                    observer.onEnd();
                    return;
                }
            }
        } catch (error) {
            if (!signal.aborted)
                observer.onError(
                    new TransportError("The gym stream was interrupted.", true, { cause: error }),
                );
        }
    }

    subscribe(observer: RealtimeObserver): () => void {
        const controller = new AbortController();
        const connection = Promise.withResolvers<void>();
        void connection.promise.catch(() => undefined);
        let ready = false;
        this.connected = connection;
        void streamEvents(
            `${this.baseUrl}/v0/sync/events`,
            this.token,
            controller.signal,
            () => {
                ready = true;
                connection.resolve();
            },
            observer.onEvent,
        ).then(
            () => {
                if (!controller.signal.aborted) {
                    const error = new TransportError("The gym event stream closed.");
                    if (!ready) connection.reject(error);
                    observer.onError?.(error);
                }
            },
            (error: unknown) => {
                if (!controller.signal.aborted) {
                    if (!ready) connection.reject(error);
                    observer.onError?.(error);
                }
            },
        );
        return () => {
            if (!ready) connection.reject(new TransportError("The gym event stream was aborted."));
            controller.abort();
        };
    }

    connectTerminal(target: TerminalConnectTarget): TerminalConnection {
        // Node can set headers on a WebSocket, so the gym keeps its Bearer-header
        // authentication; the base subprotocol is still required by the server.
        const url = new URL(
            `/v0/chats/${encodeURIComponent(target.chatId)}/agents/${encodeURIComponent(
                target.agentUserId,
            )}/terminals/${encodeURIComponent(target.terminalId)}/attach`,
            this.baseUrl,
        );
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        const socket = new WebSocket(url.toString(), [TERMINAL_PROTOCOL], {
            headers: { authorization: `Bearer ${this.token}` },
            maxPayload: MAX_TERMINAL_WIRE_BYTES,
            perMessageDeflate: false,
        });
        return new GymTerminalConnection(socket);
    }

    whenConnected(): Promise<void> {
        return this.connected.promise;
    }
}

/**
 * Wraps a Node `ws` socket as happy2-state's neutral terminal byte channel:
 * outbound frames buffer until open, inbound frames buffer while paused for
 * backpressure, and a `destroy(error)` surfaces the error once before close.
 */
class GymTerminalConnection implements TerminalConnection {
    private readonly dataListeners = new Set<(chunk: Uint8Array) => void>();
    private readonly closeListeners = new Set<() => void>();
    private readonly errorListeners = new Set<(error: Error) => void>();
    private readonly outbound: Uint8Array[] = [];
    private readonly inbound: Uint8Array[] = [];
    private paused = false;
    private opened = false;
    private closedFlag = false;

    constructor(private readonly socket: WebSocket) {
        socket.binaryType = "nodebuffer";
        socket.on("open", () => {
            this.opened = true;
            for (const chunk of this.outbound.splice(0)) socket.send(chunk);
        });
        socket.on("message", (data: Buffer) => {
            const chunk = new Uint8Array(data);
            if (this.paused) this.inbound.push(chunk);
            else for (const listener of this.dataListeners) listener(chunk);
        });
        socket.on("error", (error: Error) => {
            const listeners = [...this.errorListeners];
            this.errorListeners.clear();
            for (const listener of listeners) listener(error);
        });
        socket.on("close", () => {
            this.closedFlag = true;
            const listeners = [...this.closeListeners];
            this.closeListeners.clear();
            for (const listener of listeners) listener();
        });
    }

    on(_event: "data", listener: (chunk: Uint8Array) => void): void {
        this.dataListeners.add(listener);
    }

    once(event: "error", listener: (error: Error) => void): void;
    once(event: "close", listener: () => void): void;
    once(event: "error" | "close", listener: ((error: Error) => void) & (() => void)): void {
        if (event === "error") this.errorListeners.add(listener);
        else this.closeListeners.add(listener);
    }

    write(chunk: Uint8Array): void {
        if (this.closedFlag) return;
        if (this.opened && this.socket.readyState === WebSocket.OPEN) this.socket.send(chunk);
        else this.outbound.push(chunk);
    }

    pause(): void {
        this.paused = true;
    }

    resume(): void {
        this.paused = false;
        for (const chunk of this.inbound.splice(0))
            for (const listener of this.dataListeners) listener(chunk);
    }

    destroy(error?: Error): void {
        if (this.closedFlag) return;
        this.closedFlag = true;
        if (error) {
            const listeners = [...this.errorListeners];
            this.errorListeners.clear();
            for (const listener of listeners) listener(error);
        }
        this.socket.terminate();
    }

    get destroyed(): boolean {
        return this.closedFlag;
    }
}

function isRawBody(body: unknown): body is BodyInit {
    return (
        typeof body === "string" ||
        body instanceof Blob ||
        body instanceof FormData ||
        body instanceof URLSearchParams ||
        body instanceof ArrayBuffer ||
        ArrayBuffer.isView(body) ||
        body instanceof ReadableStream
    );
}

async function streamEvents(
    url: string,
    token: string,
    signal: AbortSignal,
    onReady: () => void,
    onEvent: (event: RealtimeEvent) => void,
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
            signal,
        });
    } catch (error) {
        if (signal.aborted) return;
        throw new TransportError("The gym event stream could not connect.", true, { cause: error });
    }
    if (!response.ok || !response.body)
        throw new TransportError(`The gym event stream returned HTTP ${response.status}.`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done }).replaceAll("\r\n", "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const name = frame
                .split("\n")
                .find((line) => line.startsWith("event:"))
                ?.slice(6)
                .trim();
            const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
            if (name === "ready") onReady();
            else if (data) {
                const event = JSON.parse(data) as RealtimeEvent;
                if ("type" in event) onEvent(event);
            }
            boundary = buffer.indexOf("\n\n");
        }
        if (result.done) return;
    }
}
