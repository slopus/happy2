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

export interface ClientTransport {
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
    /**
     * Executes one request whose successful response is a server-sent event
     * stream, delivering frames as they arrive. The returned function cancels
     * the request/stream; observers receive nothing after cancellation.
     */
    requestStream(request: HttpRequest, observer: HttpStreamObserver): () => void;
    subscribe(observer: RealtimeObserver): () => void;
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
