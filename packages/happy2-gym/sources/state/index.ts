import type {
    ClientTransport,
    HttpRequest,
    HttpResponse,
    HttpStreamObserver,
    RealtimeEvent,
    RealtimeObserver,
} from "happy2-state";
import { TransportError } from "happy2-state";
import type { GymServer, GymUser } from "../server/index.js";

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

    whenConnected(): Promise<void> {
        return this.connected.promise;
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
