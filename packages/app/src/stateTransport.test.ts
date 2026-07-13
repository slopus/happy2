import { afterEach, describe, expect, it, vi } from "vitest";
import { createAuthenticatedTransport } from "./stateTransport";

describe("authenticated rigged-state transport", () => {
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
});
