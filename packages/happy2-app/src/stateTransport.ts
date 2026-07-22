import {
    TransportError,
    type ClientTransport,
    type HttpRequest,
    type HttpResponse,
    type HttpStreamObserver,
    type RealtimeEvent,
    type RealtimeObserver,
    type TerminalConnection,
    type TerminalConnectTarget,
} from "happy2-state";

const TERMINAL_PROTOCOL = "happy2-terminal.v1";
const TERMINAL_AUTH_PROTOCOL_PREFIX = "happy2-auth.";
const REALTIME_RECONNECT_MIN_MS = 250;
const REALTIME_RECONNECT_MAX_MS = 10_000;

export function createAuthenticatedTransport(baseUrl: string, token?: string): ClientTransport {
    const base = baseUrl.replace(/\/$/, "");
    return {
        async request<T>(request: HttpRequest): Promise<HttpResponse<T>> {
            let response: Response;
            try {
                const rawBody = isRawBody(request.body);
                const init: RequestInit & { duplex?: "half" } = {
                    method: request.method,
                    headers: {
                        accept: "application/json",
                        ...(request.body === undefined || rawBody
                            ? {}
                            : { "content-type": "application/json" }),
                        ...request.headers,
                        ...(token ? { authorization: `Bearer ${token}` } : {}),
                    },
                    body:
                        request.body === undefined
                            ? undefined
                            : rawBody
                              ? (request.body as BodyInit)
                              : JSON.stringify(request.body),
                };
                if (request.body instanceof ReadableStream) init.duplex = "half";
                response = await fetch(`${base}${request.path}`, init);
            } catch (error) {
                throw new TransportError("Happy (2) server is unreachable.", true, {
                    cause: error,
                });
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
        },
        requestStream(request: HttpRequest, observer: HttpStreamObserver): () => void {
            const controller = new AbortController();
            void streamRequest(base, token, request, controller.signal, observer);
            return () => controller.abort();
        },
        subscribe(observer: RealtimeObserver): () => void {
            const controller = new AbortController();
            void subscribeRealtime(`${base}/v0/sync/events`, token, controller.signal, observer);
            return () => controller.abort();
        },
        connectTerminal(target: TerminalConnectTarget): TerminalConnection {
            // Browsers cannot set an Authorization header on a WebSocket, so the
            // session token rides an extra subprotocol the gateway promotes; a
            // Cloudflare-Access or no-token deployment simply omits it and relies
            // on forwarded cookies/headers.
            const protocols = [
                TERMINAL_PROTOCOL,
                ...(token ? [`${TERMINAL_AUTH_PROTOCOL_PREFIX}${token}`] : []),
            ];
            return new BrowserTerminalConnection(terminalUrl(base, target), protocols);
        },
    };
}

/** Copies a protocol frame into a fresh ArrayBuffer the DOM WebSocket accepts. */
function toArrayBuffer(chunk: Uint8Array): ArrayBuffer {
    const copy = new Uint8Array(chunk.byteLength);
    copy.set(chunk);
    return copy.buffer;
}

function terminalUrl(base: string, target: TerminalConnectTarget): string {
    const path = `${base}/v0/chats/${encodeURIComponent(target.chatId)}/agents/${encodeURIComponent(
        target.agentUserId,
    )}/terminals/${encodeURIComponent(target.terminalId)}/attach`;
    // An absolute `http(s)` base yields an absolute path here; a same-origin
    // deployment (base `""`) yields a root-relative path that must resolve
    // against the current page so the WebSocket URL stays on the right origin.
    const url = new URL(path, globalThis.location?.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    return url.toString();
}

/**
 * Wraps a browser WebSocket as the transport-neutral terminal byte channel the
 * binary protocol drives. Outbound frames buffer until the socket opens; inbound
 * frames buffer while the protocol has paused for backpressure; `error`/`close`
 * fan out to every registered listener so both the protocol and the owning store
 * observe the same lifecycle.
 */
class BrowserTerminalConnection implements TerminalConnection {
    private readonly socket: WebSocket;
    private readonly dataListeners = new Set<(chunk: Uint8Array) => void>();
    private readonly closeListeners = new Set<() => void>();
    private readonly errorListeners = new Set<(error: Error) => void>();
    private readonly outbound: Uint8Array[] = [];
    private readonly inbound: Uint8Array[] = [];
    private paused = false;
    private opened = false;
    private closedFlag = false;

    constructor(url: string, protocols: readonly string[]) {
        this.socket = new WebSocket(url, protocols as string[]);
        this.socket.binaryType = "arraybuffer";
        this.socket.onopen = () => {
            this.opened = true;
            for (const chunk of this.outbound.splice(0)) this.socket.send(toArrayBuffer(chunk));
        };
        this.socket.onmessage = (event) => {
            const chunk =
                event.data instanceof ArrayBuffer ? new Uint8Array(event.data) : undefined;
            if (!chunk) return;
            if (this.paused) this.inbound.push(chunk);
            else for (const listener of this.dataListeners) listener(chunk);
        };
        this.socket.onerror = () => {
            const error = new Error("The terminal connection failed.");
            const listeners = [...this.errorListeners];
            this.errorListeners.clear();
            for (const listener of listeners) listener(error);
        };
        this.socket.onclose = () => {
            this.closedFlag = true;
            const listeners = [...this.closeListeners];
            this.closeListeners.clear();
            for (const listener of listeners) listener();
        };
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
        if (this.opened && this.socket.readyState === WebSocket.OPEN)
            this.socket.send(toArrayBuffer(chunk));
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
        // Node `Duplex.destroy(error)` semantics: a protocol decode/validation
        // failure must reach the error listeners once, before the close, instead
        // of being swallowed into a silent reconnect.
        if (error) {
            const listeners = [...this.errorListeners];
            this.errorListeners.clear();
            for (const listener of listeners) listener(error);
        }
        try {
            this.socket.close();
        } catch {
            // Closing an already-closed socket is fine.
        }
    }

    get destroyed(): boolean {
        return this.closedFlag;
    }
}

async function subscribeRealtime(
    url: string,
    token: string | undefined,
    signal: AbortSignal,
    observer: RealtimeObserver,
): Promise<void> {
    let consecutiveFailures = 0;
    while (!signal.aborted) {
        let opened = false;
        let failure: unknown;
        try {
            await streamEvents(url, token, signal, observer, () => {
                opened = true;
            });
            if (signal.aborted) return;
            failure = new TransportError("Realtime disconnected from the Happy (2) server.");
        } catch (error) {
            if (signal.aborted) return;
            failure = error;
        }
        observer.onError?.(failure);
        if (failure instanceof TransportError && !failure.retryable) return;
        consecutiveFailures = opened ? 0 : consecutiveFailures + 1;
        const delay = Math.min(
            REALTIME_RECONNECT_MIN_MS * 2 ** Math.max(0, consecutiveFailures - 1),
            REALTIME_RECONNECT_MAX_MS,
        );
        await abortableDelay(delay, signal);
    }
}

async function streamEvents(
    url: string,
    token: string | undefined,
    signal: AbortSignal,
    observer: RealtimeObserver,
    onOpen: () => void,
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: {
                accept: "text/event-stream",
                ...(token ? { authorization: `Bearer ${token}` } : {}),
            },
            signal,
        });
    } catch (error) {
        if (signal.aborted) return;
        throw new TransportError("Realtime could not connect to the Happy (2) server.", true, {
            cause: error,
        });
    }
    if (!response.ok || !response.body) {
        const retryable =
            response.status === 408 || response.status === 429 || response.status >= 500;
        throw new TransportError(`Realtime returned HTTP ${response.status}.`, retryable);
    }
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let receivedFrame = false;
    while (!signal.aborted) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done });
        for (;;) {
            const next = sseFrameTake(buffer);
            if (!next) break;
            buffer = next.rest;
            if (!receivedFrame) {
                receivedFrame = true;
                onOpen();
            }
            const { event: eventName, data } = sseFrameFields(next.frame);
            if (data) {
                const event = JSON.parse(data) as unknown;
                if (eventName === "ready" || eventName === "heartbeat") {
                    const state = syncStateFromFrame(event);
                    if (state) observer.onEvent({ type: "sync.checkpoint", state });
                } else if (isRealtimeEvent(event)) observer.onEvent(event);
            }
        }
        if (result.done) return;
    }
}

function syncStateFromFrame(
    value: unknown,
): Extract<RealtimeEvent, { readonly type: "sync.checkpoint" }>["state"] | undefined {
    if (!value || typeof value !== "object" || !("state" in value)) return undefined;
    const state = value.state;
    if (!state || typeof state !== "object") return undefined;
    if (
        !("protocolVersion" in state) ||
        state.protocolVersion !== 1 ||
        !("generation" in state) ||
        typeof state.generation !== "string" ||
        !("sequence" in state) ||
        typeof state.sequence !== "string"
    )
        return undefined;
    return {
        protocolVersion: 1,
        generation: state.generation,
        sequence: state.sequence,
    };
}

function isRealtimeEvent(value: unknown): value is RealtimeEvent {
    return Boolean(value && typeof value === "object" && "type" in value);
}

function abortableDelay(milliseconds: number, signal: AbortSignal): Promise<void> {
    if (signal.aborted) return Promise.resolve();
    return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        const finish = (): void => {
            if (timer) clearTimeout(timer);
            signal.removeEventListener("abort", finish);
            resolve();
        };
        signal.addEventListener("abort", finish, { once: true });
        if (signal.aborted) finish();
        else timer = setTimeout(finish, milliseconds);
    });
}

async function streamRequest(
    base: string,
    token: string | undefined,
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
                ...(request.body === undefined || rawBody
                    ? {}
                    : { "content-type": "application/json" }),
                ...request.headers,
                ...(token ? { authorization: `Bearer ${token}` } : {}),
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
        response = await fetch(`${base}${request.path}`, init);
    } catch (error) {
        if (!signal.aborted)
            observer.onError(
                new TransportError("Happy (2) server is unreachable.", true, { cause: error }),
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
        observer.onError(new TransportError("The server stream had no body."));
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
                const next = sseFrameTake(buffer);
                if (!next) break;
                buffer = next.rest;
                const { event, data } = sseFrameFields(next.frame);
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
                new TransportError("The server stream was interrupted.", true, { cause: error }),
            );
    }
}

function sseFrameTake(
    buffer: string,
): { readonly frame: string; readonly rest: string } | undefined {
    const boundary = /(?:\r\n|\r(?!\n)|\n){2}/.exec(buffer);
    if (!boundary || boundary.index === undefined) return undefined;
    return {
        frame: buffer.slice(0, boundary.index),
        rest: buffer.slice(boundary.index + boundary[0].length),
    };
}

function sseFrameFields(frame: string): { readonly event?: string; readonly data: string } {
    const lines = frame.split(/\r\n|\r|\n/);
    return {
        event: lines
            .find((line) => line.startsWith("event:"))
            ?.slice(6)
            .trim(),
        data: lines
            .filter((line) => line.startsWith("data:"))
            .map((line) => line.slice(5).trimStart())
            .join("\n"),
    };
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
