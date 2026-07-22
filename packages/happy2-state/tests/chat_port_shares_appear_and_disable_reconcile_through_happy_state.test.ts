import { describe, expect, it } from "vitest";
import { happyStateCreate, type PortShareSummary } from "../src/index.js";
import { createFakeServer as createBareFakeServer, jsonResponse } from "../src/testing/index.js";
import { chat, message } from "./fixtures.js";

function createFakeServer() {
    const server = createBareFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: new Date().toISOString() }),
    );
    server.respond(
        "GET",
        "/v0/contacts",
        jsonResponse(200, { users: [], presence: [], statuses: [] }),
    );
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat()] }));
    server.respond("GET", "/v0/projects", jsonResponse(200, { projects: [] }));
    server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
    server.respond(
        "GET",
        "/v0/chats/chat-1/messages?limit=100",
        jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "0" }),
    );
    return server;
}

const share: PortShareSummary = {
    id: "share-1",
    chatId: "chat-1",
    agentUserId: "agent-1",
    containerPort: 3000,
    name: "Documentation Preview",
    subdomain: "documentation-preview-abc123",
    createdByUserId: "user-1",
    createdAt: "2026-01-01T00:00:00.000Z",
    url: "http://documentation-preview-abc123.preview.example",
};

describe("chat port shares over the live HappyState sync path", () => {
    it("surfaces a plugin-created share on the open chat after a portShare.created chat update", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [] }),
            jsonResponse(200, { portShares: [share] }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [chat({ pts: "1" })],
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
                    { pts: "1", ptsCount: 1, kind: "portShare.created", entityId: "share-1" },
                ],
                messages: [],
                chat: chat({ pts: "1" }),
                state: { membershipEpoch: "1", pts: "1" },
                targetState: { membershipEpoch: "1", pts: "1" },
            }),
        );

        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using handle = state.chatOpen("chat-1");
        handle.getState().portSharesRetain();
        await state.whenIdle();
        expect(handle.getState().portShares).toMatchObject({ type: "ready", value: [] });

        // A plugin exposes a port: the chat advances with a portShare.created update
        // carried only over the realtime hint, so the retained list reconciles durably.
        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(handle.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1", name: "Documentation Preview" }],
        });
        expect(
            server.requests.filter(({ path }) => path === "/v0/chats/chat-1/portShares"),
        ).toHaveLength(2);
    });

    it("removes a disabled share from the retained list by reconciling the durable read", async () => {
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/chats/chat-1/portShares",
            jsonResponse(200, { portShares: [share] }),
            jsonResponse(200, { portShares: [] }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/portShares/share-1/disablePortShare",
            jsonResponse(200, {
                portShare: { ...share, disabledAt: "2026-01-01T00:05:00.000Z" },
            }),
        );

        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        using handle = state.chatOpen("chat-1");
        handle.getState().portSharesRetain();
        await state.whenIdle();
        expect(handle.getState().portShares).toMatchObject({
            type: "ready",
            value: [{ id: "share-1" }],
        });

        handle.getState().portShareDisable("share-1");
        expect(handle.getState().portShareDisablingIds).toEqual(["share-1"]);
        await state.whenIdle();
        expect(handle.getState().portShares).toMatchObject({ type: "ready", value: [] });
        expect(handle.getState().portShareDisablingIds).toEqual([]);
    });
});
