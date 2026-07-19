import { describe, expect, it } from "vitest";
import { happyStateCreate } from "../src/index.js";
import { createFakeServer, jsonResponse } from "../src/testing/index.js";
import { chat, message } from "./fixtures.js";

function serverCreate() {
    const server = createFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: "2026-01-01T00:00:00.000Z" }),
    );
    return server;
}

function childChat(overrides = {}) {
    return chat({
        id: "thread-chat",
        kind: "private_channel",
        name: "Thread",
        parentMessageId: "root-message",
        followed: true,
        ...overrides,
    });
}

describe("thread child chats stay out of the sidebar while retained threads reconcile", () => {
    it("loads a direct-linked root and reconciles realtime replies only into the child ChatStore", async () => {
        const server = serverCreate();
        const parent = chat({
            id: "parent-chat",
            kind: "public_channel",
            name: "Architecture",
            slug: "architecture",
            isListed: true,
        });
        const root = message({ id: "root-message", chatId: parent.id, text: "Root context" });
        const child = childChat({ pts: "1", lastMessageSequence: "1" });
        const firstReply = message({
            id: "reply-1",
            chatId: child.id,
            sequence: "1",
            changePts: "1",
            text: "Initial reply",
        });
        const realtimeReply = message({
            id: "reply-2",
            chatId: child.id,
            sequence: "2",
            changePts: "2",
            text: "Realtime reply",
        });
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [parent] }));
        server.respond("GET", `/v0/chats/${parent.id}`, jsonResponse(200, { chat: parent }));
        server.respond(
            "GET",
            `/v0/chats/${parent.id}/messages?limit=100`,
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
        server.respond(
            "GET",
            `/v0/messages/${root.id}`,
            jsonResponse(200, { message: root }),
            jsonResponse(200, { message: root }),
            jsonResponse(200, {
                message: { ...root, changePts: "2", threadReplyCount: 2 },
            }),
        );
        server.respond("GET", `/v0/messages/${root.id}/thread`, jsonResponse(200, { chat: child }));
        server.respond("GET", `/v0/chats/${child.id}`, jsonResponse(200, { chat: child }));
        server.respond(
            "GET",
            `/v0/chats/${child.id}/messages?limit=100`,
            jsonResponse(200, { messages: [firstReply], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [childChat({ pts: "2", lastMessageSequence: "2", unreadCount: 1 })],
                removedChatIds: [],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "POST",
            `/v0/chats/${child.id}/getDifference`,
            jsonResponse(200, {
                kind: "difference",
                updates: [],
                messages: [realtimeReply],
                chat: childChat({ pts: "2", lastMessageSequence: "2", unreadCount: 1 }),
                state: { membershipEpoch: "1", pts: "2" },
                targetState: { membershipEpoch: "1", pts: "2" },
            }),
        );
        server.respond(
            "GET",
            "/v0/threads?limit=100",
            jsonResponse(200, { threads: [child] }),
            jsonResponse(200, {
                threads: [childChat({ pts: "2", lastMessageSequence: "2", unreadCount: 1 })],
            }),
        );

        using state = happyStateCreate({ transport: server.transport, retry: { attempts: 1 } });
        await state.syncStart();
        using parentHandle = state.chatOpen(parent.id);
        await state.whenIdle();
        using thread = state.threadOpen(parent.id, root.id);
        await state.whenIdle();

        expect(parentHandle.getState().messages.map((item) => item.message.id)).toEqual([root.id]);
        expect(thread.getState().resolution).toEqual({
            type: "ready",
            childChatId: child.id,
        });
        expect(
            thread
                .childChat()
                ?.getState()
                .messages.map((item) => item.message.text),
        ).toEqual(["Initial reply"]);
        expect(
            state
                .sidebar()
                .getState()
                .chats.map((item) => item.id),
        ).toEqual([parent.id]);
        expect(
            server.requests.find(({ path }) => path.includes(`/messages/${root.id}/thread`))?.path,
        ).toBe(`/v0/messages/${root.id}/thread`);
        const threads = state.threads();
        await state.whenIdle();
        expect(threads.getState().threads).toMatchObject({
            type: "ready",
            value: [{ chat: { id: child.id }, root: { id: root.id, threadReplyCount: 0 } }],
        });

        server.events.sync({ sequence: "1", chats: [{ chatId: child.id, pts: "2" }] });
        await state.whenIdle();

        expect(
            thread
                .childChat()
                ?.getState()
                .messages.map((item) => item.message.text),
        ).toEqual(["Initial reply", "Realtime reply"]);
        expect(
            state
                .sidebar()
                .getState()
                .chats.map((item) => item.id),
        ).toEqual([parent.id]);
        expect(threads.getState().threads).toMatchObject({
            type: "ready",
            value: [
                {
                    chat: { id: child.id, unreadCount: 1 },
                    root: { id: root.id, threadReplyCount: 2 },
                },
            ],
        });
    });

    it("keeps one mutation identity through create and send retries while surfacing child load failure", async () => {
        const server = serverCreate();
        const parent = chat({ id: "parent-chat" });
        const root = message({ id: "root-message", chatId: parent.id });
        const child = childChat();
        const confirmed = message({
            id: "reply-1",
            chatId: child.id,
            sequence: "1",
            changePts: "1",
            text: "Retry this reply",
        });
        server.respond("GET", `/v0/chats/${parent.id}`, jsonResponse(200, { chat: parent }));
        server.respond(
            "GET",
            `/v0/chats/${parent.id}/messages?limit=100`,
            jsonResponse(200, { messages: [root], hasMore: false, chatPts: "1" }),
        );
        server.respond(
            "GET",
            `/v0/messages/${root.id}/thread`,
            jsonResponse(404, { error: "not_found", message: "Thread was not found" }),
        );
        server.respond(
            "POST",
            `/v0/messages/${root.id}/createThread`,
            jsonResponse(503, { error: "unavailable", message: "Create failed" }),
            jsonResponse(201, { chat: child }),
        );
        server.respond(
            "GET",
            `/v0/chats/${child.id}`,
            jsonResponse(503, { error: "unavailable", message: "Child load failed" }),
            jsonResponse(200, { chat: child }),
        );
        server.respond(
            "GET",
            `/v0/chats/${child.id}/messages?limit=100`,
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
        server.respond(
            "POST",
            `/v0/chats/${child.id}/sendMessage`,
            jsonResponse(503, { error: "unavailable", message: "Send failed" }),
            jsonResponse(200, { message: confirmed }),
        );

        using state = happyStateCreate({
            transport: server.transport,
            retry: { attempts: 1 },
            createId: () => "mutation-1",
        });
        using parentHandle = state.chatOpen(parent.id);
        await state.whenIdle();
        using thread = state.threadOpen(parent.id, root.id);
        await state.whenIdle();
        expect(thread.getState().resolution).toEqual({ type: "absent" });

        thread.getState().replyDraftUpdate("Retry this reply");
        thread.getState().replySubmit();
        await state.whenIdle();
        expect(thread.getState()).toMatchObject({
            resolution: { type: "absent" },
            draft: "Retry this reply",
            create: { type: "error", clientMutationId: "mutation-1" },
        });

        thread.getState().threadCreateRetry();
        await state.whenIdle();
        expect(thread.getState()).toMatchObject({
            resolution: { type: "ready", childChatId: child.id },
            draft: "",
            create: { type: "idle" },
        });
        const failedChild = thread.childChat()?.getState();
        expect(failedChild?.status.type).toBe("error");
        expect(failedChild?.status.type === "error" ? failedChild.status.error.message : "").toBe(
            "Child load failed",
        );
        expect(failedChild?.messages[0]).toMatchObject({
            clientMutationId: "mutation-1",
            delivery: "failed",
        });
        expect(failedChild?.messages[0]?.error?.message).toBe("Send failed");

        thread.getState().childChatLoadRetry();
        await state.whenIdle();
        expect(thread.childChat()?.getState().status.type).toBe("ready");
        thread.getState().replyRetry("mutation-1");
        await state.whenIdle();
        expect(thread.childChat()?.getState().messages).toEqual([
            expect.objectContaining({
                clientMutationId: "mutation-1",
                delivery: "sent",
                message: expect.objectContaining({ id: confirmed.id, text: confirmed.text }),
            }),
        ]);

        const creates = server.requests.filter(({ path }) => path.endsWith("/createThread"));
        const sends = server.requests.filter(({ path }) => path.endsWith("/sendMessage"));
        expect(creates).toHaveLength(2);
        expect(sends).toHaveLength(2);
        expect(creates.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "mutation-1",
            "mutation-1",
        ]);
        expect(sends.map(({ headers }) => headers?.["idempotency-key"])).toEqual([
            "mutation-1",
            "mutation-1",
        ]);
    });
});
