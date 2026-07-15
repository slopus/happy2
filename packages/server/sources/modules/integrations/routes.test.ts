import Fastify from "fastify";
import { describe, expect, it, vi } from "vitest";
import type { AuthService } from "../auth/service.js";
import { registerIntegrationRoutes } from "../../routes/integrations.js";
import type { IntegrationRepository } from "./repository.js";
import type { IntegrationChange, IntegrationRouteCallbacks } from "./types.js";

describe("integration HTTP routes", () => {
    it("requires a product user and maps admin creation results", async () => {
        const change: IntegrationChange = {
            sequence: "8",
            kind: "bot.created",
            entityId: "bot_1",
        };
        const repository = fakeRepository({
            createBot: vi.fn(async () => ({
                value: {
                    id: "bot_1",
                    name: "Build Bot",
                    username: "build_bot",
                    active: true,
                    createdAt: "2026-01-01T00:00:00.000Z",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
                change,
            })),
        });
        const onChange = vi.fn(async () => {});
        const app = buildRouteServer(repository, { incomingWebhook: sink(), onChange });

        expect(
            (
                await app.inject({
                    method: "POST",
                    url: "/v0/admin/bots/createBot",
                    payload: { name: "Build Bot", username: "build_bot" },
                })
            ).statusCode,
        ).toBe(401);
        const created = await app.inject({
            method: "POST",
            url: "/v0/admin/bots/createBot",
            headers: { "x-test-user": "admin_1" },
            payload: { name: "Build Bot", username: "build_bot" },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({ bot: { id: "bot_1" }, sync: change });
        expect(repository.createBot).toHaveBeenCalledWith({
            actorUserId: "admin_1",
            name: "Build Bot",
            username: "build_bot",
            description: undefined,
            photoFileId: undefined,
            ownerUserId: undefined,
        });
        expect(onChange).toHaveBeenCalledWith(change);
        await app.close();
    });

    it("returns credentials once and rejects unexpected fields", async () => {
        const repository = fakeRepository({
            createApiCredential: vi.fn(async () => ({
                credential: {
                    id: "credential_1",
                    integrationId: "integration_1",
                    name: "CI",
                    tokenPrefix: "happy2_api_abc",
                    scopes: ["messages:write"],
                    createdAt: "2026-01-01T00:00:00.000Z",
                },
                token: "happy2_api_secret_returned_once",
            })),
        });
        const app = buildRouteServer(repository);
        const created = await app.inject({
            method: "POST",
            url: "/v0/admin/integrations/integration_1/createCredential",
            headers: { "x-test-user": "admin_1" },
            payload: { name: "CI", scopes: ["messages:write"] },
        });
        expect(created.statusCode).toBe(201);
        expect(created.json()).toMatchObject({
            token: "happy2_api_secret_returned_once",
            credential: { id: "credential_1" },
        });

        const unsafeSecretCache = await app.inject({
            method: "POST",
            url: "/v0/admin/integrations/integration_1/createCredential",
            headers: { "x-test-user": "admin_1", "idempotency-key": "do-not-cache-secret" },
            payload: { name: "CI", scopes: ["messages:write"] },
        });
        expect(unsafeSecretCache.statusCode).toBe(400);
        expect(repository.createApiCredential).toHaveBeenCalledTimes(1);

        const invalid = await app.inject({
            method: "POST",
            url: "/v0/admin/integrations/integration_1/createCredential",
            headers: { "x-test-user": "admin_1" },
            payload: { name: "CI", secret: "must-not-be-accepted" },
        });
        expect(invalid.statusCode).toBe(400);
        expect(invalid.json()).toMatchObject({ error: "invalid_request" });
        await app.close();
    });

    it("accepts incoming webhook secrets only in the dedicated header", async () => {
        const incomingWebhook = sink();
        const invokeIncomingWebhook = vi.fn(
            async (
                token: string,
                text: string,
                callback: IntegrationRouteCallbacks["incomingWebhook"],
                idempotencyKey?: string,
            ) =>
                callback.sendMessage({
                    actorUserId: "admin_1",
                    integrationId: "integration_1",
                    subscriptionId: "subscription_1",
                    botId: "bot_1",
                    chatId: "chat_1",
                    text: `${token}:${text}`,
                    idempotencyKey,
                }),
        );
        const repository = fakeRepository({ invokeIncomingWebhook });
        const app = buildRouteServer(repository, { incomingWebhook });

        const missing = await app.inject({
            method: "POST",
            url: "/v0/integrations/incomingWebhook",
            payload: { text: "hello" },
        });
        expect(missing.statusCode).toBe(401);

        const accepted = await app.inject({
            method: "POST",
            url: "/v0/integrations/incomingWebhook",
            headers: {
                "x-happy2-webhook-token": "happy2_hook_secret",
                "idempotency-key": "deploy-event-42",
            },
            payload: { text: "hello" },
        });
        expect(accepted.statusCode).toBe(201);
        expect(accepted.json()).toEqual({ messageId: "message_1" });
        expect(invokeIncomingWebhook).toHaveBeenCalledWith(
            "happy2_hook_secret",
            "hello",
            incomingWebhook,
            "deploy-event-42",
        );
        expect(incomingWebhook.sendMessage).toHaveBeenCalledWith(
            expect.objectContaining({
                botId: "bot_1",
                chatId: "chat_1",
                text: "happy2_hook_secret:hello",
                idempotencyKey: "deploy-event-42",
            }),
        );

        const invalidKey = await app.inject({
            method: "POST",
            url: "/v0/integrations/incomingWebhook",
            headers: {
                "x-happy2-webhook-token": "happy2_hook_secret",
                "idempotency-key": "contains spaces",
            },
            payload: { text: "hello" },
        });
        expect(invalidKey.statusCode).toBe(400);
        await app.close();
    });
});

function buildRouteServer(
    repository: IntegrationRepository,
    callbacks: IntegrationRouteCallbacks = { incomingWebhook: sink() },
) {
    const app = Fastify({ logger: false });
    const auth = {
        authenticate: vi.fn(async (request: { headers: Record<string, unknown> }) => {
            const userId = request.headers["x-test-user"];
            return typeof userId === "string" ? { user: { id: userId } } : undefined;
        }),
    } as unknown as AuthService;
    registerIntegrationRoutes(app, auth, repository, callbacks);
    return app;
}

function sink(): IntegrationRouteCallbacks["incomingWebhook"] {
    return { sendMessage: vi.fn(async () => ({ messageId: "message_1" })) };
}

function fakeRepository(overrides: Record<string, unknown>): IntegrationRepository {
    return overrides as unknown as IntegrationRepository;
}
