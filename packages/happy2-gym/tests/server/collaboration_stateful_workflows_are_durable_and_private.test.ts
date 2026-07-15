import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("stateful collaboration workflows", () => {
    it("covers unread state, mentions, editing, threads, lifecycle, calls, and automation", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            username: "admin_user",
            firstName: "Admin",
        });
        const member = await server.createUser({
            username: "member_user",
            firstName: "Member",
        });
        const third = await server.createUser({
            username: "third_user",
            firstName: "Third",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        const idempotent = await asAdmin.post(
            "/v0/chats/createChannel",
            { kind: "public_channel", name: "Idempotent", slug: "idempotent" },
            { headers: { "idempotency-key": "create-idempotent-channel" } },
        );
        const replayed = await asAdmin.post(
            "/v0/chats/createChannel",
            { kind: "public_channel", name: "Idempotent", slug: "idempotent" },
            { headers: { "idempotency-key": "create-idempotent-channel" } },
        );
        expect(replayed.headers["idempotency-replayed"]).toBe("true");
        expect(replayed.json().chat.id).toBe(idempotent.json().chat.id);
        expect(
            (
                await asAdmin.post(
                    "/v0/chats/createChannel",
                    { kind: "public_channel", name: "Different", slug: "different" },
                    { headers: { "idempotency-key": "create-idempotent-channel" } },
                )
            ).statusCode,
        ).toBe(409);

        const created = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Backend",
            slug: "backend",
        });
        expect(created.statusCode).toBe(201);
        const chatId = created.json().chat.id as string;
        await expectOk(asAdmin, `/v0/chats/${chatId}/addMember`, { userId: member.id });

        const sent = await asAdmin.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "Please review this, @member_user",
            clientMutationId: "mention-one",
        });
        expect(sent.statusCode).toBe(201);
        const messageId = sent.json().message.id as string;
        expect(sent.json().message.mentions).toEqual([
            expect.objectContaining({ kind: "user", userId: member.id, rawText: "@member_user" }),
        ]);

        const memberChats = await asMember.get("/v0/chats");
        expect(chat(memberChats.json().chats, chatId)).toMatchObject({
            unreadCount: 1,
            mentionCount: 1,
        });
        const notifications = await asMember.get("/v0/notifications?unreadOnly=true");
        expect(notifications.json().notifications).toEqual([
            expect.objectContaining({ kind: "mention", messageId }),
        ]);
        const read = await asMember.post(`/v0/chats/${chatId}/markRead`, { messageId });
        expect(read.json().chat).toMatchObject({ unreadCount: 0, mentionCount: 0 });

        const edited = await asAdmin.post(`/v0/messages/${messageId}/editMessage`, {
            text: "Please review the updated backend, @member_user",
            expectedRevision: 1,
        });
        expect(edited.statusCode).toBe(200);
        expect(edited.json().message).toMatchObject({ revision: 2, editedAt: expect.any(String) });
        const revisions = await asAdmin.get(`/v0/messages/${messageId}/revisions`);
        expect(
            revisions.json().revisions.map((item: { revision: number }) => item.revision),
        ).toEqual([2, 1]);

        const reply = await asMember.post(`/v0/messages/${messageId}/sendThreadMessage`, {
            text: "Reviewed in the separate thread timeline",
        });
        expect(reply.statusCode).toBe(201);
        const threads = await asAdmin.get("/v0/threads");
        expect(threads.json().threads[0]).toMatchObject({
            root: { id: messageId },
            replyCount: 1,
            participantCount: 1,
            unreadCount: 1,
        });

        await expectOk(asMember, `/v0/messages/${messageId}/pinMessage`);
        const pins = await asAdmin.get(`/v0/chats/${chatId}/pins`);
        expect(pins.json().pins[0].message.id).toBe(messageId);
        const bookmark = await asMember.post(`/v0/chats/${chatId}/createBookmark`, {
            kind: "link",
            title: "Runbook",
            url: "https://example.com/runbook",
        });
        expect(bookmark.statusCode).toBe(201);
        expect((await asAdmin.get(`/v0/chats/${chatId}/bookmarks`)).json().bookmarks).toHaveLength(
            1,
        );

        const group = await asAdmin.post("/v0/chats/createGroupDirectMessage", {
            userIds: [member.id, third.id],
            name: "Launch group",
        });
        expect(group.statusCode).toBe(201);
        expect(group.json().chat).toMatchObject({ kind: "dm", dmType: "group" });

        const call = await asAdmin.post(`/v0/chats/${chatId}/createCall`, {
            kind: "video",
            invitedUserIds: [member.id],
        });
        expect(call.statusCode).toBe(201);
        const callId = call.json().call.id as string;
        expect((await asMember.post(`/v0/calls/${callId}/joinCall`)).json().call.status).toBe(
            "active",
        );
        expect(
            (await asAdmin.post(`/v0/calls/${callId}/endCall`, { reason: "complete" })).json().call
                .status,
        ).toBe("ended");

        const status = await asMember.post("/v0/me/updateStatus", {
            availability: "dnd",
            customStatusText: "Focusing",
            customStatusEmoji: "🛠️",
        });
        expect(status.json().status).toMatchObject({
            availability: "dnd",
            customStatusText: "Focusing",
        });

        const automation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Release notice",
            chatId,
            triggerType: "event",
            triggerConfig: { event: "release" },
            actionType: "send_message",
            actionConfig: { text: "Automated release notice" },
        });
        expect(automation.statusCode).toBe(201);
        const automationId = automation.json().automation.id as string;
        expect(
            (await asAdmin.post(`/v0/admin/automations/${automationId}/runAutomation`)).statusCode,
        ).toBe(200);
        const eventAutomation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Message observer",
            chatId,
            triggerType: "event",
            triggerConfig: { event: "message.created" },
            actionType: "send_message",
            actionConfig: { text: "Event-driven notice" },
        });
        expect(eventAutomation.statusCode).toBe(201);
        expect(
            (await asMember.post(`/v0/chats/${chatId}/sendMessage`, { text: "Trigger event" }))
                .statusCode,
        ).toBe(201);
        await expectMessageEventually(asMember, chatId, "Event-driven notice");
        const webhookAutomation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "External release hook",
            chatId,
            triggerType: "webhook",
            triggerConfig: {},
            actionType: "send_message",
            actionConfig: { text: "Webhook-driven notice" },
        });
        expect(webhookAutomation.statusCode).toBe(201);
        expect(webhookAutomation.json().webhookToken).toMatch(/^happy2_auto_/);
        expect(webhookAutomation.json().automation.triggerConfig).not.toHaveProperty("tokenHash");
        const webhookHeaders = {
            "x-happy2-automation-token": webhookAutomation.json().webhookToken as string,
            "idempotency-key": "external-release-1",
        };
        const firstWebhookRun = await server.post("/v0/automations/invokeWebhook", undefined, {
            headers: webhookHeaders,
        });
        const replayedWebhookRun = await server.post("/v0/automations/invokeWebhook", undefined, {
            headers: webhookHeaders,
        });
        expect(firstWebhookRun.statusCode).toBe(202);
        expect(replayedWebhookRun.json().runId).toBe(firstWebhookRun.json().runId);
        const messages = await asMember.get(`/v0/chats/${chatId}/messages`);
        expect(
            messages
                .json()
                .messages.some(
                    (message: { text: string }) => message.text === "Automated release notice",
                ),
        ).toBe(true);
        expect(
            messages
                .json()
                .messages.filter(
                    (message: { text: string }) => message.text === "Webhook-driven notice",
                ),
        ).toHaveLength(1);

        const updated = await asAdmin.post(`/v0/chats/${chatId}/updateChannel`, {
            name: "Backend Platform",
            slug: "backend-platform",
            topic: "Durable collaboration",
        });
        expect(updated.json().chat).toMatchObject({
            name: "Backend Platform",
            slug: "backend-platform",
            topic: "Durable collaboration",
        });
        await expectOk(asAdmin, `/v0/chats/${chatId}/archiveChannel`, { reason: "maintenance" });
        expect(
            (await asMember.post(`/v0/chats/${chatId}/sendMessage`, { text: "blocked" }))
                .statusCode,
        ).toBe(403);
        await expectOk(asAdmin, `/v0/chats/${chatId}/unarchiveChannel`);

        const search = await asMember.get("/v0/search?q=relase&limit=2");
        expect(search.statusCode).toBe(200);
        expect(
            search.json().results.some((result: { type: string }) => result.type === "message"),
        ).toBe(true);
    });
});

async function expectMessageEventually(
    client: GymRequestClient,
    chatId: string,
    expectedText: string,
): Promise<void> {
    for (let attempt = 0; attempt < 25; attempt += 1) {
        const response = await client.get(`/v0/chats/${chatId}/messages`);
        if (
            response
                .json()
                .messages.some((message: { text: string }) => message.text === expectedText)
        )
            return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for message: ${expectedText}`);
}

async function expectOk(
    client: GymRequestClient,
    url: string,
    payload?: Record<string, unknown>,
): Promise<void> {
    const response = await client.post(url, payload);
    expect(response.statusCode).toBe(200);
}

function chat(chats: Array<{ id: string }>, id: string) {
    return chats.find((item) => item.id === id);
}
