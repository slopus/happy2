import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { IntegrationRepository } from "../modules/integrations/repository.js";
import {
    IntegrationError,
    integrationScopes,
    type IntegrationChange,
    type IntegrationRouteCallbacks,
    type IntegrationScope,
} from "../modules/integrations/types.js";

const MAX_ID = 128;

export function registerIntegrationRoutes(
    app: FastifyInstance,
    auth: AuthService,
    integrations: IntegrationRepository,
    callbacks: IntegrationRouteCallbacks,
): void {
    app.get("/v0/admin/bots", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return { bots: await integrations.listBots(userId) };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/bots/createBot", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["name", "username", "description", "photoFileId", "ownerUserId"]);
            const result = await integrations.createBot({
                actorUserId: userId,
                name: requiredString(body.name, "name", 200),
                username: requiredString(body.username, "username", 32),
                description: optionalString(body.description, "description", 2_000),
                photoFileId: optionalId(body.photoFileId, "photoFileId"),
                ownerUserId: optionalId(body.ownerUserId, "ownerUserId"),
            });
            await notify(request, callbacks, result.change);
            return reply.code(201).send({ bot: result.value, sync: result.change });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/bots/:botId/updateBot", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["name", "username", "description", "photoFileId", "ownerUserId"]);
            const result = await integrations.updateBot({
                actorUserId: userId,
                botId: routeId(request, "botId"),
                name: optionalString(body.name, "name", 200),
                username: optionalString(body.username, "username", 32),
                description: nullableString(body.description, "description", 2_000),
                photoFileId: nullableId(body.photoFileId, "photoFileId"),
                ownerUserId: nullableId(body.ownerUserId, "ownerUserId"),
            });
            await notify(request, callbacks, result.change);
            return { bot: result.value, sync: result.change };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/bots/:botId/revokeBot", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            const change = await integrations.revokeBot(userId, routeId(request, "botId"));
            await notify(request, callbacks, change);
            return { revoked: true, sync: change };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/integrations", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return { integrations: await integrations.listIntegrations(userId) };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/createIntegration", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["kind", "name", "description", "botId", "scopes"]);
            const kind = enumeration(body.kind, "kind", ["app", "service_account"] as const);
            const result = await integrations.createIntegration({
                actorUserId: userId,
                kind,
                name: requiredString(body.name, "name", 200),
                description: optionalString(body.description, "description", 2_000),
                botId: optionalId(body.botId, "botId"),
                scopes: scopes(body.scopes),
            });
            await notify(request, callbacks, result.change);
            return reply.code(201).send({ integration: result.value, sync: result.change });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/:integrationId/revokeIntegration", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            const change = await integrations.revokeIntegration(
                userId,
                routeId(request, "integrationId"),
            );
            await notify(request, callbacks, change);
            return { revoked: true, sync: change };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/integrations/:integrationId/credentials", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return {
                credentials: await integrations.listApiCredentials(
                    userId,
                    routeId(request, "integrationId"),
                ),
            };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/:integrationId/createCredential", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            rejectIdempotencyForSecretIssuance(request);
            const body = object(request.body);
            only(body, ["name", "scopes", "expiresAt"]);
            const credential = await integrations.createApiCredential({
                actorUserId: userId,
                integrationId: routeId(request, "integrationId"),
                name: requiredString(body.name, "name", 200),
                scopes: body.scopes === undefined ? undefined : scopes(body.scopes),
                expiresAt: optionalDate(body.expiresAt, "expiresAt"),
            });
            return reply.code(201).send(credential);
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/credentials/:credentialId/revokeCredential", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            await integrations.revokeApiCredential(userId, routeId(request, "credentialId"));
            return { revoked: true };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/createIncomingWebhook", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            rejectIdempotencyForSecretIssuance(request);
            const body = object(request.body);
            only(body, ["name", "description", "botId", "chatId"]);
            const result = await integrations.createIncomingWebhook({
                actorUserId: userId,
                name: requiredString(body.name, "name", 200),
                description: optionalString(body.description, "description", 2_000),
                botId: id(body.botId, "botId"),
                chatId: id(body.chatId, "chatId"),
            });
            await notify(request, callbacks, result.change);
            return reply.code(201).send({ ...result.value, sync: result.change });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/createOutgoingWebhook", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            rejectIdempotencyForSecretIssuance(request);
            const body = object(request.body);
            only(body, ["name", "description", "url", "eventTypes", "chatId"]);
            const result = await integrations.createOutgoingWebhook({
                actorUserId: userId,
                name: requiredString(body.name, "name", 200),
                description: optionalString(body.description, "description", 2_000),
                url: requiredString(body.url, "url", 2_048),
                eventTypes: stringArray(body.eventTypes, "eventTypes", 50, 128),
                chatId: optionalId(body.chatId, "chatId"),
            });
            await notify(request, callbacks, result.change);
            return reply.code(201).send({ ...result.value, sync: result.change });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get(
        "/v0/admin/integrations/:integrationId/webhookSubscriptions",
        async (request, reply) => {
            const userId = await actor(auth, request, reply);
            if (!userId) return;
            try {
                return {
                    subscriptions: await integrations.listWebhookSubscriptions(
                        userId,
                        routeId(request, "integrationId"),
                    ),
                };
            } catch (error: unknown) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.get("/v0/admin/integrations/:integrationId/webhookDeliveries", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return {
                deliveries: await integrations.listWebhookDeliveries(
                    userId,
                    routeId(request, "integrationId"),
                    queryLimit(request),
                ),
            };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/integrations/createSlashCommand", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            rejectIdempotencyForSecretIssuance(request);
            const body = object(request.body);
            only(body, ["name", "description", "command", "usageHint", "handlerUrl", "botId"]);
            const result = await integrations.createSlashCommand({
                actorUserId: userId,
                name: requiredString(body.name, "name", 200),
                description: optionalString(body.description, "description", 500),
                command: requiredString(body.command, "command", 65),
                usageHint: optionalString(body.usageHint, "usageHint", 500),
                handlerUrl: requiredString(body.handlerUrl, "handlerUrl", 2_048),
                botId: optionalId(body.botId, "botId"),
            });
            await notify(request, callbacks, result.change);
            return reply.code(201).send({ ...result.value, sync: result.change });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/slashCommands", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return { commands: await integrations.listSlashCommands(userId) };
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/slashCommands/invoke", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["chatId", "command", "text"]);
            const delivery = await integrations.invokeSlashCommand({
                actorUserId: userId,
                chatId: id(body.chatId, "chatId"),
                command: requiredString(body.command, "command", 65),
                text: optionalString(body.text, "text", 20_000),
            });
            return reply.code(202).send({ delivery });
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/integrations/incomingWebhook", async (request, reply) => {
        try {
            const body = object(request.body);
            only(body, ["text"]);
            const result = await integrations.invokeIncomingWebhook(
                incomingWebhookToken(request),
                requiredString(body.text, "text", 40_000, false),
                callbacks.incomingWebhook,
                incomingIdempotencyKey(request),
            );
            return reply.code(201).send(result);
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/integrations/sendMessage", async (request, reply) => {
        try {
            const credential = await integrations.authenticateApiCredential(bearerToken(request), [
                "messages:write",
            ]);
            if (!credential)
                throw new IntegrationError("unauthorized", "API credential is invalid");
            if (!credential.botId)
                throw new IntegrationError(
                    "forbidden",
                    "Integration must have an active bot to send messages",
                );
            const body = object(request.body);
            only(body, ["chatId", "text", "attachmentFileIds"]);
            const text = optionalString(body.text, "text", 40_000) ?? "";
            const attachmentFileIds =
                body.attachmentFileIds === undefined
                    ? []
                    : stringArray(body.attachmentFileIds, "attachmentFileIds", 20, MAX_ID);
            if (!text.trim() && attachmentFileIds.length === 0)
                throw new RequestError("A message requires text or an attachment");
            const result = await callbacks.incomingWebhook.sendMessage({
                actorUserId: credential.actorUserId,
                integrationId: credential.integrationId,
                subscriptionId: `api:${credential.credentialId}`,
                botId: credential.botId,
                chatId: id(body.chatId, "chatId"),
                text,
                attachmentFileIds,
                idempotencyKey: incomingIdempotencyKey(request),
            });
            return reply.code(201).send(result);
        } catch (error: unknown) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });
}

async function actor(
    auth: AuthService,
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<string | undefined> {
    const current = await auth.authenticate(request);
    if (!current) {
        reply.code(401).send({ error: "unauthorized" });
        return undefined;
    }
    return current.user.id;
}

async function notify(
    request: FastifyRequest,
    callbacks: IntegrationRouteCallbacks,
    change: IntegrationChange,
): Promise<void> {
    if (!callbacks.onChange) return;
    try {
        await callbacks.onChange(change);
    } catch (error: unknown) {
        request.log.error(error, "Could not publish integration change");
    }
}

function handled(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (error instanceof RequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    if (!(error instanceof IntegrationError)) return undefined;
    const status = {
        invalid: 400,
        unauthorized: 401,
        forbidden: 403,
        not_found: 404,
        conflict: 409,
    }[error.code];
    return reply.code(status).send({ error: error.code, message: error.message });
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RequestError("Request body must be an object");
    return value as Record<string, unknown>;
}

function only(body: Record<string, unknown>, allowed: string[]): void {
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new RequestError(`Unexpected request field: ${unexpected}`);
}

function emptyBody(value: unknown): void {
    if (value === undefined || value === null) return;
    const body = object(value);
    if (Object.keys(body).length) throw new RequestError("Request body must be empty");
}

function routeId(request: FastifyRequest, key: string): string {
    return id((request.params as Record<string, unknown>)[key], key);
}

function id(value: unknown, name: string): string {
    if (typeof value !== "string" || !value || value.length > MAX_ID || value.trim() !== value)
        throw new RequestError(`${name} must be a valid identifier`);
    return value;
}

function optionalId(value: unknown, name: string): string | undefined {
    return value === undefined ? undefined : id(value, name);
}

function nullableId(value: unknown, name: string): string | null | undefined {
    return value === null ? null : optionalId(value, name);
}

function requiredString(value: unknown, name: string, maximum: number, trim = true): string {
    if (typeof value !== "string" || value.length > maximum)
        throw new RequestError(`${name} must be a string of at most ${maximum} characters`);
    const result = trim ? value.trim() : value;
    if (!result.trim()) throw new RequestError(`${name} is required`);
    return result;
}

function optionalString(value: unknown, name: string, maximum: number): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length > maximum)
        throw new RequestError(`${name} must be a string of at most ${maximum} characters`);
    return value;
}

function nullableString(value: unknown, name: string, maximum: number): string | null | undefined {
    return value === null ? null : optionalString(value, name, maximum);
}

function optionalDate(value: unknown, name: string): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        throw new RequestError(`${name} must be an ISO date-time`);
    return new Date(value).toISOString();
}

function stringArray(value: unknown, name: string, maximum: number, itemMaximum: number): string[] {
    if (
        !Array.isArray(value) ||
        value.length > maximum ||
        value.some((item) => typeof item !== "string" || item.length > itemMaximum)
    )
        throw new RequestError(`${name} must contain at most ${maximum} strings`);
    return value as string[];
}

function scopes(value: unknown): IntegrationScope[] {
    const values = stringArray(value, "scopes", integrationScopes.length, 64);
    if (values.some((scope) => !integrationScopes.includes(scope as IntegrationScope)))
        throw new RequestError("scopes contains an unsupported scope");
    if (new Set(values).size !== values.length)
        throw new RequestError("scopes must not contain duplicates");
    return values as IntegrationScope[];
}

function enumeration<const T extends readonly string[]>(
    value: unknown,
    name: string,
    values: T,
): T[number] {
    if (typeof value !== "string" || !values.includes(value))
        throw new RequestError(`${name} must be one of: ${values.join(", ")}`);
    return value as T[number];
}

function queryLimit(request: FastifyRequest): number {
    const value = (request.query as { limit?: unknown }).limit;
    if (value === undefined) return 100;
    const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : Number.NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 200)
        throw new RequestError("limit must be an integer between 1 and 200");
    return parsed;
}

function incomingWebhookToken(request: FastifyRequest): string {
    const value = request.headers["x-rigged-webhook-token"];
    if (typeof value !== "string" || !value)
        throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
    return value;
}

function bearerToken(request: FastifyRequest): string {
    const value = request.headers.authorization;
    const match = typeof value === "string" ? /^Bearer ([^\s]+)$/.exec(value) : null;
    if (!match) throw new IntegrationError("unauthorized", "API credential is invalid");
    return match[1]!;
}

function incomingIdempotencyKey(request: FastifyRequest): string | undefined {
    const value = request.headers["idempotency-key"];
    if (value === undefined) return undefined;
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 200 ||
        !/^[\x21-\x7e]+$/.test(value)
    )
        throw new RequestError("Idempotency-Key must contain 1-200 visible ASCII characters");
    return value;
}

function rejectIdempotencyForSecretIssuance(request: FastifyRequest): void {
    if (request.headers["idempotency-key"] !== undefined)
        throw new RequestError("Idempotency-Key is not accepted when a one-time secret is issued");
}

class RequestError extends Error {}
