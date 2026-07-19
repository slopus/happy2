import {
    TransportError,
    type ClientTransport,
    type HttpRequest,
    type HttpResponse,
    type HttpStreamObserver,
    type RealtimeEvent,
    type RealtimeObserver,
} from "happy2-state";

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
            void streamEvents(`${base}/v0/sync/events`, token, controller.signal, observer).then(
                () => {
                    if (!controller.signal.aborted)
                        observer.onError?.(
                            new TransportError("Realtime disconnected from the Happy (2) server."),
                        );
                },
                (error: unknown) => {
                    if (!controller.signal.aborted) observer.onError?.(error);
                },
            );
            return () => controller.abort();
        },
    };
}

async function streamEvents(
    url: string,
    token: string | undefined,
    signal: AbortSignal,
    observer: RealtimeObserver,
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
    if (!response.ok || !response.body)
        throw new TransportError(`Realtime returned HTTP ${response.status}.`);

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
        const result = await reader.read();
        buffer += decoder.decode(result.value, { stream: !result.done });
        for (;;) {
            const next = sseFrameTake(buffer);
            if (!next) break;
            buffer = next.rest;
            const data = sseFrameFields(next.frame).data;
            if (data) {
                const event = JSON.parse(data) as RealtimeEvent | { state?: unknown };
                if ("type" in event) observer.onEvent(event);
            }
        }
        if (result.done) return;
    }
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
