import { describe, expect, it, vi } from "vitest";
import { createClientState, type ClientStateEventOf } from "../src/index";
import { createFakeServer, jsonResponse } from "../src/testing";
import { chat } from "./fixtures";

describe("client state initialization and realtime facade", () => {
    it("publishes immutable snapshots through all-event and typed subscriptions", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "generation-1", sequence: "0" },
                serverTime: "2026-01-01T00:00:00.000Z",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));

        const state = createClientState(server.transport);
        const allEvents = vi.fn();
        const chatEvents = vi.fn<(event: ClientStateEventOf<"chats">) => void>();
        state.subscribe(allEvents);
        state.subscribe("chats", chatEvents);

        await state.start();

        expect(state.get()).toMatchObject({
            status: "ready",
            sync: { generation: "generation-1", sequence: "0" },
            chats: [{ id: "chat-1" }],
        });
        expect(Object.isFrozen(state.get())).toBe(true);
        expect(Object.isFrozen(state.get().chats)).toBe(true);
        expect(Object.isFrozen(state.get().chats[0]!)).toBe(true);
        expect(chatEvents).toHaveBeenCalledWith({
            type: "chats",
            reason: "initial",
            chatIds: ["chat-1"],
            removedChatIds: [],
        });
        expect(allEvents.mock.calls.map(([event]) => event.type)).toEqual([
            "status",
            "chats",
            "status",
        ]);
    });

    it("handles presence, stale typing events, expiry, and raw facade events", async () => {
        vi.useFakeTimers();
        try {
            let now = 1_000;
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
            const state = createClientState(server.transport, { now: () => now });
            const realtime = vi.fn();
            state.subscribe("realtime", realtime);
            await state.start();

            server.events.typing({
                chatId: "chat-1",
                userId: "user-2",
                active: true,
                occurredAt: 20,
                expiresAt: 2_000,
            });
            server.events.typing({
                chatId: "chat-1",
                userId: "user-2",
                active: false,
                occurredAt: 10,
            });
            server.events.presence({
                change: "connected",
                occurredAt: 30,
                snapshot: { userId: "user-2", status: "online", connectionCount: 1 },
            });

            expect(state.get().typing).toEqual([
                { chatId: "chat-1", userId: "user-2", expiresAt: 2_000 },
            ]);
            expect(state.get().presence).toEqual([
                { userId: "user-2", status: "online", connectionCount: 1 },
            ]);
            expect(realtime).toHaveBeenCalledTimes(3);

            now = 2_000;
            await vi.advanceTimersByTimeAsync(1_000);
            expect(state.get().typing).toEqual([]);
        } finally {
            vi.useRealTimers();
        }
    });
});
