import type { RealtimeEvent } from "./types.js";

export interface HttpRequest {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly body?: unknown;
    readonly headers?: Readonly<Record<string, string>>;
}

export interface HttpResponse<T = unknown> {
    readonly status: number;
    readonly body: T;
    readonly headers?: Readonly<Record<string, string>>;
}

export interface RealtimeObserver {
    readonly onEvent: (event: RealtimeEvent) => void;
    readonly onError?: (error: unknown) => void;
}

/** One named server-sent event from a per-request stream; `data` is the parsed JSON payload. */
export interface HttpStreamEvent {
    readonly event: string;
    readonly data: unknown;
}

export interface HttpStreamObserver {
    readonly onEvent: (event: HttpStreamEvent) => void;
    /** The request settled as an ordinary non-2xx HTTP response instead of opening a stream. */
    readonly onFailure: (response: HttpResponse<unknown>) => void;
    /** The stream closed after delivering every frame the server sent. */
    readonly onEnd: () => void;
    readonly onError: (error: unknown) => void;
}

/**
 * A low-level, already authenticated bidirectional byte channel to one remote
 * terminal. It carries opaque binary protocol frames only: the transport owns
 * how those bytes reach the server (URL, credentials, WebSocket subprotocols),
 * and never surfaces any of that to product state or UI code. The method subset
 * mirrors the reader/writer surface the terminal protocol drives, so a concrete
 * connection can be a browser WebSocket wrapper or an in-memory test pair
 * without depending on Node stream internals.
 */
export interface TerminalConnection {
    /** Delivers each inbound binary frame exactly as received from the server. */
    on(event: "data", listener: (chunk: Uint8Array) => void): void;
    /** Reports a transport failure; the channel is unusable afterward. */
    once(event: "error", listener: (error: Error) => void): void;
    /** Reports that the channel closed after any final inbound frames. */
    once(event: "close", listener: () => void): void;
    /** Queues one outbound binary frame; buffered until the channel is open. */
    write(chunk: Uint8Array): void;
    /** Pauses inbound `data` delivery so the reader can apply backpressure. */
    pause(): void;
    /** Resumes inbound `data` delivery after a pause. */
    resume(): void;
    /** Tears the channel down, optionally reporting the cause to the peer. */
    destroy(error?: Error): void;
    /** True once the channel has been destroyed or closed. */
    readonly destroyed: boolean;
}

/** Identifies the exact authorized terminal a connection should attach to. */
export interface TerminalConnectTarget {
    readonly chatId: string;
    readonly agentUserId: string;
    readonly terminalId: string;
}

export interface ClientTransport {
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
    /**
     * Executes one request whose successful response is a server-sent event
     * stream, delivering frames as they arrive. The returned function cancels
     * the request/stream; observers receive nothing after cancellation.
     */
    requestStream(request: HttpRequest, observer: HttpStreamObserver): () => void;
    subscribe(observer: RealtimeObserver): () => void;
    /**
     * Opens an authenticated binary channel to one authorized terminal. The
     * returned connection begins connecting immediately and buffers writes until
     * it is ready; product state receives only this opaque byte channel.
     */
    connectTerminal(target: TerminalConnectTarget): TerminalConnection;
}

/** A transport may use this error to explicitly describe retryable I/O failures. */
export class TransportError extends Error {
    constructor(
        message: string,
        readonly retryable = true,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = "TransportError";
    }
}
