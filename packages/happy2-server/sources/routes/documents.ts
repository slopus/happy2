import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError, type MutationHint } from "../modules/chat/types.js";
import { documentApplyUpdates } from "../modules/document/documentApplyUpdates.js";
import { documentCreate } from "../modules/document/documentCreate.js";
import { documentDelete } from "../modules/document/documentDelete.js";
import { documentGet } from "../modules/document/documentGet.js";
import { documentGetDifference } from "../modules/document/documentGetDifference.js";
import { documentList } from "../modules/document/documentList.js";
import { documentPresenceList } from "../modules/document/documentPresenceList.js";
import { documentPresenceUpdate } from "../modules/document/documentPresenceUpdate.js";
import { documentRename } from "../modules/document/documentRename.js";
import { DocumentPresenceTracker } from "../modules/document/presenceTracker.js";
import {
    DOCUMENT_DIFFERENCE_DEFAULT_LIMIT,
    DOCUMENT_DIFFERENCE_MAX_LIMIT,
    DOCUMENT_FORMATS,
    type DocumentFormat,
} from "../modules/document/types.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import {
    assertRealtimeEvent,
    realtimeTopics,
    type DocumentPresenceEvent,
    type DocumentUpdatedEvent,
    type PubSub,
} from "../modules/realtime/index.js";

const MAX_ID = 128;

export function registerDocumentRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    pubsub: PubSub,
): void {
    const presenceTracker = new DocumentPresenceTracker();

    app.get("/v0/chats/:chatId/documents", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return { documents: await documentList(executor, userId, routeId(request, "chatId")) };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/chats/:chatId/createDocument", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["title", "format", "initialUpdate"]);
            const result = await documentCreate(executor, {
                actorUserId: userId,
                chatId: routeId(request, "chatId"),
                title: optionalString(body.title, "title") ?? "",
                format: documentFormat(body.format),
                initialUpdate: optionalString(body.initialUpdate, "initialUpdate", 1_000_000),
            });
            await publish(pubsub, result.hint);
            return reply.code(201).send({ document: result.document, sync: result.hint });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/documents/:documentId", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return await documentGet(executor, userId, routeId(request, "documentId"));
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/documents/:documentId/applyUpdates", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["clientUpdateId", "updates"]);
            const result = await documentApplyUpdates(executor, {
                actorUserId: userId,
                documentId: routeId(request, "documentId"),
                clientUpdateId: id(body.clientUpdateId, "clientUpdateId"),
                updates: updateArray(body.updates),
            });
            if (!result.replayed) {
                const event: DocumentUpdatedEvent = {
                    type: "document.updated",
                    chatId: result.document.chatId,
                    documentId: result.document.id,
                    sequence: result.acceptedSequence,
                    occurredAt: Date.now(),
                };
                assertRealtimeEvent(event);
                await pubsub.publish(realtimeTopics.chat(result.document.chatId), event);
            }
            return reply.code(result.replayed ? 200 : 201).send(result);
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/documents/:documentId/getDifference", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["afterSequence", "limit"]);
            return await documentGetDifference(executor, {
                actorUserId: userId,
                documentId: routeId(request, "documentId"),
                afterSequence: sequenceNumber(body.afterSequence, "afterSequence"),
                limit:
                    optionalPositiveInteger(body.limit, "limit", DOCUMENT_DIFFERENCE_MAX_LIMIT) ??
                    DOCUMENT_DIFFERENCE_DEFAULT_LIMIT,
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/documents/:documentId/rename", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["title"]);
            const result = await documentRename(executor, {
                actorUserId: userId,
                documentId: routeId(request, "documentId"),
                title: string(body.title, "title"),
            });
            await publish(pubsub, result.hint);
            return { document: result.document, sync: result.hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/documents/:documentId/delete", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            emptyBody(request.body);
            const documentId = routeId(request, "documentId");
            const result = await documentDelete(executor, userId, documentId);
            presenceTracker.remove(documentId);
            await publish(pubsub, result.hint);
            return { sync: result.hint };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/documents/:documentId/presence", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            return {
                presence: await documentPresenceList(
                    executor,
                    presenceTracker,
                    userId,
                    routeId(request, "documentId"),
                ),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/documents/:documentId/updatePresence", async (request, reply) => {
        const userId = await actor(auth, request, reply);
        if (!userId) return;
        try {
            const body = object(request.body);
            only(body, ["clientId", "revision", "active", "state", "ttlMs"]);
            const result = await documentPresenceUpdate(executor, presenceTracker, {
                actorUserId: userId,
                documentId: routeId(request, "documentId"),
                clientId: id(body.clientId, "clientId"),
                revision: nonnegativeInteger(body.revision, "revision"),
                active: booleanField(body.active, "active"),
                state: body.state,
                ttlMs: optionalPositiveInteger(body.ttlMs, "ttlMs", 3_600_000),
            });
            if (result.accepted) {
                const event: DocumentPresenceEvent = {
                    type: "document.presence",
                    chatId: result.chatId,
                    presence: result.snapshot,
                    occurredAt: Date.now(),
                };
                assertRealtimeEvent(event);
                await pubsub.publish(realtimeTopics.chat(result.chatId), event);
            }
            return { accepted: result.accepted, presence: result.presence };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });
}

class RequestError extends Error {}

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

function string(value: unknown, name: string, maxLength = 10_000): string {
    if (typeof value !== "string" || value.length > maxLength)
        throw new RequestError(`${name} must be a string of at most ${maxLength} characters`);
    return value;
}

function optionalString(value: unknown, name: string, maxLength = 10_000): string | undefined {
    return value === undefined ? undefined : string(value, name, maxLength);
}

function documentFormat(value: unknown): DocumentFormat {
    if (value === undefined) return "blocknote";
    if (typeof value !== "string" || !(DOCUMENT_FORMATS as readonly string[]).includes(value))
        throw new RequestError(`format must be one of: ${DOCUMENT_FORMATS.join(", ")}`);
    return value as DocumentFormat;
}

function updateArray(value: unknown): unknown[] {
    if (!Array.isArray(value)) throw new RequestError("updates must be an array");
    return value;
}

function sequenceNumber(value: unknown, name: string): number {
    if (typeof value !== "string" || !/^(0|[1-9]\d*)$/.test(value))
        throw new RequestError(`${name} must be an unsigned decimal string`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new RequestError(`${name} is out of range`);
    return parsed;
}

function nonnegativeInteger(value: unknown, name: string): number {
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
        throw new RequestError(`${name} must be a non-negative integer`);
    return value;
}

function optionalPositiveInteger(
    value: unknown,
    name: string,
    maximum: number,
): number | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
        throw new RequestError(`${name} must be an integer between 1 and ${maximum}`);
    return value;
}

function booleanField(value: unknown, name: string): boolean {
    if (typeof value !== "boolean") throw new RequestError(`${name} must be a boolean`);
    return value;
}
