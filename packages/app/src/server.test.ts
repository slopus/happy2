import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerClient } from "./server";

describe("Rigged server client", () => {
    afterEach(() => vi.unstubAllGlobals());

    it("discovers the server method and sends bearer credentials", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ role: "all", method: "password", signupEnabled: true }),
                    { status: 200 },
                ),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({ user: { id: "user", firstName: "Ada", username: "ada" } }),
                    { status: 200 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);
        const client = createServerClient("http://127.0.0.1:3000/");
        expect(await client.methods()).toMatchObject({ method: "password", signupEnabled: true });
        expect((await client.me("session-token")).user.username).toBe("ada");
        expect(fetchMock.mock.calls[1]?.[0]).toBe("http://127.0.0.1:3000/v0/me");
        expect(fetchMock.mock.calls[1]?.[1].headers.authorization).toBe("Bearer session-token");
    });

    it("surfaces server response failures as typed errors", async () => {
        vi.stubGlobal(
            "fetch",
            vi
                .fn()
                .mockResolvedValue(
                    new Response(JSON.stringify({ error: "unauthorized" }), { status: 401 }),
                ),
        );
        await expect(createServerClient("http://server").me("bad")).rejects.toMatchObject({
            status: 401,
            code: "unauthorized",
        });
    });

    it("loads chat history and sends idempotent messages with attachments", async () => {
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(
                new Response(JSON.stringify({ messages: [], chatPts: "4", hasMore: false }), {
                    status: 200,
                }),
            )
            .mockResolvedValueOnce(
                new Response(
                    JSON.stringify({
                        message: { id: "message-1", chatId: "chat/a", attachments: [] },
                    }),
                    { status: 201 },
                ),
            );
        vi.stubGlobal("fetch", fetchMock);
        const client = createServerClient("http://server");

        await expect(client.messages("chat/a", "token", { limit: 100 })).resolves.toMatchObject({
            chatPts: "4",
        });
        await expect(
            client.sendMessage(
                "chat/a",
                {
                    text: "hello",
                    attachmentFileIds: ["file-1"],
                    clientMutationId: "mutation-1",
                },
                "token",
            ),
        ).resolves.toMatchObject({ message: { id: "message-1" } });

        expect(fetchMock.mock.calls[0]?.[0]).toBe(
            "http://server/v0/chats/chat%2Fa/messages?limit=100",
        );
        const send = fetchMock.mock.calls[1]?.[1] as RequestInit;
        expect(send.method).toBe("POST");
        expect(JSON.parse(String(send.body))).toEqual({
            text: "hello",
            attachmentFileIds: ["file-1"],
            clientMutationId: "mutation-1",
        });
    });

    it("streams authenticated realtime events without putting the token in the URL", async () => {
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
            createServerClient("http://server").subscribe("secret", (value) => resolve(value.type));
        });

        await expect(event).resolves.toBe("sync");
        expect(fetchMock.mock.calls[0]?.[0]).toBe("http://server/v0/sync/events");
        expect(fetchMock.mock.calls[0]?.[1].headers.authorization).toBe("Bearer secret");
    });
});
