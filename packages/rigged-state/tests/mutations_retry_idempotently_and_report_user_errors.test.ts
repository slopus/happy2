import { describe, expect, it, vi } from "vitest";
import { createClientState, TransportError, UserError } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";
import { chat, message } from "./fixtures";

function initializedServer() {
    const server = createFakeServer();
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
    return server;
}

describe("client mutations", () => {
    it("creates an agent user through the state boundary", async () => {
        const server = initializedServer();
        server.respond(
            "POST",
            "/v0/chats/createAgent",
            jsonResponse(201, {
                chat: chat({
                    id: "agent-chat",
                    kind: "dm",
                    name: undefined,
                    dmType: "direct",
                }),
            }),
        );
        const state = createClientState(server.transport, { createId: () => "agent-key" });
        await state.start();

        await expect(
            state.createAgent({ name: "New agent", username: "new_agent" }),
        ).resolves.toMatchObject({
            id: "agent-chat",
            kind: "dm",
            dmType: "direct",
        });
        expect(server.requests.at(-1)).toMatchObject({
            method: "POST",
            path: "/v0/chats/createAgent",
            headers: { "idempotency-key": "agent-key" },
        });
    });

    it("retries promise actions with one idempotency key", async () => {
        const server = initializedServer();
        let attempt = 0;
        server.route("POST", "/v0/chats/createChannel", () => {
            attempt += 1;
            if (attempt < 3) throw new TransportError("temporary");
            return jsonResponse(201, { chat: chat({ id: "chat-2", slug: "retried" }) });
        });
        const state = createClientState(server.transport, {
            createId: () => "one-idempotency-key",
            sleep: async () => undefined,
        });
        await state.start();

        await expect(
            state.createChannel({ kind: "private_channel", name: "Retried", slug: "retried" }),
        ).resolves.toMatchObject({ id: "chat-2" });

        const requests = server.requests.filter((request) => request.method === "POST");
        expect(requests).toHaveLength(3);
        expect(requests.map((request) => request.headers?.["idempotency-key"])).toEqual([
            "one-idempotency-key",
            "one-idempotency-key",
            "one-idempotency-key",
        ]);
        expect(state.get().chats.map(({ id }) => id)).toEqual(["chat-1", "chat-2"]);
    });

    it("does not retry user failures and exposes a displayable UserError", async () => {
        const server = initializedServer();
        server.respond(
            "POST",
            "/v0/chats/createChannel",
            jsonResponse(400, { error: "invalid", message: "That channel slug is unavailable." }),
        );
        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();

        const failure = await state
            .createChannel({ kind: "private_channel", name: "Invalid", slug: "invalid" })
            .catch((error: unknown) => error);
        expect(failure).toBeInstanceOf(UserError);
        expect(failure).toMatchObject({
            code: "invalid",
            message: "That channel slug is unavailable.",
        });
        expect(server.requests.filter((request) => request.method === "POST")).toHaveLength(1);
    });

    it("emits an optimistic message immediately and replaces it after a retried delivery", async () => {
        const server = initializedServer();
        let resolveRequest: ((value: ReturnType<typeof jsonResponse>) => void) | undefined;
        let attempt = 0;
        server.route("POST", "/v0/chats/chat-1/sendMessage", () => {
            attempt += 1;
            if (attempt === 1) throw new TransportError("dropped response");
            return new Promise((resolve) => {
                resolveRequest = resolve;
            });
        });
        const state = createClientState(server.transport, {
            createId: () => "mutation-1",
            now: () => Date.parse("2026-01-01T00:00:10.000Z"),
            sleep: async () => undefined,
        });
        const events = vi.fn();
        state.subscribe("messages", events);
        await state.start();

        expect(
            state.sendMessage("chat-1", {
                text: "optimistic",
                threadRootMessageId: "root-message",
            }),
        ).toBeUndefined();
        expect(state.get().messagesByChat["chat-1"]).toMatchObject([
            {
                delivery: "sending",
                clientMutationId: "mutation-1",
                message: {
                    id: "local:mutation-1",
                    text: "optimistic",
                    threadRootMessageId: "root-message",
                },
            },
        ]);

        await vi.waitFor(() => expect(resolveRequest).toBeTypeOf("function"));
        resolveRequest?.(jsonResponse(201, { message: message({ text: "optimistic" }) }));
        await state.whenIdle();

        expect(state.get().messagesByChat["chat-1"]).toMatchObject([
            { delivery: "sent", message: { id: "message-1", text: "optimistic" } },
        ]);
        const posts = server.requests.filter((request) => request.method === "POST");
        expect(posts).toHaveLength(2);
        expect(posts[0]?.body).toMatchObject({
            clientMutationId: "mutation-1",
            threadRootMessageId: "root-message",
        });
        expect(posts.map((request) => request.headers?.["idempotency-key"])).toEqual([
            "mutation-1",
            "mutation-1",
        ]);
        expect(events.mock.calls.map(([event]) => event.reason)).toEqual([
            "optimistic",
            "confirmed",
        ]);
    });

    it("marks exhausted background actions failed and reports them without throwing", async () => {
        const server = initializedServer();
        server.respond(
            "POST",
            "/v0/chats/chat-1/sendMessage",
            jsonResponse(503, { error: "unavailable" }),
        );
        const state = createClientState(server.transport, {
            retry: { attempts: 2 },
            createId: () => "failed-message",
            sleep: async () => undefined,
        });
        const failures = vi.fn();
        state.subscribe("background-error", failures);
        await state.start();

        state.sendMessage("chat-1", { text: "will fail" });
        await state.whenIdle();

        expect(state.get().messagesByChat["chat-1"]?.[0]).toMatchObject({
            delivery: "failed",
            error: { code: "unavailable" },
        });
        expect(failures).toHaveBeenCalledWith(
            expect.objectContaining({
                type: "background-error",
                action: "sendMessage",
                clientMutationId: "failed-message",
            }),
        );
        expect(server.requests.filter((request) => request.method === "POST")).toHaveLength(2);
    });
});
