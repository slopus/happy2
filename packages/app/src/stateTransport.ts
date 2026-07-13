import {
    TransportError,
    type ClientTransport,
    type HttpRequest,
    type HttpResponse,
    type RealtimeEvent,
    type RealtimeObserver,
} from "rigged-state";

export function createAuthenticatedTransport(baseUrl: string, token: string): ClientTransport {
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
                        authorization: `Bearer ${token}`,
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
                throw new TransportError("Rigged server is unreachable.", true, { cause: error });
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
        subscribe(observer: RealtimeObserver): () => void {
            const controller = new AbortController();
            void streamEvents(`${base}/v0/sync/events`, token, controller.signal, observer).then(
                () => {
                    if (!controller.signal.aborted)
                        observer.onError?.(
                            new TransportError("Realtime disconnected from the Rigged server."),
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
    token: string,
    signal: AbortSignal,
    observer: RealtimeObserver,
): Promise<void> {
    let response: Response;
    try {
        response = await fetch(url, {
            headers: { accept: "text/event-stream", authorization: `Bearer ${token}` },
            signal,
        });
    } catch (error) {
        if (signal.aborted) return;
        throw new TransportError("Realtime could not connect to the Rigged server.", true, {
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
        buffer += decoder.decode(result.value, { stream: !result.done }).replaceAll("\r\n", "\n");
        let boundary = buffer.indexOf("\n\n");
        while (boundary >= 0) {
            const frame = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const data = frame
                .split("\n")
                .filter((line) => line.startsWith("data:"))
                .map((line) => line.slice(5).trimStart())
                .join("\n");
            if (data) {
                const event = JSON.parse(data) as RealtimeEvent | { state?: unknown };
                if ("type" in event) observer.onEvent(event);
            }
            boundary = buffer.indexOf("\n\n");
        }
        if (result.done) return;
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
