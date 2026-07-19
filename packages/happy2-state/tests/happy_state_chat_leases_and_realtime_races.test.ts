import { describe, expect, it, vi } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer as createBareFakeServer, jsonResponse } from "../src/testing/index.js";
import { chat, message } from "./fixtures.js";

function createFakeServer() {
    const server = createBareFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: new Date().toISOString() }),
    );
    return server;
}

describe("HappyState chat leases and realtime races", () => {
    it("refetches effective permissions after a permissions sync hint", async () => {
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
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: ["permissions"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "GET",
            "/v0/me",
            jsonResponse(200, {
                user: { id: "user-1", username: "me", firstName: "Me" },
                permissions: { allowed: [], owner: false },
            }),
            jsonResponse(200, {
                user: { id: "user-1", username: "me", firstName: "Me" },
                permissions: { allowed: ["managePlugins"], owner: false },
            }),
        );
        using state = happyStateCreate({
            initialPermissions: { allowed: [], owner: false },
            transport: server.transport,
        });
        const permissions = state.permissions();
        await state.whenIdle();
        await state.syncStart();
        expect(permissions.getState().permissions).toMatchObject({
            type: "ready",
            value: { allowed: [] },
        });
        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(permissions.getState().permissions).toMatchObject({
            type: "ready",
            value: { allowed: ["managePlugins"] },
        });
        expect(server.requests.filter(({ path }) => path === "/v0/me")).toHaveLength(2);
    });

    it("refetches the retained administration user list after a permissions sync hint", async () => {
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
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: ["permissions"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "GET",
            "/v0/admin/users",
            jsonResponse(200, {
                users: [
                    {
                        id: "user-2",
                        username: "mia",
                        firstName: "Mia",
                        role: "member",
                        kind: "human",
                    },
                ],
            }),
            jsonResponse(200, {
                users: [
                    {
                        id: "user-2",
                        username: "mia",
                        firstName: "Mia",
                        role: "admin",
                        kind: "human",
                    },
                ],
            }),
        );
        using state = happyStateCreate({
            initialPermissions: { allowed: [], owner: true },
            transport: server.transport,
        });
        const admin = state.admin("users");
        await state.whenIdle();
        await state.syncStart();
        expect(admin.getState().users).toMatchObject({
            type: "ready",
            value: [{ id: "user-2", role: "member" }],
        });
        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(admin.getState().users).toMatchObject({
            type: "ready",
            value: [{ id: "user-2", role: "admin" }],
        });
        expect(server.requests.filter(({ path }) => path === "/v0/admin/users")).toHaveLength(2);
    });

    it("subscribes before initial load and consumes a hint received during it", async () => {
        const server = createFakeServer();
        let releaseState!: () => void;
        server.route("GET", "/v0/sync/state", async () => {
            await new Promise<void>((resolve) => (releaseState = resolve));
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
        using state = happyStateCreate({ transport: server.transport });
        const starting = state.syncStart();
        await vi.waitFor(() => expect(releaseState).toBeTypeOf("function"));
        server.events.sync({ sequence: "1" });
        releaseState();
        await starting;
        await state.whenIdle();
        expect(state.sidebar().getState().sync?.sequence).toBe("1");
        expect(
            server.requests.filter(({ path }) => path === "/v0/sync/getDifference"),
        ).toHaveLength(1);
    });

    it("caches DM membership while replacing a rare changed sidebar identity", async () => {
        const server = createFakeServer();
        const dm = chat({ kind: "dm", name: undefined, slug: undefined, dmType: "direct" });
        const peer = {
            id: "user-2",
            username: "ada",
            firstName: "Ada",
            photoFileId: "avatar-2",
            role: "member",
            kind: "human",
        } as const;
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [dm] }));
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond(
            "GET",
            "/v0/me",
            jsonResponse(200, {
                user: { id: "user-1", username: "me", firstName: "Me", role: "member" },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/members",
            jsonResponse(200, { users: [peer], memberships: [] }),
        );
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, {
                users: [{ ...peer, firstName: "Augusta", photoFileId: "avatar-3" }],
                presence: [],
                statuses: [],
            }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [{ ...dm, unreadCount: 1 }],
                removedChatIds: [],
                areas: ["users"],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        using state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        const first = state.sidebar().getState().chats[0];
        expect(first).toMatchObject({
            displayName: "Ada",
            avatarFileId: "avatar-2",
            participants: [{ id: "user-2" }],
        });
        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        const second = state.sidebar().getState().chats[0];
        expect(second?.chat.unreadCount).toBe(1);
        expect(second).toMatchObject({ displayName: "Augusta", avatarFileId: "avatar-3" });
        expect(second?.participants[0]).not.toBe(first?.participants[0]);
        expect(
            server.requests.filter(({ path }) => path === "/v0/chats/chat-1/members"),
        ).toHaveLength(1);
    });

    it("drops an initial chat completion after the final lease closes", async () => {
        const server = createFakeServer();
        let release!: () => void;
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.route("GET", "/v0/chats/chat-1/messages?limit=100", async () => {
            await new Promise<void>((resolve) => (release = resolve));
            return jsonResponse(200, { messages: [message()], hasMore: false, chatPts: "1" });
        });
        using state = happyStateCreate({ transport: server.transport });
        const handle = state.chatOpen("chat-1");
        await vi.waitFor(() => expect(release).toBeTypeOf("function"));
        const beforeRelease = handle.getState();
        handle[Symbol.dispose]();
        release();
        await state.whenIdle();
        expect(handle.getState()).toBe(beforeRelease);
        expect(handle.getState().status.type).toBe("loading");
        const reopened = state.chatOpen("chat-1");
        expect(reopened).not.toBe(handle);
        reopened[Symbol.dispose]();
    });

    it("keeps reaction actors absent until explicitly retained and shares sender references", async () => {
        const server = createFakeServer();
        const sender = {
            id: "user-2",
            username: "ada",
            firstName: "Ada",
            role: "member",
            kind: "human",
        } as const;
        const reacted = message({
            sender,
            reactions: [
                { key: "emoji:👍", emoji: "👍", count: 1, reacted: false, userIds: [sender.id] },
            ],
        });
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, {
                messages: [reacted, message({ id: "message-2", sequence: "2", sender })],
                hasMore: false,
                chatPts: "2",
            }),
        );
        server.respond("GET", "/v0/messages/message-1", jsonResponse(200, { message: reacted }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/members",
            jsonResponse(200, { users: [sender], memberships: [] }),
        );
        using state = happyStateCreate({ transport: server.transport });
        using handle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(handle.getState().messages[0]?.message.sender).toBe(
            handle.getState().messages[1]?.message.sender,
        );
        expect(handle.getState().reactionActors).toEqual({});
        expect(server.requests.some(({ path }) => path.endsWith("/members"))).toBe(false);
        handle.getState().reactionActorsRetain("message-1", "emoji:👍");
        await state.whenIdle();
        expect(handle.getState().reactionActors["message-1\u0000emoji:👍"]).toMatchObject({
            type: "ready",
            value: { actors: [{ id: "user-2", displayName: "Ada" }] },
        });
    });

    it("loads pins only when retained and refreshes that retained resource after pinning", async () => {
        const server = createFakeServer();
        const sender = {
            id: "user-2",
            username: "ada",
            firstName: "Ada",
            role: "member",
            kind: "human",
        } as const;
        const pinnedMessage = message({ sender });
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: chat() }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [pinnedMessage], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/pins",
            jsonResponse(200, {
                pins: [
                    {
                        id: "pin-1",
                        chatId: "chat-1",
                        message: pinnedMessage,
                        pinnedByUserId: "user-2",
                        createdAt: "2026-01-01T00:00:00.000Z",
                    },
                ],
            }),
        );
        server.respond("POST", "/v0/messages/message-1/pinMessage", jsonResponse(200, {}));
        using state = happyStateCreate({ transport: server.transport });
        using handle = state.chatOpen("chat-1");
        await state.whenIdle();
        expect(handle.getState().pins).toEqual({ type: "unloaded" });
        expect(server.requests.some(({ path }) => path.endsWith("/pins"))).toBe(false);
        handle.getState().pinsRetain();
        await state.whenIdle();
        expect(handle.getState().pins).toMatchObject({
            type: "ready",
            value: [{ message: { sender: { id: "user-2", displayName: "Ada" } } }],
        });
        const pins = handle.getState().pins;
        expect(pins.type === "ready" ? pins.value[0]?.message.sender : undefined).toBe(
            handle.getState().messages[0]?.message.sender,
        );
        await state.messagePin("chat-1", "message-1");
        await state.whenIdle();
        expect(server.requests.filter(({ path }) => path.endsWith("/pins"))).toHaveLength(2);
    });
});
