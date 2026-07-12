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

export interface ClientTransport {
    request<T = unknown>(request: HttpRequest): Promise<HttpResponse<T>>;
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
