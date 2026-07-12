import { describe, expect, it, vi } from "vitest";
import { createClientState } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";
import { chat, message } from "./fixtures";

describe("durable synchronization", () => {
    it("refreshes previously loaded non-chat areas named by durable differences", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "GET",
            "/v0/presence",
            jsonResponse(200, { presence: [], statuses: [] }),
            jsonResponse(200, {
                presence: [{ userId: "user-2", status: "online", connectionCount: 1 }],
                statuses: [],
            }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["presence"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        const state = createClientState(server.transport);
        await state.start();
        await state.execute("getPresence");

        server.events.sync({ sequence: "1", areas: ["presence"] });
        await state.whenIdle();

        expect(state.get().presence).toEqual([
            { userId: "user-2", status: "online", connectionCount: 1 },
        ]);
        expect(server.requests.filter(({ path }) => path === "/v0/presence")).toHaveLength(2);
    });

    it("uses realtime as a hint and reconciles changed loaded chats through differences", async () => {
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
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [], chatPts: "0", hasMore: false }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [chat({ pts: "1", lastMessageSequence: "1" })],
                removedChatIds: [],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            jsonResponse(200, {
                kind: "difference",
                updates: [
                    { pts: "1", ptsCount: 1, kind: "message.created", entityId: "message-1" },
                ],
                messages: [message()],
                chat: chat({ pts: "1", lastMessageSequence: "1" }),
                state: { membershipEpoch: "1", pts: "1" },
                targetState: { membershipEpoch: "1", pts: "1" },
            }),
        );

        const state = createClientState(server.transport);
        await state.start();
        await state.loadMessages("chat-1");
        server.events.sync({ sequence: "1", chats: [{ chatId: "chat-1", pts: "1" }] });
        await state.whenIdle();

        expect(state.get()).toMatchObject({
            sync: { sequence: "1" },
            chats: [{ id: "chat-1", pts: "1" }],
            messagesByChat: {
                "chat-1": [{ delivery: "sent", message: { id: "message-1" } }],
            },
        });
        expect(server.requests.map(({ path }) => path)).toEqual([
            "/v0/sync/state",
            "/v0/chats",
            "/v0/chats/chat-1/messages?limit=100",
            "/v0/sync/getDifference",
            "/v0/chats/chat-1/getDifference",
        ]);
    });

    it("queues a sync hint received while initial state is still loading", async () => {
        const server = createFakeServer();
        let releaseState: (() => void) | undefined;
        server.route("GET", "/v0/sync/state", async () => {
            await new Promise<void>((resolve) => {
                releaseState = resolve;
            });
            return jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            });
        });
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        const state = createClientState(server.transport);
        const starting = state.start();
        await vi.waitFor(() => expect(releaseState).toBeTypeOf("function"));
        server.events.sync({ sequence: "1" });
        releaseState!();
        await starting;
        await state.whenIdle();

        expect(state.get().sync?.sequence).toBe("1");
        expect(
            server.requests.filter(({ path }) => path === "/v0/sync/getDifference"),
        ).toHaveLength(1);
    });
});
