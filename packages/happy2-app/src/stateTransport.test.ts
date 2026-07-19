import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthenticatedTransport } from "./stateTransport";

function deferred<T>() {
    let resolve!: (value: T | PromiseLike<T>) => void;
    let reject!: (reason?: unknown) => void;
    const promise = new Promise<T>((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
    });
    return { promise, resolve, reject };
}

describe("authenticated happy2-state transport", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("sends authenticated JSON requests without exposing auth to the state model", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ chat: { id: "chat-1" } }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const transport = createAuthenticatedTransport("http://server/", "secret");

        await expect(
            transport.request({ method: "POST", path: "/v0/chats/chat-1/join", body: {} }),
        ).resolves.toMatchObject({ status: 200, body: { chat: { id: "chat-1" } } });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://server/v0/chats/chat-1/join");
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: "POST",
            headers: expect.objectContaining({ authorization: "Bearer secret" }),
        });
    });

    it("streams authenticated realtime events without placing tokens in URLs", async () => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                controller.enqueue(
                    encoder.encode(
                        'event: sync\ndata: {"type":"sync","sequence":"2","chats":[],"areas":[]}\n\n',
                    ),
                );
                controller.close();
            },
        });
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(stream, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const event = new Promise<string>((resolve) => {
            createAuthenticatedTransport("http://server", "secret").subscribe({
                onEvent: (value) => resolve(value.type),
            });
        });

        await expect(event).resolves.toBe("sync");
        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://server/v0/sync/events");
        expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe("Bearer secret");
    });

    it("streams multipart request SSE across split CRLF frames without overriding the boundary", async () => {
        const encoder = new TextEncoder();
        const chunks = [
            "event: progress\r",
            '\ndata: {"stage":"downloading"}\r',
            "\n\r",
            '\nevent: prepared\ndata: {"selectionRequired":false}\n\n',
        ];
        const stream = new ReadableStream({
            start(controller) {
                for (const chunk of chunks) controller.enqueue(encoder.encode(chunk));
                controller.close();
            },
        });
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(stream, {
                status: 200,
                headers: { "content-type": "text/event-stream; charset=utf-8" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const body = new FormData();
        body.set("plugin", new File(["zip"], "plugin.zip", { type: "application/zip" }));
        const events: unknown[] = [];
        const ended = deferred<void>();

        createAuthenticatedTransport("http://server", "secret").requestStream(
            { method: "POST", path: "/v0/admin/pluginPackages/preparePlugin", body },
            {
                onEvent: (event) => events.push(event),
                onFailure: (response) => ended.reject(new Error(`HTTP ${response.status}`)),
                onEnd: () => ended.resolve(),
                onError: (error) => ended.reject(error),
            },
        );

        await ended.promise;
        expect(events).toEqual([
            { event: "progress", data: { stage: "downloading" } },
            { event: "prepared", data: { selectionRequired: false } },
        ]);
        expect(fetchMock.mock.calls[0]?.[1]).toMatchObject({
            method: "POST",
            body,
            headers: expect.objectContaining({
                accept: "text/event-stream",
                authorization: "Bearer secret",
            }),
        });
        expect(fetchMock.mock.calls[0]?.[1].headers["content-type"]).toBeUndefined();
    });

    it("reports JSON stream-opening failures and silences a cancelled request", async () => {
        const failedFetch = vi.fn().mockResolvedValue(
            new Response(
                JSON.stringify({ error: "not_found", message: "Prepared token expired" }),
                {
                    status: 404,
                    headers: { "content-type": "application/json" },
                },
            ),
        );
        vi.stubGlobal("fetch", failedFetch);
        const failure = deferred<unknown>();
        createAuthenticatedTransport("http://server").requestStream(
            { method: "POST", path: "/v0/admin/pluginPackages/preparePlugin", body: {} },
            {
                onEvent: () => undefined,
                onFailure: (response) => failure.resolve(response),
                onEnd: () => failure.reject(new Error("unexpected end")),
                onError: (error) => failure.reject(error),
            },
        );
        await expect(failure.promise).resolves.toMatchObject({
            status: 404,
            body: { error: "not_found", message: "Prepared token expired" },
        });

        const pending = deferred<Response>();
        const pendingFetch = vi.fn().mockReturnValue(pending.promise);
        vi.stubGlobal("fetch", pendingFetch);
        const callbacks: string[] = [];
        const cancel = createAuthenticatedTransport("http://server").requestStream(
            { method: "POST", path: "/v0/admin/pluginPackages/preparePlugin", body: {} },
            {
                onEvent: () => callbacks.push("event"),
                onFailure: () => callbacks.push("failure"),
                onEnd: () => callbacks.push("end"),
                onError: () => callbacks.push("error"),
            },
        );
        const signal = pendingFetch.mock.calls[0]?.[1].signal as AbortSignal;
        cancel();
        pending.resolve(
            new Response(undefined, {
                status: 200,
                headers: { "content-type": "text/event-stream" },
            }),
        );
        await Promise.resolve();
        await Promise.resolve();
        expect(signal.aborted).toBe(true);
        expect(callbacks).toEqual([]);
    });

    it("uses same-origin browser authentication when no Happy bearer token exists", async () => {
        const fetchMock = vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ chat: { id: "chat-1" } }), {
                status: 200,
                headers: { "content-type": "application/json" },
            }),
        );
        vi.stubGlobal("fetch", fetchMock);
        const transport = createAuthenticatedTransport("/");

        await expect(
            transport.request({ method: "GET", path: "/v0/chats/chat-1" }),
        ).resolves.toMatchObject({ status: 200 });
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/v0/chats/chat-1");
        expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBeUndefined();
    });
});
