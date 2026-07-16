import { createId } from "@paralleldrive/cuid2";
import type { ServerResponse } from "node:http";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationRepository } from "../modules/collaboration/repository.js";
import { CollaborationError } from "../modules/collaboration/types.js";
import {
    assertRealtimeEvent,
    assertRealtimeId,
    assertSequence,
    DEFAULT_REALTIME_LIMITS,
    realtimeTopics,
    type CallSignalEvent,
    type PubSub,
    type RealtimeEvent,
    type RealtimeTopic,
    type Unsubscribe,
    type WebRtcSignal,
} from "../modules/realtime/index.js";

const COMMON_DIFFERENCE_LIMIT = 500;
const MAX_COMMON_DIFFERENCE_LIMIT = 1_000;
const CHAT_DIFFERENCE_LIMIT = 100;
const MAX_CHAT_DIFFERENCE_LIMIT = 1_000;
const DEFAULT_TYPING_TTL_MS = 10_000;
const HEARTBEAT_MS = 15_000;
const MAX_INITIAL_EVENTS = 256;
const MAX_SSE_QUEUE_BYTES = 256 * 1024;

type JsonObject = Record<string, unknown>;

export function registerSyncRoutes(
    app: FastifyInstance,
    auth: AuthService,
    repository: CollaborationRepository,
    pubsub: PubSub,
): void {
    // Presence connections are intentionally process-local, just like the current PubSub adapter.
    // Keeping ownership here prevents one user from touching another user's connection by id.
    const presenceOwners = new Map<string, string>();

    app.get("/v0/sync/state", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        return { state: await repository.getState(), serverTime: new Date().toISOString() };
    });

    app.post("/v0/sync/getDifference", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = object(request.body, "body");
            const state = object(body.state, "state");
            return await repository.getDifference({
                userId: current.user.id,
                generation: id(state.generation, "state.generation"),
                fromSequence: sequence(state.sequence, "state.sequence"),
                untilSequence: optionalSequence(body.untilSequence, "untilSequence"),
                limit: limit(body.limit, COMMON_DIFFERENCE_LIMIT, MAX_COMMON_DIFFERENCE_LIMIT),
            });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/sync/acknowledge", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = object(request.body, "body");
            const state = object(body.state, "state");
            await repository.acknowledgeSyncConsumer({
                userId: current.user.id,
                deviceId: id(body.deviceId, "deviceId"),
                generation: id(state.generation, "state.generation"),
                sequence: sequence(state.sequence, "state.sequence"),
            });
            return reply.code(202).send({ accepted: true });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/chats/:chatId/getDifference", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const chatId = routeId(request, "chatId");
            const body = object(request.body, "body");
            const state = object(body.state, "state");
            return await repository.getChatDifference({
                userId: current.user.id,
                chatId,
                membershipEpoch: id(state.membershipEpoch, "state.membershipEpoch"),
                fromPts: sequence(state.pts, "state.pts"),
                untilPts: optionalSequence(body.untilPts, "untilPts"),
                limit: limit(body.limit, CHAT_DIFFERENCE_LIMIT, MAX_CHAT_DIFFERENCE_LIMIT),
            });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/sync/events", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        return openEventStream(
            request,
            reply,
            current.user.id,
            auth,
            repository,
            pubsub,
            presenceOwners,
        );
    });

    app.post("/v0/chats/:chatId/setTyping", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const chatId = routeId(request, "chatId");
            const body = object(request.body, "body");
            if (typeof body.active !== "boolean")
                throw new RequestValidationError("active must be a boolean");
            const ttlMs = typingTtl(body.ttlMs);
            if (!(await repository.canPostToChat(current.user.id, chatId))) {
                return (await repository.canAccessChat(current.user.id, chatId))
                    ? reply.code(403).send({ error: "forbidden" })
                    : reply.code(404).send({ error: "not_found" });
            }
            const occurredAt = Date.now();
            const event: RealtimeEvent = body.active
                ? {
                      type: "typing",
                      chatId,
                      userId: current.user.id,
                      active: true,
                      occurredAt,
                      expiresAt: occurredAt + ttlMs,
                  }
                : {
                      type: "typing",
                      chatId,
                      userId: current.user.id,
                      active: false,
                      occurredAt,
                  };
            assertRealtimeEvent(event);
            await pubsub.publish(realtimeTopics.chat(chatId), event);
            return reply.code(202).send({ accepted: true });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/me/updatePresence", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = object(request.body, "body");
            const connectionId = id(body.connectionId, "connectionId");
            if (presenceOwners.get(connectionId) !== current.user.id)
                return reply.code(404).send({ error: "presence_connection_not_found" });
            const presence = await pubsub.recordPresenceActivity(connectionId);
            return presence
                ? { presence }
                : reply.code(404).send({ error: "presence_connection_not_found" });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/calls/:callId/sendSignal", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const callId = routeId(request, "callId");
            const body = object(request.body, "body");
            const chatId = id(body.chatId, "chatId");
            const recipientUserId = id(body.recipientUserId, "recipientUserId");
            if (recipientUserId === current.user.id)
                throw new RequestValidationError("recipientUserId must identify another user");
            if (
                !(await repository.canSignalCall({
                    userId: current.user.id,
                    callId,
                    chatId,
                    recipientUserId,
                }))
            )
                return reply.code(404).send({ error: "call_or_recipient_not_found" });
            const event: CallSignalEvent = {
                type: "call.signal",
                callId,
                chatId,
                senderUserId: current.user.id,
                recipientUserId,
                signal: webRtcSignal(body.signal),
                occurredAt: Date.now(),
            };
            assertRealtimeEvent(event);
            await Promise.all([
                pubsub.publish(realtimeTopics.call(callId), event),
                pubsub.publish(realtimeTopics.user(recipientUserId), event),
            ]);
            return reply.code(202).send({ accepted: true });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });
}

async function openEventStream(
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
    auth: AuthService,
    repository: CollaborationRepository,
    pubsub: PubSub,
    presenceOwners: Map<string, string>,
): Promise<void> {
    const connectionId = createId();
    const subscriptions = new Map<RealtimeTopic, Unsubscribe>();
    const pending: Array<{ name: string; data: unknown }> = [];
    let responseReady = false;
    let presenceConnected = false;
    let heartbeat: NodeJS.Timeout | undefined;
    let heartbeatRunning = false;
    let closed = false;
    let writer: SseWriter | undefined;

    const cleanup = (): void => {
        if (closed) return;
        closed = true;
        if (heartbeat) clearInterval(heartbeat);
        for (const unsubscribe of subscriptions.values()) unsubscribe();
        subscriptions.clear();
        writer?.close();
        if (presenceOwners.get(connectionId) === userId) presenceOwners.delete(connectionId);
        if (presenceConnected) {
            presenceConnected = false;
            void pubsub.disconnectPresence(connectionId).catch((error: unknown) => {
                request.log.error(error, "Could not disconnect realtime presence");
            });
        }
    };

    const terminate = (): void => {
        cleanup();
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    };

    const send = (name: string, data: unknown): void => {
        if (closed) return;
        if (!responseReady || !writer) {
            if (pending.length >= MAX_INITIAL_EVENTS) {
                // Never silently discard signaling during stream setup. Closing makes the
                // overflow explicit; durable state is recovered by getDifference on reconnect.
                terminate();
                return;
            }
            pending.push({ name, data });
            return;
        }
        if (!writer.send(name, data)) terminate();
    };

    const ensureSubscription = (topic: RealtimeTopic): void => {
        if (closed || subscriptions.has(topic)) return;
        subscriptions.set(
            topic,
            pubsub.subscribe(topic, async (event) => {
                const visible = await visibleRealtimeEvent(repository, userId, event);
                if (!visible || closed) return;
                if (visible.type === "sync") {
                    for (const chat of visible.chats)
                        ensureSubscription(realtimeTopics.chat(chat.chatId));
                }
                send(visible.type, visible);
            }),
        );
    };

    const reconcileChatSubscriptions = async (): Promise<void> => {
        const chats = await repository.listChats(userId);
        const expected = new Set(chats.map((chat) => realtimeTopics.chat(chat.id)));
        for (const topic of expected) ensureSubscription(topic);
        for (const [topic, unsubscribe] of subscriptions) {
            if (topic.startsWith("chat:") && !expected.has(topic)) {
                unsubscribe();
                subscriptions.delete(topic);
            }
        }
    };

    request.raw.once("aborted", cleanup);
    reply.raw.once("close", cleanup);
    reply.raw.once("error", cleanup);

    try {
        // Install the broad subscriptions before reading state. Anything delivered during setup is
        // queued, and durable changes are still recovered from the ready-state cursor.
        ensureSubscription(realtimeTopics.user(userId));
        ensureSubscription(realtimeTopics.presence);
        ensureSubscription(realtimeTopics.server);
        await reconcileChatSubscriptions();
        if (closed) return;

        await pubsub.connectPresence({ connectionId, userId });
        if (closed) {
            await pubsub.disconnectPresence(connectionId);
            return;
        }
        presenceConnected = true;
        presenceOwners.set(connectionId, userId);
        const state = await repository.getState();
        if (closed) return;

        reply.hijack();
        prepareSseResponse(reply);
        writer = new SseWriter(reply.raw, MAX_SSE_QUEUE_BYTES, terminate);
        responseReady = true;
        send("ready", { connectionId, state, heartbeatMs: HEARTBEAT_MS });
        for (const event of pending.splice(0)) send(event.name, event.data);
        if (closed) return;

        heartbeat = setInterval(() => {
            if (closed || heartbeatRunning) return;
            heartbeatRunning = true;
            void (async () => {
                const authenticated = await auth.authenticate(request);
                if (!authenticated || authenticated.user.id !== userId) {
                    terminate();
                    return;
                }
                await reconcileChatSubscriptions();
                const nextState = await repository.getState();
                send("heartbeat", {
                    serverTime: new Date().toISOString(),
                    state: nextState,
                });
            })()
                .catch((error: unknown) => {
                    request.log.error(error, "Realtime heartbeat failed");
                    terminate();
                })
                .finally(() => {
                    heartbeatRunning = false;
                });
        }, HEARTBEAT_MS);
        heartbeat.unref();
    } catch (error) {
        cleanup();
        throw error;
    }
}

async function visibleRealtimeEvent(
    repository: CollaborationRepository,
    userId: string,
    event: RealtimeEvent,
): Promise<RealtimeEvent | undefined> {
    if (event.type === "presence") return event;
    if (event.type === "sync") {
        const chats = [];
        for (const chat of event.chats) {
            if (await repository.canAccessChat(userId, chat.chatId)) chats.push(chat);
        }
        return { ...event, chats };
    }
    if (event.type === "workspace.changed")
        return (await repository.canAccessChannelWorkspace(userId, event.chatId))
            ? event
            : undefined;
    if (!(await repository.canAccessChat(userId, event.chatId))) return undefined;
    if (
        event.type === "call.signal" &&
        event.recipientUserId !== undefined &&
        event.recipientUserId !== userId
    )
        return undefined;
    return event;
}

function prepareSseResponse(reply: FastifyReply): void {
    // Fastify lifecycle hooks have already populated response headers (notably CORS); copying them
    // before the raw response is flushed preserves those headers after hijacking the response.
    for (const [name, value] of Object.entries(reply.getHeaders())) {
        if (value !== undefined) reply.raw.setHeader(name, value);
    }
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("connection", "keep-alive");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.socket?.setKeepAlive(true);
    reply.raw.flushHeaders();
}

class SseWriter {
    private readonly queued: string[] = [];
    private queuedBytes = 0;
    private blocked = false;
    private closed = false;

    constructor(
        private readonly response: ServerResponse,
        private readonly maxQueuedBytes: number,
        private readonly onFailure: () => void,
    ) {}

    send(name: string, data: unknown): boolean {
        if (this.closed || this.response.destroyed || this.response.writableEnded) return false;
        const frame = `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
        const bytes = Buffer.byteLength(frame);
        if (this.blocked) {
            if (this.queuedBytes + bytes > this.maxQueuedBytes) return false;
            this.queued.push(frame);
            this.queuedBytes += bytes;
            return true;
        }
        try {
            if (!this.response.write(frame)) {
                this.blocked = true;
                this.response.once("drain", this.flush);
            }
            return true;
        } catch {
            return false;
        }
    }

    close(): void {
        if (this.closed) return;
        this.closed = true;
        this.response.off("drain", this.flush);
        this.queued.length = 0;
        this.queuedBytes = 0;
    }

    private readonly flush = (): void => {
        if (this.closed) return;
        this.blocked = false;
        while (this.queued.length > 0) {
            const frame = this.queued.shift()!;
            this.queuedBytes -= Buffer.byteLength(frame);
            try {
                if (!this.response.write(frame)) {
                    this.blocked = true;
                    this.response.once("drain", this.flush);
                    return;
                }
            } catch {
                this.onFailure();
                return;
            }
        }
    };
}

function object(value: unknown, name: string): JsonObject {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RequestValidationError(`${name} must be an object`);
    return value as JsonObject;
}

function id(value: unknown, name: string): string {
    if (typeof value !== "string") throw new RequestValidationError(`${name} must be a string`);
    try {
        assertRealtimeId(value, name);
        return value;
    } catch (error) {
        throw new RequestValidationError(message(error));
    }
}

function routeId(request: FastifyRequest, name: string): string {
    return id((request.params as Record<string, unknown> | undefined)?.[name], name);
}

function sequence(value: unknown, name: string): number {
    if (typeof value !== "string")
        throw new RequestValidationError(`${name} must be an unsigned decimal string`);
    try {
        assertSequence(value, name);
    } catch (error) {
        throw new RequestValidationError(message(error));
    }
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed))
        throw new RequestValidationError(`${name} exceeds the supported integer range`);
    return parsed;
}

function optionalSequence(value: unknown, name: string): number | undefined {
    return value === undefined ? undefined : sequence(value, name);
}

function limit(value: unknown, fallback: number, maximum: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum)
        throw new RequestValidationError(`limit must be an integer between 1 and ${maximum}`);
    return value as number;
}

function typingTtl(value: unknown): number {
    if (value === undefined) return DEFAULT_TYPING_TTL_MS;
    if (
        !Number.isSafeInteger(value) ||
        (value as number) < 1 ||
        (value as number) > DEFAULT_REALTIME_LIMITS.maxTypingTtlMs
    )
        throw new RequestValidationError(
            `ttlMs must be an integer between 1 and ${DEFAULT_REALTIME_LIMITS.maxTypingTtlMs}`,
        );
    return value as number;
}

function webRtcSignal(value: unknown): WebRtcSignal {
    const signal = object(value, "signal");
    if (signal.kind === "offer" || signal.kind === "answer") {
        if (typeof signal.sdp !== "string")
            throw new RequestValidationError("signal.sdp must be a string");
        return { kind: signal.kind, sdp: signal.sdp };
    }
    if (signal.kind === "ice-candidate") {
        if (typeof signal.candidate !== "string")
            throw new RequestValidationError("signal.candidate must be a string");
        if (
            signal.sdpMid !== undefined &&
            signal.sdpMid !== null &&
            typeof signal.sdpMid !== "string"
        )
            throw new RequestValidationError("signal.sdpMid must be a string or null");
        if (
            signal.sdpMLineIndex !== undefined &&
            signal.sdpMLineIndex !== null &&
            (!Number.isSafeInteger(signal.sdpMLineIndex) || (signal.sdpMLineIndex as number) < 0)
        )
            throw new RequestValidationError("signal.sdpMLineIndex must be a non-negative integer");
        if (
            signal.usernameFragment !== undefined &&
            signal.usernameFragment !== null &&
            typeof signal.usernameFragment !== "string"
        )
            throw new RequestValidationError("signal.usernameFragment must be a string or null");
        return {
            kind: "ice-candidate",
            candidate: signal.candidate,
            sdpMid: signal.sdpMid as string | null | undefined,
            sdpMLineIndex: signal.sdpMLineIndex as number | null | undefined,
            usernameFragment: signal.usernameFragment as string | null | undefined,
        };
    }
    if (signal.kind === "hangup") {
        if (
            signal.reason !== undefined &&
            signal.reason !== "ended" &&
            signal.reason !== "declined" &&
            signal.reason !== "busy" &&
            signal.reason !== "failed"
        )
            throw new RequestValidationError("signal.reason is invalid");
        return {
            kind: "hangup",
            reason: signal.reason as "ended" | "declined" | "busy" | "failed" | undefined,
        };
    }
    throw new RequestValidationError("signal.kind is invalid");
}

function handledError(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (error instanceof RequestValidationError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    if (!(error instanceof CollaborationError)) return undefined;
    const status = {
        not_found: 404,
        forbidden: 403,
        invalid: 400,
        conflict: 409,
        future_state: 409,
        generation_mismatch: 409,
    }[error.code];
    const responseCode =
        error.code === "invalid"
            ? "invalid_request"
            : error.code === "future_state"
              ? "future_sync_state"
              : error.code;
    return reply.code(status).send({ error: responseCode, message: error.message });
}

function unauthorized(reply: FastifyReply): FastifyReply {
    return reply.code(401).send({ error: "unauthorized" });
}

function message(error: unknown): string {
    return error instanceof Error ? error.message : "Invalid request";
}

class RequestValidationError extends Error {}
