import { describe, expect, it } from "vitest";
import { createGymServer } from "../../sources/index.js";

describe("integration HTTP API", () => {
    it("lets administrators manage integrations and keeps incoming hooks scoped and idempotent", async () => {
        await using server = await createGymServer();
        const admin = await server.createUser({
            email: "integration-admin@example.com",
            username: "integration_admin",
            firstName: "Admin",
        });
        const member = await server.createUser({
            email: "integration-member@example.com",
            username: "integration_member",
            firstName: "Member",
        });
        const asAdmin = server.as(admin);
        const asMember = server.as(member);

        const channelResponse = await asAdmin.post("/v0/chats/createChannel", {
            kind: "private_channel",
            name: "Deployments",
            slug: "deployments",
        });
        expect(channelResponse.statusCode).toBe(201);
        const chatId = channelResponse.json().chat.id as string;
        expect(
            (
                await asAdmin.post(`/v0/chats/${chatId}/addMember`, {
                    userId: member.id,
                })
            ).statusCode,
        ).toBe(200);

        const forbidden = await asMember.post("/v0/admin/bots/createBot", {
            name: "Forbidden Bot",
            username: "forbidden_bot",
        });
        expect(forbidden.statusCode).toBe(403);

        const botResponse = await asAdmin.post("/v0/admin/bots/createBot", {
            name: "Deploy Bot",
            username: "deploy_bot",
        });
        expect(botResponse.statusCode).toBe(201);
        const botId = botResponse.json().bot.id as string;

        const appResponse = await asAdmin.post("/v0/admin/integrations/createIntegration", {
            kind: "service_account",
            name: "Deployment service",
            botId,
            scopes: ["messages:read", "messages:write"],
        });
        expect(appResponse.statusCode).toBe(201);
        const appId = appResponse.json().integration.id as string;
        const credentialResponse = await asAdmin.post(
            `/v0/admin/integrations/${appId}/createCredential`,
            { name: "Deployment credential", scopes: ["messages:write"] },
        );
        expect(credentialResponse.statusCode).toBe(201);
        const credential = credentialResponse.json();
        expect(credential.token).toMatch(/^happy2_api_/);
        expect(credential.credential).not.toHaveProperty("tokenHash");

        const listedCredentials = await asAdmin.get(`/v0/admin/integrations/${appId}/credentials`);
        expect(listedCredentials.statusCode).toBe(200);
        expect(JSON.stringify(listedCredentials.json())).not.toContain(credential.token);
        expect(listedCredentials.json().credentials[0]).not.toHaveProperty("tokenHash");

        const apiHeaders = {
            authorization: `Bearer ${credential.token as string}`,
            "idempotency-key": "deployment-api-event-1",
        };
        const apiDelivery = await server.post(
            "/v0/integrations/sendMessage",
            { chatId, text: "Deployment started" },
            { headers: apiHeaders },
        );
        const replayedApiDelivery = await server.post(
            "/v0/integrations/sendMessage",
            { chatId, text: "Deployment started" },
            { headers: apiHeaders },
        );
        expect(apiDelivery.statusCode).toBe(201);
        expect(replayedApiDelivery.statusCode).toBe(201);
        expect(replayedApiDelivery.json().messageId).toBe(apiDelivery.json().messageId);

        expect(
            (await server.post("/v0/integrations/sendMessage", { chatId, text: "No credential" }))
                .statusCode,
        ).toBe(401);

        const unsafeOutgoing = await asAdmin.post("/v0/admin/integrations/createOutgoingWebhook", {
            name: "Unsafe callback",
            url: "https://127.0.0.1/events",
            eventTypes: ["message.created"],
        });
        expect(unsafeOutgoing.statusCode).toBe(400);

        const hookResponse = await asAdmin.post("/v0/admin/integrations/createIncomingWebhook", {
            name: "Deployment hook",
            botId,
            chatId,
        });
        expect(hookResponse.statusCode).toBe(201);
        const hook = hookResponse.json();
        expect(hook.token).toMatch(/^happy2_hook_/);
        expect(hook.subscription).not.toHaveProperty("tokenHash");

        const incomingHeaders = {
            "x-happy2-webhook-token": hook.token as string,
            "idempotency-key": "deployment-event-42",
        };
        const firstDelivery = await server.post(
            "/v0/integrations/incomingWebhook",
            { text: "Deployment completed" },
            { headers: incomingHeaders },
        );
        const replayedDelivery = await server.post(
            "/v0/integrations/incomingWebhook",
            { text: "Deployment completed" },
            { headers: incomingHeaders },
        );
        expect(firstDelivery.statusCode).toBe(201);
        expect(replayedDelivery.statusCode).toBe(201);
        expect(replayedDelivery.json().messageId).toBe(firstDelivery.json().messageId);

        const messages = await asMember.get(`/v0/chats/${chatId}/messages`);
        expect(messages.statusCode).toBe(200);
        const webhookMessages = messages
            .json()
            .messages.filter(
                (message: { text: string }) => message.text === "Deployment completed",
            );
        expect(webhookMessages).toHaveLength(1);
        expect(webhookMessages[0]).toMatchObject({
            kind: "automated",
            senderBot: { id: botId },
        });

        const integrations = await asAdmin.get("/v0/admin/integrations");
        expect(integrations.statusCode).toBe(200);
        expect(JSON.stringify(integrations.json())).not.toContain(hook.token);
        expect(JSON.stringify(integrations.json())).not.toContain(credential.token);

        const slashResponse = await asAdmin.post("/v0/admin/integrations/createSlashCommand", {
            name: "Deploy command",
            command: "/deploy",
            description: "Deploy a service",
            usageHint: "/deploy api",
            handlerUrl: "https://hooks.example.com/slash",
            botId,
        });
        expect(slashResponse.statusCode).toBe(201);
        expect(slashResponse.json().signingSecret).toMatch(/^happy2_sign_/);
        const slashIntegrationId = slashResponse.json().integration.id as string;
        const commands = await asMember.get("/v0/slashCommands");
        expect(commands.statusCode).toBe(200);
        expect(commands.json().commands).toContainEqual(
            expect.objectContaining({ command: "/deploy", active: true }),
        );
        const invocation = await asMember.post("/v0/slashCommands/invoke", {
            chatId,
            command: "/deploy",
            text: "api",
        });
        expect(invocation.statusCode).toBe(202);
        expect(invocation.json().delivery).toMatchObject({ status: "pending", attempts: 0 });
        const commandDeliveries = await asAdmin.get(
            `/v0/admin/integrations/${slashIntegrationId}/webhookDeliveries`,
        );
        expect(commandDeliveries.statusCode).toBe(200);
        expect(commandDeliveries.json().deliveries).toContainEqual(
            expect.objectContaining({ id: invocation.json().delivery.id }),
        );

        expect(
            (await asAdmin.post(`/v0/admin/integrations/${appId}/revokeIntegration`)).statusCode,
        ).toBe(200);
        expect(
            (await asAdmin.get("/v0/admin/integrations"))
                .json()
                .integrations.find((integration: { id: string }) => integration.id === appId),
        ).toMatchObject({ active: false });
    });
});
