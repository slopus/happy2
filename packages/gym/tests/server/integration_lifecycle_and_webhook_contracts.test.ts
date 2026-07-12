import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("integration lifecycle and webhook contracts", () => {
    it("narrows credential authority, revokes bots and credentials, and preserves automated message identity", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "lifecycle_admin", firstName: "Admin" });
        const member = await server.createUser({
            username: "lifecycle_member",
            firstName: "Member",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Integration lifecycle",
            slug: "integration-lifecycle",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        expect((await asMember.get("/v0/admin/bots")).statusCode).toBe(403);
        const createdBot = await asAdmin.post("/v0/admin/bots/createBot", {
            name: "Release Bot",
            username: "release_bot",
            description: "Posts deployment messages",
            ownerUserId: member.id,
        });
        expect(createdBot.statusCode).toBe(201);
        const botId = createdBot.json().bot.id as string;
        expect(createdBot.json().bot).toMatchObject({
            id: botId,
            name: "Release Bot",
            username: "release_bot",
            description: "Posts deployment messages",
            ownerUserId: member.id,
            active: true,
        });
        const updatedBot = await asAdmin.post(`/v0/admin/bots/${botId}/updateBot`, {
            name: "Release Coordinator",
            username: "release_coordinator",
            description: null,
            ownerUserId: null,
        });
        expect(updatedBot.statusCode).toBe(200);
        expect(updatedBot.json().bot).toMatchObject({
            id: botId,
            name: "Release Coordinator",
            username: "release_coordinator",
            active: true,
        });
        expect(updatedBot.json().bot).not.toHaveProperty("description");
        expect(updatedBot.json().bot).not.toHaveProperty("ownerUserId");
        expect((await asAdmin.get("/v0/admin/bots")).json().bots).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: botId, active: true })]),
        );

        const integration = await asAdmin.post("/v0/admin/integrations/createIntegration", {
            kind: "service_account",
            name: "Release service",
            description: "Limited release automation",
            botId,
            scopes: ["messages:read", "messages:write"],
        });
        expect(integration.statusCode).toBe(201);
        const integrationId = integration.json().integration.id as string;
        expect(integration.json().integration).toMatchObject({
            id: integrationId,
            kind: "service_account",
            botId,
            scopes: ["messages:read", "messages:write"],
            active: true,
        });

        const readOnly = await asAdmin.post(
            `/v0/admin/integrations/${integrationId}/createCredential`,
            { name: "Read-only release token", scopes: ["messages:read"] },
        );
        expect(readOnly.statusCode).toBe(201);
        expect(readOnly.json().credential.scopes).toEqual(["messages:read"]);
        expect(
            (
                await server.post(
                    "/v0/integrations/sendMessage",
                    { chatId, text: "This write must be denied" },
                    { headers: credentialHeaders(readOnly.json().token as string) },
                )
            ).statusCode,
        ).toBe(401);
        const broadened = await asAdmin.post(
            `/v0/admin/integrations/${integrationId}/createCredential`,
            { name: "Out-of-scope token", scopes: ["users:read"] },
        );
        expect(broadened.statusCode).toBe(403);
        expect(broadened.json()).toMatchObject({ error: "forbidden" });

        const writeCredential = await asAdmin.post(
            `/v0/admin/integrations/${integrationId}/createCredential`,
            { name: "Write release token", scopes: ["messages:write"] },
        );
        expect(writeCredential.statusCode).toBe(201);
        const writeToken = writeCredential.json().token as string;
        const sent = await server.post(
            "/v0/integrations/sendMessage",
            { chatId, text: "Credential-backed release update" },
            { headers: credentialHeaders(writeToken) },
        );
        expect(sent.statusCode).toBe(201);
        const sentMessageId = sent.json().messageId as string;
        const memberMessage = await asMember.get(`/v0/messages/${sentMessageId}`);
        expect(memberMessage.statusCode).toBe(200);
        expect(memberMessage.json().message).toMatchObject({
            id: sentMessageId,
            kind: "automated",
            text: "Credential-backed release update",
            senderBot: { id: botId, username: "release_coordinator" },
        });
        const listedCredentials = await asAdmin.get(
            `/v0/admin/integrations/${integrationId}/credentials`,
        );
        expect(listedCredentials.statusCode).toBe(200);
        expect(JSON.stringify(listedCredentials.json())).not.toContain(writeToken);
        expect(listedCredentials.json().credentials).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    id: readOnly.json().credential.id,
                    scopes: ["messages:read"],
                }),
                expect.objectContaining({
                    id: writeCredential.json().credential.id,
                    scopes: ["messages:write"],
                }),
            ]),
        );
        expect(
            (
                await asAdmin.post(
                    `/v0/admin/credentials/${writeCredential.json().credential.id as string}/revokeCredential`,
                )
            ).statusCode,
        ).toBe(200);
        expect(
            (
                await server.post(
                    "/v0/integrations/sendMessage",
                    { chatId, text: "Revoked credential must not post" },
                    { headers: credentialHeaders(writeToken) },
                )
            ).statusCode,
        ).toBe(401);

        const botRevocationCredential = await asAdmin.post(
            `/v0/admin/integrations/${integrationId}/createCredential`,
            { name: "Token revoked with bot", scopes: ["messages:write"] },
        );
        expect(botRevocationCredential.statusCode).toBe(201);
        const botRevocationToken = botRevocationCredential.json().token as string;
        expect(
            (
                await server.post(
                    "/v0/integrations/sendMessage",
                    { chatId, text: "Posts before bot revocation" },
                    { headers: credentialHeaders(botRevocationToken) },
                )
            ).statusCode,
        ).toBe(201);
        const administratorMessage = await asAdmin.post("/v0/admin/sendAutomatedMessage", {
            chatId,
            text: "Administrator-issued bot message",
            botId,
        });
        expect(administratorMessage.statusCode).toBe(201);
        expect(administratorMessage.json().message).toMatchObject({
            kind: "automated",
            senderBot: { id: botId },
        });

        const revokedBot = await asAdmin.post(`/v0/admin/bots/${botId}/revokeBot`);
        expect(revokedBot.statusCode).toBe(200);
        expect(revokedBot.json().revoked).toBe(true);
        expect((await asAdmin.get("/v0/admin/bots")).json().bots).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: botId, active: false })]),
        );
        expect((await asAdmin.get("/v0/admin/integrations")).json().integrations).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: integrationId, active: false })]),
        );
        expect(
            (
                await server.post(
                    "/v0/integrations/sendMessage",
                    { chatId, text: "Revoked bot must not post" },
                    { headers: credentialHeaders(botRevocationToken) },
                )
            ).statusCode,
        ).toBe(401);
        expect(
            (
                await asAdmin.post("/v0/admin/sendAutomatedMessage", {
                    chatId,
                    text: "Inactive bot must not post",
                    botId,
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (await asAdmin.get(`/v0/admin/integrations/${integrationId}/credentials`))
                .json()
                .credentials.find(
                    (credential: { id: string }) =>
                        credential.id === (botRevocationCredential.json().credential.id as string),
                ),
        ).toMatchObject({ revokedAt: expect.any(String) });
    });

    it("registers safe outgoing webhook subscriptions and deactivates them with their integration", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "webhook_admin", firstName: "Admin" });
        const member = await server.createUser({ username: "webhook_member", firstName: "Member" });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Webhook events",
            slug: "webhook-events",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        expect(
            (
                await asMember.post("/v0/admin/integrations/createOutgoingWebhook", {
                    name: "Member callback",
                    url: "https://hooks.example.com/member",
                    eventTypes: ["message.created"],
                })
            ).statusCode,
        ).toBe(403);
        for (const url of ["https://127.0.0.1/events", "http://hooks.example.com/events"]) {
            const rejected = await asAdmin.post("/v0/admin/integrations/createOutgoingWebhook", {
                name: "Unsafe callback",
                url,
                eventTypes: ["message.created"],
            });
            expect(rejected.statusCode).toBe(400);
            expect(rejected.json()).toMatchObject({ error: "invalid" });
        }

        const created = await asAdmin.post("/v0/admin/integrations/createOutgoingWebhook", {
            name: "Safe release callback",
            description: "Receives release events",
            url: "https://hooks.example.com/events?environment=gym",
            eventTypes: ["message.created", "chat.updated"],
            chatId,
        });
        expect(created.statusCode).toBe(201);
        const integrationId = created.json().integration.id as string;
        const subscriptionId = created.json().subscription.id as string;
        const signingSecret = created.json().signingSecret as string;
        expect(created.json()).toMatchObject({
            integration: {
                id: integrationId,
                kind: "outgoing_webhook",
                scopes: ["events:read"],
                active: true,
            },
            subscription: {
                id: subscriptionId,
                integrationId,
                direction: "outgoing",
                chatId,
                url: "https://hooks.example.com/events?environment=gym",
                eventTypes: ["chat.updated", "message.created"],
                active: true,
            },
        });
        expect(signingSecret).toMatch(/^rgd_sign_/);
        const listed = await asAdmin.get(
            `/v0/admin/integrations/${integrationId}/webhookSubscriptions`,
        );
        expect(listed.statusCode).toBe(200);
        expect(listed.json().subscriptions).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: subscriptionId, active: true })]),
        );
        expect(JSON.stringify(listed.json())).not.toContain(signingSecret);
        expect(
            (await asAdmin.get(`/v0/admin/integrations/${integrationId}/webhookDeliveries`)).json()
                .deliveries,
        ).toEqual([]);

        expect(
            (await asAdmin.post(`/v0/admin/integrations/${integrationId}/revokeIntegration`))
                .statusCode,
        ).toBe(200);
        expect((await asAdmin.get("/v0/admin/integrations")).json().integrations).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: integrationId, active: false })]),
        );
        expect(
            (
                await asAdmin.get(`/v0/admin/integrations/${integrationId}/webhookSubscriptions`)
            ).json().subscriptions,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: subscriptionId, active: false }),
            ]),
        );
        expect(
            (
                await asAdmin.post(`/v0/admin/integrations/${integrationId}/createCredential`, {
                    name: "Credential after revocation",
                })
            ).statusCode,
        ).toBe(404);

        await server.restart();

        expect((await asAdmin.get("/v0/admin/integrations")).json().integrations).toEqual(
            expect.arrayContaining([expect.objectContaining({ id: integrationId, active: false })]),
        );
        expect(
            (
                await asAdmin.get(`/v0/admin/integrations/${integrationId}/webhookSubscriptions`)
            ).json().subscriptions,
        ).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: subscriptionId, active: false }),
            ]),
        );
    });

    it("queues slash commands only for chat members and removes them on integration revocation", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({ username: "slash_admin", firstName: "Admin" });
        const member = await server.createUser({ username: "slash_member", firstName: "Member" });
        const outsider = await server.createUser({
            username: "slash_outsider",
            firstName: "Outsider",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);
        const asOutsider = server.as(outsider);
        const channel = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Slash command room",
            slug: "slash-command-room",
        });
        expect(channel.statusCode).toBe(201);
        const chatId = channel.json().chat.id as string;
        expect(
            (await asAdmin.post(`/v0/chats/${chatId}/addMember`, { userId: member.id })).statusCode,
        ).toBe(200);

        const created = await asAdmin.post("/v0/admin/integrations/createSlashCommand", {
            name: "Deploy command",
            description: "Deploy a service",
            command: "/deploy-gym",
            usageHint: "/deploy-gym api",
            handlerUrl: "https://hooks.example.com/commands",
        });
        expect(created.statusCode).toBe(201);
        const integrationId = created.json().integration.id as string;
        const commandId = created.json().command.id as string;
        const signingSecret = created.json().signingSecret as string;
        expect(created.json()).toMatchObject({
            integration: {
                id: integrationId,
                kind: "slash_command",
                scopes: ["commands:receive"],
                active: true,
            },
            command: { id: commandId, command: "/deploy-gym", active: true },
        });
        expect(signingSecret).toMatch(/^rgd_sign_/);
        expect((await asMember.get("/v0/slashCommands")).json().commands).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: commandId, command: "/deploy-gym", active: true }),
            ]),
        );
        expect(
            (
                await asOutsider.post("/v0/slashCommands/invoke", {
                    chatId,
                    command: "/deploy-gym",
                    text: "api",
                })
            ).statusCode,
        ).toBe(404);
        const invoked = await asMember.post("/v0/slashCommands/invoke", {
            chatId,
            command: "/deploy-gym",
            text: "api",
        });
        expect(invoked.statusCode).toBe(202);
        expect(invoked.json().delivery).toMatchObject({ status: "pending", attempts: 0 });
        const subscriptions = await asAdmin.get(
            `/v0/admin/integrations/${integrationId}/webhookSubscriptions`,
        );
        expect(subscriptions.statusCode).toBe(200);
        expect(subscriptions.json().subscriptions).toEqual(
            expect.arrayContaining([
                expect.objectContaining({
                    direction: "outgoing",
                    active: true,
                    eventTypes: [expect.stringMatching(`^slash_command:${commandId}$`)],
                }),
            ]),
        );
        const deliveries = await asAdmin.get(
            `/v0/admin/integrations/${integrationId}/webhookDeliveries`,
        );
        expect(deliveries.statusCode).toBe(200);
        expect(deliveries.json().deliveries).toEqual(
            expect.arrayContaining([
                expect.objectContaining({ id: invoked.json().delivery.id, status: "pending" }),
            ]),
        );

        expect(
            (await asAdmin.post(`/v0/admin/integrations/${integrationId}/revokeIntegration`))
                .statusCode,
        ).toBe(200);
        expect(
            (await asMember.get("/v0/slashCommands"))
                .json()
                .commands.map((command: { id: string }) => command.id),
        ).not.toContain(commandId);
        expect(
            (
                await asMember.post("/v0/slashCommands/invoke", {
                    chatId,
                    command: "/deploy-gym",
                    text: "api",
                })
            ).statusCode,
        ).toBe(404);
        expect(
            (
                await asAdmin.get(`/v0/admin/integrations/${integrationId}/webhookSubscriptions`)
            ).json().subscriptions,
        ).toEqual(expect.arrayContaining([expect.objectContaining({ active: false })]));
    });
});

function credentialHeaders(token: string): Record<string, string> {
    return { authorization: `Bearer ${token}` };
}
