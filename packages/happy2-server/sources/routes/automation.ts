import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { automationCreate } from "../modules/automation/automationCreate.js";
import { automationDelete } from "../modules/automation/automationDelete.js";
import { automationList } from "../modules/automation/automationList.js";
import { automationRunNow } from "../modules/automation/automationRunNow.js";
import { automationRunWebhook } from "../modules/automation/automationRunWebhook.js";
import { automationUpdate } from "../modules/automation/automationUpdate.js";
import type { AutomationRuntime } from "../modules/automation/types.js";
import { CollaborationError, type MutationHint } from "../modules/chat/types.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { realtimeTopics, type PubSub } from "../modules/realtime/index.js";
import { scheduledMessageCancel } from "../modules/scheduled-message/scheduledMessageCancel.js";
import { scheduledMessageList } from "../modules/scheduled-message/scheduledMessageList.js";
import { scheduledMessageSchedule } from "../modules/scheduled-message/scheduledMessageSchedule.js";

const MAX_ID = 128;
const MAX_MESSAGE = 40_000;

export function registerAutomationRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    runtime: AutomationRuntime,
    pubsub: PubSub,
): void {
    app.get("/v0/scheduledMessages", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        return { messages: await scheduledMessageList(executor, userId) };
    });

    app.post("/v0/chats/:chatId/scheduleMessage", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, [
                "text",
                "attachmentFileIds",
                "scheduledFor",
                "timezone",
                "quotedMessageId",
                "threadRootMessageId",
                "clientMutationId",
            ]);
            const text = optionalString(body.text, "text", MAX_MESSAGE) ?? "";
            const attachmentFileIds = idArray(body.attachmentFileIds, 20);
            if (!text.trim() && attachmentFileIds.length === 0)
                throw new RequestError("A scheduled message requires text or an attachment");
            const scheduledFor = date(body.scheduledFor, "scheduledFor");
            if (Date.parse(scheduledFor) <= Date.now())
                throw new RequestError("scheduledFor must be in the future");
            const result = await scheduledMessageSchedule(executor, {
                actorUserId: userId,
                chatId: routeId(request, "chatId"),
                text,
                attachmentFileIds,
                scheduledFor,
                timezone: optionalString(body.timezone, "timezone", 100),
                quotedMessageId: optionalId(body.quotedMessageId, "quotedMessageId"),
                threadRootMessageId: optionalId(body.threadRootMessageId, "threadRootMessageId"),
                clientMutationId: optionalId(body.clientMutationId, "clientMutationId"),
            });
            if (result.hint) await publish(pubsub, result.hint);
            return reply.code(result.hint ? 201 : 200).send({
                message: result.message,
                sync: result.hint,
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/scheduledMessages/:messageId/cancelScheduledMessage", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            const hint = await scheduledMessageCancel(
                executor,
                userId,
                routeId(request, "messageId"),
            );
            await publish(pubsub, hint);
            return { cancelled: true, sync: hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/automations", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return { automations: await automationList(executor, userId) };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/automations/createAutomation", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, [
                "name",
                "chatId",
                "botId",
                "triggerType",
                "triggerConfig",
                "actionType",
                "actionConfig",
                "timezone",
                "nextRunAt",
            ]);
            const result = await automationCreate(executor, {
                actorUserId: userId,
                name: requiredString(body.name, "name", 200),
                chatId: optionalId(body.chatId, "chatId"),
                botId: optionalId(body.botId, "botId"),
                triggerType: enumeration(body.triggerType, "triggerType", [
                    "schedule",
                    "event",
                    "webhook",
                ] as const),
                triggerConfig: jsonObject(body.triggerConfig, "triggerConfig"),
                actionType: enumeration(body.actionType, "actionType", [
                    "send_message",
                    "call_webhook",
                    "moderate",
                ] as const),
                actionConfig: jsonObject(body.actionConfig, "actionConfig"),
                timezone: optionalString(body.timezone, "timezone", 100),
                nextRunAt:
                    body.nextRunAt === undefined ? undefined : date(body.nextRunAt, "nextRunAt"),
            });
            await publish(pubsub, result.hint);
            return reply.code(201).send({
                automation: result.automation,
                sync: result.hint,
                ...(result.webhookToken ? { webhookToken: result.webhookToken } : {}),
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/automations/:automationId/updateAutomation", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["active", "name", "triggerConfig", "actionConfig", "nextRunAt"]);
            const result = await automationUpdate(executor, {
                actorUserId: userId,
                automationId: routeId(request, "automationId"),
                active: optionalBoolean(body.active, "active"),
                name: optionalString(body.name, "name", 200),
                triggerConfig:
                    body.triggerConfig === undefined
                        ? undefined
                        : jsonObject(body.triggerConfig, "triggerConfig"),
                actionConfig:
                    body.actionConfig === undefined
                        ? undefined
                        : jsonObject(body.actionConfig, "actionConfig"),
                nextRunAt:
                    body.nextRunAt === undefined
                        ? undefined
                        : body.nextRunAt === null
                          ? null
                          : date(body.nextRunAt, "nextRunAt"),
            });
            await publish(pubsub, result.hint);
            return { automation: result.automation, sync: result.hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/automations/:automationId/deleteAutomation", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            const hint = await automationDelete(executor, userId, routeId(request, "automationId"));
            await publish(pubsub, hint);
            return { deleted: true, sync: hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/automations/:automationId/runAutomation", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = request.body === undefined ? {} : object(request.body);
            only(body, ["triggerEventId"]);
            const result = await automationRunNow(
                executor,
                runtime,
                userId,
                routeId(request, "automationId"),
                optionalId(body.triggerEventId, "triggerEventId"),
            );
            if (result.hint) await publish(pubsub, result.hint);
            return { runId: result.runId, sync: result.hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/automations/invokeWebhook", async (request, reply) => {
        try {
            emptyBody(request.body);
            const result = await automationRunWebhook(
                executor,
                runtime,
                automationWebhookToken(request),
                idempotencyKey(request),
            );
            if (result.hint) await publish(pubsub, result.hint);
            return reply.code(202).send({ runId: result.runId, sync: result.hint });
        } catch (error) {
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

async function publish(pubsub: PubSub, hint: MutationHint): Promise<void> {
    const event = { type: "sync" as const, ...hint };
    await Promise.all([
        pubsub.publish(realtimeTopics.server, event),
        ...hint.chats.map(({ chatId }) => pubsub.publish(realtimeTopics.chat(chatId), event)),
    ]);
}

function handled(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (error instanceof RequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    if (!(error instanceof CollaborationError)) return undefined;
    const status = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 }[
        error.code as "invalid" | "forbidden" | "not_found" | "conflict"
    ];
    return reply.code(status ?? 409).send({ error: error.code, message: error.message });
}

function object(value: unknown): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RequestError("Request body must be an object");
    return value as Record<string, unknown>;
}

function jsonObject(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RequestError(`${name} must be an object`);
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

function automationWebhookToken(request: FastifyRequest): string {
    const value = request.headers["x-happy2-automation-token"];
    if (typeof value !== "string" || !value)
        throw new CollaborationError("not_found", "Automation webhook was not found");
    return value;
}

function idempotencyKey(request: FastifyRequest): string | undefined {
    const value = request.headers["idempotency-key"];
    if (value === undefined) return undefined;
    if (typeof value !== "string") throw new RequestError("Idempotency-Key is invalid");
    return value;
}

function id(value: unknown, name: string): string {
    if (typeof value !== "string" || !value || value.length > MAX_ID || value.trim() !== value)
        throw new RequestError(`${name} must be a valid identifier`);
    return value;
}

function optionalId(value: unknown, name: string): string | undefined {
    return value === undefined ? undefined : id(value, name);
}

function idArray(value: unknown, maximum: number): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > maximum)
        throw new RequestError(`attachmentFileIds may contain at most ${maximum} ids`);
    const ids = value.map((entry) => id(entry, "attachmentFileIds"));
    if (new Set(ids).size !== ids.length)
        throw new RequestError("attachmentFileIds must not contain duplicates");
    return ids;
}

function requiredString(value: unknown, name: string, maximum: number): string {
    const result = optionalString(value, name, maximum)?.trim();
    if (!result) throw new RequestError(`${name} is required`);
    return result;
}

function optionalString(value: unknown, name: string, maximum: number): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || value.length > maximum)
        throw new RequestError(`${name} must be a string of at most ${maximum} characters`);
    return value;
}

function optionalBoolean(value: unknown, name: string): boolean | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "boolean") throw new RequestError(`${name} must be a boolean`);
    return value;
}

function date(value: unknown, name: string): string {
    if (typeof value !== "string" || !Number.isFinite(Date.parse(value)))
        throw new RequestError(`${name} must be an ISO date-time`);
    return new Date(value).toISOString();
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

class RequestError extends Error {}
