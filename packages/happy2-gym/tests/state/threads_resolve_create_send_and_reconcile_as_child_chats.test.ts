import { happyStateCreate } from "happy2-state";
import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";
import { createGymStateTransport } from "../../sources/state/index.js";

describe("threads resolve, create, send, and reconcile as child chats", () => {
    it("crosses the real server through one resolver and one retained ordinary child ChatStore", async () => {
        await using server = await createGymServer();
        const owner = await server.createUser({ username: "state_thread_owner" });
        const member = await server.createUser({ username: "state_thread_member" });
        const ownerClient = server.as(owner);
        const memberClient = server.as(member);
        const parentResponse = await ownerClient.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "State thread boundary",
            slug: "state-thread-boundary",
        });
        expect(parentResponse.statusCode).toBe(201);
        const parentChatId = parentResponse.json().chat.id as string;
        expect(
            (await ownerClient.post(`/v0/chats/${parentChatId}/addMember`, { userId: member.id }))
                .statusCode,
        ).toBe(200);
        const rootResponse = await ownerClient.post(`/v0/chats/${parentChatId}/sendMessage`, {
            text: "A real thread root",
        });
        expect(rootResponse.statusCode).toBe(201);
        const rootMessageId = rootResponse.json().message.id as string;

        const transport = await createGymStateTransport(server, owner);
        const backgroundErrors: string[] = [];
        await using state = happyStateCreate({
            transport,
            sleep: async () => undefined,
            backgroundError: (error) => backgroundErrors.push(error.message),
        });
        await state.syncStart();
        await transport.whenConnected();
        using parent = state.chatOpen(parentChatId);
        await state.whenIdle();
        expect(parent.getState().messages.map((item) => item.message.id)).toContain(rootMessageId);

        using thread = state.threadOpen(parentChatId, rootMessageId);
        await state.whenIdle();
        expect(thread.getState().resolution).toEqual({ type: "absent" });
        expect(thread.childChat()).toBeUndefined();
        expect((await ownerClient.get(`/v0/messages/${rootMessageId}/thread`)).statusCode).toBe(
            404,
        );

        const observedDeliveries: string[] = [];
        let childUnsubscribe: (() => void) | undefined;
        const resolverUnsubscribe = thread.subscribe(() => {
            const child = thread.childChat();
            if (!child || childUnsubscribe) return;
            const record = () => {
                for (const item of child.getState().messages) {
                    if (!observedDeliveries.includes(item.delivery))
                        observedDeliveries.push(item.delivery);
                }
            };
            record();
            childUnsubscribe = child.subscribe(record);
        });
        thread.getState().replyDraftUpdate("First reply through HappyState");
        thread.getState().replySubmit();
        expect(thread.getState()).toMatchObject({
            create: { type: "pending" },
            draft: "First reply through HappyState",
        });
        await state.whenIdle();

        const resolution = thread.getState().resolution;
        expect(resolution.type).toBe("ready");
        if (resolution.type !== "ready") throw new Error("The thread did not resolve.");
        const childChatId = resolution.childChatId;
        const child = thread.childChat();
        expect(child).toBeDefined();
        expect(thread.getState()).toMatchObject({ create: { type: "idle" }, draft: "" });
        expect(observedDeliveries).toEqual(expect.arrayContaining(["sending", "sent"]));
        expect(child!.getState().messages).toEqual([
            expect.objectContaining({
                delivery: "sent",
                message: expect.objectContaining({
                    chatId: childChatId,
                    text: "First reply through HappyState",
                }),
            }),
        ]);
        expect(
            (await ownerClient.get(`/v0/messages/${rootMessageId}/thread`)).json().chat,
        ).toMatchObject({
            id: childChatId,
            parentMessageId: rootMessageId,
            followed: true,
        });
        expect(
            state
                .sidebar()
                .getState()
                .chats.some((projection) => projection.id === childChatId),
        ).toBe(false);

        const threads = state.threads();
        await state.whenIdle();
        expect(threads.getState().threads).toMatchObject({
            type: "ready",
            value: [
                {
                    chat: { id: childChatId, parentMessageId: rootMessageId, followed: true },
                    root: { id: rootMessageId, chatId: parentChatId, threadReplyCount: 1 },
                },
            ],
        });

        const externalReply = await memberClient.post(`/v0/chats/${childChatId}/sendMessage`, {
            text: "Realtime reply from another member",
        });
        expect(externalReply.statusCode).toBe(201);
        const externalReplyId = externalReply.json().message.id as string;
        await expect
            .poll(
                () =>
                    child!.getState().messages.find((item) => item.message.id === externalReplyId),
                { timeout: 5_000 },
            )
            .toMatchObject({
                delivery: "sent",
                message: { text: "Realtime reply from another member" },
            });
        await expect
            .poll(
                () => {
                    const value = threads.getState().threads;
                    return value.type === "ready" ? value.value[0]?.root.threadReplyCount : -1;
                },
                { timeout: 5_000 },
            )
            .toBe(2);
        expect(
            state
                .sidebar()
                .getState()
                .chats.some((projection) => projection.id === childChatId),
        ).toBe(false);

        threads.getState().threadReadMark(childChatId);
        await state.whenIdle();
        expect(threads.getState().threads).toMatchObject({
            type: "ready",
            value: [{ chat: { id: childChatId, unreadCount: 0 } }],
        });
        threads.getState().threadFollowSet(childChatId, false);
        await state.whenIdle();
        expect(threads.getState().threads).toEqual({ type: "ready", value: [] });
        expect((await ownerClient.get("/v0/threads?limit=100")).json().threads).toEqual([]);
        expect(backgroundErrors).toEqual([]);

        resolverUnsubscribe();
        childUnsubscribe?.();
    }, 20_000);
});
