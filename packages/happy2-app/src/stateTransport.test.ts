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

    it("opens a same-origin terminal WebSocket with encoded ids and auth subprotocol", () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const target = { chatId: "chat 1", agentUserId: "a/b", terminalId: "t#1" };
        createAuthenticatedTransport("/", "secret").connectTerminal(target);

        const socket = FakeWebSocket.instances.at(-1)!;
        const expected = new URL(
            `/v0/chats/${encodeURIComponent(target.chatId)}/agents/${encodeURIComponent(
                target.agentUserId,
            )}/terminals/${encodeURIComponent(target.terminalId)}/attach`,
            window.location.href,
        );
        expected.protocol = expected.protocol === "https:" ? "wss:" : "ws:";
        expect(socket.url).toBe(expected.toString());
        expect(socket.url.startsWith("ws://")).toBe(true);
        expect(socket.url).toContain("/v0/chats/chat%201/agents/a%2Fb/terminals/t%231/attach");
        expect(socket.protocols).toEqual(["happy2-terminal.v1", "happy2-auth.secret"]);
    });

    it("omits the auth subprotocol when there is no bearer token", () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        createAuthenticatedTransport("/").connectTerminal({
            chatId: "c",
            agentUserId: "a",
            terminalId: "t",
        });
        expect(FakeWebSocket.instances.at(-1)!.protocols).toEqual(["happy2-terminal.v1"]);
    });

    it("uses wss for an absolute https deployment base", () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        createAuthenticatedTransport("https://api.example.com").connectTerminal({
            chatId: "c",
            agentUserId: "a",
            terminalId: "t",
        });
        expect(FakeWebSocket.instances.at(-1)!.url).toBe(
            "wss://api.example.com/v0/chats/c/agents/a/terminals/t/attach",
        );
    });

    it("surfaces a destroy error to listeners once, before close", () => {
        vi.stubGlobal("WebSocket", FakeWebSocket);
        const connection = createAuthenticatedTransport("/", "t").connectTerminal({
            chatId: "c",
            agentUserId: "a",
            terminalId: "t",
        });
        const order: string[] = [];
        let received: Error | undefined;
        connection.once("error", (error) => {
            order.push("error");
            received = error;
        });
        connection.once("close", () => order.push("close"));

        const failure = new Error("decode failed");
        connection.destroy(failure);
        expect(received).toBe(failure);
        expect(order).toEqual(["error", "close"]);
        expect(connection.destroyed).toBe(true);

        // One-shot: a second destroy emits nothing further.
        connection.destroy(new Error("again"));
        expect(order).toEqual(["error", "close"]);
    });
});

class FakeWebSocket {
    static readonly OPEN = 1;
    static instances: FakeWebSocket[] = [];
    url: string;
    protocols: string | string[] | undefined;
    binaryType = "blob";
    readyState = 1;
    onopen: (() => void) | null = null;
    onmessage: ((event: MessageEvent) => void) | null = null;
    onerror: (() => void) | null = null;
    onclose: (() => void) | null = null;
    closedFlag = false;

    constructor(url: string, protocols?: string | string[]) {
        this.url = url;
        this.protocols = protocols;
        FakeWebSocket.instances.push(this);
    }

    send(): void {
        // Outbound frames are irrelevant to these URL/lifecycle assertions.
    }

    close(): void {
        if (this.closedFlag) return;
        this.closedFlag = true;
        this.onclose?.();
    }
}
