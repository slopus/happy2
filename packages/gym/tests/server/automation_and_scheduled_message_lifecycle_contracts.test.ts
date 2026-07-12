import { describe, expect, it } from "vitest";
import { createGymServer, type GymRequestClient } from "../../sources/index.js";

describe("automation and scheduled message lifecycle contracts", () => {
    it("keeps scheduled messages owner-scoped, idempotent, cancellable, and durable across restart", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "scheduled_admin", firstName: "Admin" });
        const member = await server.createUser({
            username: "scheduled_member",
            firstName: "Member",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Scheduled drafts",
            slug: "scheduled-drafts",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        const adminDraft = await asAdmin.post(`/v0/chats/${chatId}/scheduleMessage`, {
            text: "Admin-only scheduled draft",
            scheduledFor: future(24 * 60 * 60_000),
            timezone: "America/Los_Angeles",
            clientMutationId: "scheduled-admin-draft",
        });
        expect(adminDraft.statusCode).toBe(201);
        const adminDraftId = adminDraft.json().message.id as string;
        expect(adminDraft.json().message).toMatchObject({
            id: adminDraftId,
            chatId,
            text: "Admin-only scheduled draft",
            status: "scheduled",
            timezone: "America/Los_Angeles",
        });
        const retriedAdminDraft = await asAdmin.post(`/v0/chats/${chatId}/scheduleMessage`, {
            text: "The idempotent retry must return the original scheduled draft",
            scheduledFor: future(48 * 60 * 60_000),
            timezone: "America/Los_Angeles",
            clientMutationId: "scheduled-admin-draft",
        });
        expect(retriedAdminDraft.statusCode).toBe(200);
        expect(retriedAdminDraft.json().message.id).toBe(adminDraftId);
        expect((await asMember.get("/v0/scheduledMessages")).json().messages).not.toEqual(
            expect.arrayContaining([expect.objectContaining({ id: adminDraftId })]),
        );
        expect(
            (await asMember.post(`/v0/scheduledMessages/${adminDraftId}/cancelScheduledMessage`))
                .statusCode,
        ).toBe(404);

        const memberDraft = await asMember.post(`/v0/chats/${chatId}/scheduleMessage`, {
            text: "Member cancellable scheduled draft",
            scheduledFor: future(72 * 60 * 60_000),
        });
        expect(memberDraft.statusCode).toBe(201);
        const memberDraftId = memberDraft.json().message.id as string;
        expect((await asMember.get("/v0/scheduledMessages")).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: memberDraftId, status: "scheduled" }),
            ]),
        );
        expect(
            (await asMember.post(`/v0/scheduledMessages/${memberDraftId}/cancelScheduledMessage`))
                .statusCode,
        ).toBe(200);
        expect((await asMember.get("/v0/scheduledMessages")).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: memberDraftId, status: "cancelled" }),
            ]),
        );
        expect(
            (await asMember.post(`/v0/scheduledMessages/${memberDraftId}/cancelScheduledMessage`))
                .statusCode,
        ).toBe(404);

        await server.restart();

        expect((await asAdmin.get("/v0/scheduledMessages")).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: adminDraftId, status: "scheduled" }),
            ]),
        );
        expect((await asMember.get("/v0/scheduledMessages")).json().messages).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: memberDraftId, status: "cancelled" }),
            ]),
        );
    });

    it("lets administrators update, disable, run idempotently, and delete schedule automations", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "automation_admin", firstName: "Admin" });
        const member = await server.createUser({
            username: "automation_member",
            firstName: "Member",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Automation lifecycle",
            slug: "automation-lifecycle",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        expect((await asMember.get("/v0/admin/automations")).statusCode).toBe(403);
        expect(
            (
                await asMember.post("/v0/admin/automations/createAutomation", {
                    name: "Member automation",
                    chatId,
                    triggerType: "schedule",
                    triggerConfig: {},
                    actionType: "send_message",
                    actionConfig: { text: "not allowed" },
                    nextRunAt: future(60_000),
                })
            ).statusCode,
        ).toBe(403);

        const created = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Lifecycle schedule",
            chatId,
            triggerType: "schedule",
            triggerConfig: { intervalSeconds: 120 },
            actionType: "send_message",
            actionConfig: { text: "Original scheduled automation output" },
            timezone: "UTC",
            nextRunAt: future(24 * 60 * 60_000),
        });
        expect(created.statusCode).toBe(201);
        const automationId = created.json().automation.id as string;
        expect((await asAdmin.get("/v0/admin/automations")).json().automations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: automationId,
                    triggerType: "schedule",
                    actionType: "send_message",
                    active: true,
                }),
            ]),
        );
        const updated = await asAdmin.post(
            `/v0/admin/automations/${automationId}/updateAutomation`,
            {
                name: "Updated lifecycle schedule",
                triggerConfig: { intervalSeconds: 180 },
                actionConfig: { text: "Updated scheduled automation output" },
                nextRunAt: future(48 * 60 * 60_000),
            },
        );
        expect(updated.statusCode).toBe(200);
        expect(updated.json().automation).toMatchObject({
            id: automationId,
            name: "Updated lifecycle schedule",
            triggerConfig: { intervalSeconds: 180 },
            actionConfig: { text: "Updated scheduled automation output" },
        });

        await server.restart();

        expect((await asAdmin.get("/v0/admin/automations")).json().automations).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: automationId, name: "Updated lifecycle schedule" }),
            ]),
        );
        expect(
            (
                await asAdmin.post(`/v0/admin/automations/${automationId}/updateAutomation`, {
                    active: false,
                })
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await asAdmin.post(`/v0/admin/automations/${automationId}/runAutomation`, {
                    triggerEventId: "manual-disabled-run",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asAdmin.post(`/v0/admin/automations/${automationId}/updateAutomation`, {
                    active: true,
                })
            ).statusCode,
        ).toBe(200);
        const firstRun = await asAdmin.post(`/v0/admin/automations/${automationId}/runAutomation`, {
            triggerEventId: "manual-lifecycle-run",
        });
        expect(firstRun.statusCode).toBe(200);
        const repeatedRun = await asAdmin.post(
            `/v0/admin/automations/${automationId}/runAutomation`,
            {
                triggerEventId: "manual-lifecycle-run",
            },
        );
        expect(repeatedRun.statusCode).toBe(200);
        expect(repeatedRun.json().runId).toBe(firstRun.json().runId);
        const messages = await asMember.get(`/v0/chats/${chatId}/messages`);
        expect(
            messages
                .json()
                .messages.filter(
                    (message: { text: string }) =>
                        message.text === "Updated scheduled automation output",
                ),
        ).toHaveLength(1);
        expect(
            (await asAdmin.post(`/v0/admin/automations/${automationId}/deleteAutomation`))
                .statusCode,
        ).toBe(200);
        expect(
            (await asAdmin.get("/v0/admin/automations"))
                .json()
                .automations.map((automation: { id: string }) => automation.id),
        ).not.toContain(automationId);
        expect(
            (await asAdmin.post(`/v0/admin/automations/${automationId}/runAutomation`)).statusCode,
        ).toBe(404);
    });

    it("does not retrigger an event automation from its own automated message", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "trigger_admin", firstName: "Admin" });
        const member = await server.createUser({ username: "trigger_member", firstName: "Member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Automation triggers",
            slug: "automation-triggers",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const eventAutomation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Respond to user messages",
            chatId,
            triggerType: "event",
            triggerConfig: { event: "message.created" },
            actionType: "send_message",
            actionConfig: { text: "Event automation output" },
        });
        expect(eventAutomation.statusCode).toBe(201);

        await server.restart();

        const trigger = await asMember.post(`/v0/chats/${chatId}/sendMessage`, {
            text: "A human event should trigger exactly one automated response.",
        });
        expect(trigger.statusCode).toBe(201);
        await expectMessagesEventually(asMember, chatId, "Event automation output", 1);
        await new Promise((resolve) => setTimeout(resolve, 1_250));
        expect(await messageCount(asMember, chatId, "Event automation output")).toBe(1);
    });

    it("preserves webhook tokens across restart and revokes them on disable or deletion", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            username: "webhook_trigger_admin",
            firstName: "Admin",
        });
        const member = await server.createUser({
            username: "webhook_trigger_member",
            firstName: "Member",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Webhook automation triggers",
            slug: "webhook-automation-triggers",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);
        const webhookAutomation = await asAdmin.post("/v0/admin/automations/createAutomation", {
            name: "Authenticated webhook automation",
            chatId,
            triggerType: "webhook",
            triggerConfig: {},
            actionType: "send_message",
            actionConfig: { text: "Webhook automation output" },
        });
        expect(webhookAutomation.statusCode).toBe(201);
        const webhookAutomationId = webhookAutomation.json().automation.id as string;
        const webhookToken = webhookAutomation.json().webhookToken as string;
        expect(webhookToken).toMatch(/^rgd_auto_/);
        expect(webhookAutomation.json().automation.triggerConfig).not.toHaveProperty("tokenHash");
        expect(JSON.stringify((await asAdmin.get("/v0/admin/automations")).json())).not.toContain(
            webhookToken,
        );

        await server.restart();

        expect(
            (
                await server.post("/v0/automations/invokeWebhook", undefined, {
                    headers: { "x-rigged-automation-token": "rgd_auto_not_a_real_token" },
                })
            ).statusCode,
        ).toBe(404);
        const webhookHeaders = {
            "x-rigged-automation-token": webhookToken,
            "idempotency-key": "webhook-trigger-once",
        };
        const firstWebhook = await server.post("/v0/automations/invokeWebhook", undefined, {
            headers: webhookHeaders,
        });
        const repeatedWebhook = await server.post("/v0/automations/invokeWebhook", undefined, {
            headers: webhookHeaders,
        });
        expect(firstWebhook.statusCode).toBe(202);
        expect(repeatedWebhook.statusCode).toBe(202);
        expect(repeatedWebhook.json().runId).toBe(firstWebhook.json().runId);
        await expectMessagesEventually(asMember, chatId, "Webhook automation output", 1);

        expect(
            (
                await asAdmin.post(
                    `/v0/admin/automations/${webhookAutomationId}/updateAutomation`,
                    {
                        active: false,
                    },
                )
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await server.post("/v0/automations/invokeWebhook", undefined, {
                    headers: webhookHeaders,
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asAdmin.post(
                    `/v0/admin/automations/${webhookAutomationId}/updateAutomation`,
                    {
                        active: true,
                        triggerConfig: {},
                    },
                )
            ).statusCode,
        ).toBe(200);
        const reenabledWebhook = await server.post("/v0/automations/invokeWebhook", undefined, {
            headers: {
                "x-rigged-automation-token": webhookToken,
                "idempotency-key": "webhook-trigger-after-reenable",
            },
        });
        expect(reenabledWebhook.statusCode).toBe(202);
        await expectMessagesEventually(asMember, chatId, "Webhook automation output", 2);
        expect(
            (await asAdmin.post(`/v0/admin/automations/${webhookAutomationId}/deleteAutomation`))
                .statusCode,
        ).toBe(200);
        expect(
            (
                await server.post("/v0/automations/invokeWebhook", undefined, {
                    headers: webhookHeaders,
                })
            ).statusCode,
        ).toBe(404);
    });
});

function future(milliseconds: number): string {
    return new Date(Date.now() + milliseconds).toISOString();
}

async function expectMessagesEventually(
    client: GymRequestClient,
    chatId: string,
    text: string,
    expectedCount: number,
): Promise<void> {
    for (let attempt = 0; attempt < 30; attempt += 1) {
        const response = await client.get(`/v0/chats/${chatId}/messages`);
        const count = response
            .json()
            .messages.filter((message: { text: string }) => message.text === text).length;
        if (count === expectedCount) return;
        await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Timed out waiting for ${expectedCount} copies of ${text}`);
}

async function messageCount(
    client: GymRequestClient,
    chatId: string,
    text: string,
): Promise<number> {
    return (await client.get(`/v0/chats/${chatId}/messages`))
        .json()
        .messages.filter((message: { text: string }) => message.text === text).length;
}
