import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { CollaborationRepository } from "../modules/collaboration/repository.js";
import { CollaborationError, type MutationHint } from "../modules/collaboration/types.js";
import {
    realtimeTopics,
    type PubSub,
    type RealtimeTopic,
    type SyncHintEvent,
} from "../modules/realtime/index.js";

const MAX_ID_LENGTH = 128;
const MAX_MESSAGE_LENGTH = 40_000;
const MAX_ATTACHMENTS = 20;
const MAX_FORWARD_TARGETS = 20;
const MAX_SELF_DESTRUCT_SECONDS = 31_536_000;

type AuthenticatedHandler = (
    request: FastifyRequest,
    reply: FastifyReply,
    userId: string,
) => Promise<unknown>;

interface PublishAudience {
    server?: boolean;
    userIds?: readonly string[];
}

export function registerCollaborationRoutes(
    app: FastifyInstance,
    auth: AuthService,
    repository: CollaborationRepository,
    pubsub: PubSub,
): void {
    app.get(
        "/v0/chats",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { chats: await repository.listChats(userId) };
        }),
    );
    app.get(
        "/v0/chats/:chatId",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { chat: await repository.getChat(userId, pathId(request, "chatId")) };
        }),
    );
    app.get(
        "/v0/chats/:chatId/members",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return {
                users: await repository.listChatMembers(userId, pathId(request, "chatId")),
            };
        }),
    );
    app.get(
        "/v0/chats/:chatId/messages",
        authenticated(auth, async (request, _reply, userId) => {
            const chatId = pathId(request, "chatId");
            const page = messagePage(request, ["beforeSequence", "afterSequence", "limit"]);
            return repository.listMessages({ userId, chatId, ...page });
        }),
    );
    app.get(
        "/v0/messages/:messageId",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return {
                message: await repository.getMessage(userId, pathId(request, "messageId")),
            };
        }),
    );
    app.get(
        "/v0/messages/:messageId/thread",
        authenticated(auth, async (request, _reply, userId) => {
            const selected = await repository.getMessage(userId, pathId(request, "messageId"));
            const root = selected.threadRootMessageId
                ? await repository.getMessage(userId, selected.threadRootMessageId)
                : selected;
            const page = messagePage(request, ["beforeSequence", "afterSequence", "limit"]);
            const result = await repository.listMessages({
                userId,
                chatId: root.chatId,
                threadRootMessageId: root.id,
                ...page,
            });
            return { root, ...result };
        }),
    );

    app.post(
        "/v0/chats/createDirectMessage",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["userId"]);
            const otherUserId = idField(body, "userId");
            const result = await repository.createDirectMessage(userId, otherUserId);
            if (result.hint)
                await publishHints(request, pubsub, [result.hint], {
                    userIds: [userId, otherUserId],
                });
            return reply.code(result.hint ? 201 : 200).send({
                chat: result.chat,
                sync: result.hint,
            });
        }),
    );
    app.post(
        "/v0/chats/createChannel",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["kind", "name", "slug", "topic"]);
            const kind = enumField(body, "kind", ["public_channel", "private_channel"] as const);
            const result = await repository.createChannel({
                actorUserId: userId,
                kind,
                name: trimmedString(body, "name", 100),
                slug: channelSlug(body),
                topic: nullableTrimmedString(body, "topic", 500),
            });
            await publishHints(request, pubsub, [result.hint], {
                server: kind === "public_channel",
                userIds: [userId],
            });
            return reply.code(201).send({ chat: result.chat, sync: result.hint });
        }),
    );
    app.post(
        "/v0/chats/:chatId/updateTopic",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["topic"]);
            requireField(body, "topic");
            const result = await repository.updateTopic(
                userId,
                pathId(request, "chatId"),
                nullableTrimmedString(body, "topic", 500),
            );
            await publishHints(request, pubsub, [result.hint]);
            return { chat: result.chat, sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/join",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.joinPublicChannel(userId, pathId(request, "chatId"));
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { chat: result.chat, sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/leave",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.leaveChannel(userId, pathId(request, "chatId"));
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/addMember",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["userId", "role"]);
            const addedUserId = idField(body, "userId");
            const result = await repository.addChannelMember({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                userId: addedUserId,
                role: optionalEnumField(body, "role", ["owner", "admin", "member"] as const),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [addedUserId] });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/removeMember",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["userId"]);
            const removedUserId = idField(body, "userId");
            const result = await repository.removeChannelMember({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                userId: removedUserId,
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [removedUserId] });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/setStar",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["starred"]);
            const result = await repository.setStar(
                userId,
                pathId(request, "chatId"),
                booleanField(body, "starred"),
            );
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/reorderStarred",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["chatIds"]);
            const result = await repository.reorderStarred(
                userId,
                idArrayField(body, "chatIds", 1_000, true),
            );
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
        }),
    );

    app.post(
        "/v0/chats/:chatId/sendMessage",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, [
                "text",
                "attachmentFileIds",
                "quotedMessageId",
                "threadRootMessageId",
                "selfDestructSeconds",
                "clientMutationId",
            ]);
            const attachmentFileIds = optionalIdArrayField(
                body,
                "attachmentFileIds",
                MAX_ATTACHMENTS,
            );
            const text = messageText(body, attachmentFileIds?.length ?? 0);
            const result = await repository.sendMessage({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                text,
                attachmentFileIds,
                quotedMessageId: optionalIdField(body, "quotedMessageId"),
                threadRootMessageId: optionalIdField(body, "threadRootMessageId"),
                expiresAt: selfDestructExpiry(body),
                clientMutationId: optionalTokenField(body, "clientMutationId"),
            });
            await publishHints(request, pubsub, [result.hint]);
            return reply.code(201).send({ message: result.message, sync: result.hint });
        }),
    );
    app.post(
        "/v0/messages/:messageId/sendThreadMessage",
        authenticated(auth, async (request, reply, userId) => {
            const selected = await repository.getMessage(userId, pathId(request, "messageId"));
            const rootMessageId = selected.threadRootMessageId ?? selected.id;
            const body = requestBody(request, [
                "text",
                "attachmentFileIds",
                "quotedMessageId",
                "selfDestructSeconds",
                "clientMutationId",
            ]);
            const attachmentFileIds = optionalIdArrayField(
                body,
                "attachmentFileIds",
                MAX_ATTACHMENTS,
            );
            const result = await repository.sendMessage({
                actorUserId: userId,
                chatId: selected.chatId,
                text: messageText(body, attachmentFileIds?.length ?? 0),
                attachmentFileIds,
                quotedMessageId: optionalIdField(body, "quotedMessageId"),
                threadRootMessageId: rootMessageId,
                expiresAt: selfDestructExpiry(body),
                clientMutationId: optionalTokenField(body, "clientMutationId"),
            });
            await publishHints(request, pubsub, [result.hint]);
            return reply.code(201).send({ message: result.message, sync: result.hint });
        }),
    );
    app.post(
        "/v0/messages/:messageId/deleteMessage",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.deleteMessage(userId, pathId(request, "messageId"));
            await publishHints(request, pubsub, [result.hint]);
            return { message: result.message, sync: result.hint };
        }),
    );
    app.post(
        "/v0/messages/:messageId/forwardMessage",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["targetChatIds", "clientMutationId"]);
            const result = await repository.forwardMessage({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                targetChatIds: idArrayField(body, "targetChatIds", MAX_FORWARD_TARGETS, false),
                clientMutationId: optionalTokenField(body, "clientMutationId"),
            });
            await publishHints(request, pubsub, result.hints);
            return reply.code(201).send({ messages: result.messages, sync: result.hints });
        }),
    );
    app.post(
        "/v0/messages/:messageId/addReaction",
        authenticated(auth, async (request, _reply, userId) => {
            const reaction = reactionBody(request);
            const result = await repository.setReaction({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                ...reaction,
                active: true,
            });
            await publishHints(request, pubsub, [result.hint]);
            return { message: result.message, sync: result.hint };
        }),
    );
    app.post(
        "/v0/messages/:messageId/removeReaction",
        authenticated(auth, async (request, _reply, userId) => {
            const reaction = reactionBody(request);
            const result = await repository.setReaction({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                ...reaction,
                active: false,
            });
            await publishHints(request, pubsub, [result.hint]);
            return { message: result.message, sync: result.hint };
        }),
    );

    app.get(
        "/v0/contacts",
        authenticated(auth, async (request) => {
            emptyQuery(request);
            const users = await repository.listContacts();
            return {
                users,
                presence: await pubsub.getPresenceSnapshot(users.map((user) => user.id)),
            };
        }),
    );
    app.get(
        "/v0/directory/users",
        authenticated(auth, async (request) => {
            emptyQuery(request);
            const users = await repository.listContacts();
            return {
                users,
                presence: await pubsub.getPresenceSnapshot(users.map((user) => user.id)),
            };
        }),
    );
    app.get(
        "/v0/directory",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            const [users, channels, customEmoji, server] = await Promise.all([
                repository.listContacts(),
                repository.listDirectoryChannels(userId),
                repository.listCustomEmoji(),
                repository.getServerProfile(),
            ]);
            return {
                server,
                users,
                channels,
                customEmoji,
                presence: await pubsub.getPresenceSnapshot(users.map((user) => user.id)),
            };
        }),
    );
    app.get(
        "/v0/directory/channels",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { channels: await repository.listDirectoryChannels(userId) };
        }),
    );
    app.get(
        "/v0/search",
        authenticated(auth, async (request, _reply, userId) => {
            const query = requestQuery(request, ["q", "limit"]);
            const search = queryString(query, "q", 200);
            if (search.trim().length === 0) throw new InvalidRequest("Search query is required");
            return {
                results: await repository.search(
                    userId,
                    search.trim(),
                    queryLimit(query, "limit", 20, 50),
                ),
            };
        }),
    );
    app.get(
        "/v0/files",
        authenticated(auth, async (request, _reply, userId) => {
            const query = requestQuery(request, ["kind", "before", "limit"]);
            return repository.listFiles({
                userId,
                kind: optionalQueryEnum(query, "kind", ["file", "photo", "video", "gif"] as const),
                before: optionalQueryString(query, "before", 64),
                limit: queryLimit(query, "limit", 50, 100),
            });
        }),
    );

    app.get(
        "/v0/customEmoji",
        authenticated(auth, async (request) => {
            emptyQuery(request);
            return { emoji: await repository.listCustomEmoji() };
        }),
    );
    app.post(
        "/v0/customEmoji/createCustomEmoji",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["name", "fileId"]);
            const result = await repository.createCustomEmoji({
                actorUserId: userId,
                name: emojiName(body),
                fileId: idField(body, "fileId"),
            });
            await publishHints(request, pubsub, [result.hint], { server: true });
            return reply.code(201).send({ emoji: result.emoji, sync: result.hint });
        }),
    );
    app.post(
        "/v0/customEmoji/:emojiId/deleteCustomEmoji",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.deleteCustomEmoji(userId, pathId(request, "emojiId"));
            await publishHints(request, pubsub, [result.hint], { server: true });
            return { sync: result.hint };
        }),
    );

    app.get(
        "/v0/server",
        authenticated(auth, async (request) => {
            emptyQuery(request);
            return { server: await repository.getServerProfile() };
        }),
    );
    app.get(
        "/v0/admin/users",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { users: await repository.listAdminUsers(userId) };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/updateUser",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["title", "role"]);
            if (!has(body, "title") && !has(body, "role"))
                throw new InvalidRequest("At least one user field is required");
            const targetUserId = pathId(request, "userId");
            const title = has(body, "title")
                ? body.title === null
                    ? null
                    : (nullableTrimmedString(body, "title", 200) ?? null)
                : undefined;
            const result = await repository.updateUserAdministration({
                actorUserId,
                userId: targetUserId,
                title,
                role: optionalEnumField(body, "role", ["member", "admin"] as const),
            });
            await publishHints(request, pubsub, [result.hint], {
                server: true,
                userIds: [targetUserId],
            });
            return { user: result.user, sync: result.hint };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/banUser",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            const targetUserId = pathId(request, "userId");
            const result = await repository.setUserBanned({
                actorUserId,
                userId: targetUserId,
                banned: true,
            });
            await publishHints(request, pubsub, [result.hint], {
                server: true,
                userIds: [targetUserId],
            });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/unbanUser",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            const targetUserId = pathId(request, "userId");
            const result = await repository.setUserBanned({
                actorUserId,
                userId: targetUserId,
                banned: false,
            });
            await publishHints(request, pubsub, [result.hint], {
                server: true,
                userIds: [targetUserId],
            });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/admin/users/:userId/deleteUser",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            const targetUserId = pathId(request, "userId");
            const result = await repository.deleteUser({
                actorUserId,
                userId: targetUserId,
            });
            await publishHints(request, pubsub, [result.hint], {
                server: true,
                userIds: [targetUserId],
            });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/admin/updateServer",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["name", "title", "photoFileId"]);
            if (!has(body, "name") && !has(body, "title") && !has(body, "photoFileId"))
                throw new InvalidRequest("At least one server field is required");
            const result = await repository.updateServerProfile({
                actorUserId,
                name: has(body, "name") ? trimmedString(body, "name", 100) : undefined,
                title: has(body, "title")
                    ? (nullableTrimmedString(body, "title", 200) ?? null)
                    : undefined,
                photoFileId: has(body, "photoFileId")
                    ? body.photoFileId === null
                        ? null
                        : id(body.photoFileId, "photoFileId")
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint], { server: true });
            return { server: result.server, sync: result.hint };
        }),
    );
    app.post(
        "/v0/admin/sendAutomatedMessage",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, [
                "chatId",
                "text",
                "attachmentFileIds",
                "clientMutationId",
            ]);
            const attachmentFileIds = optionalIdArrayField(
                body,
                "attachmentFileIds",
                MAX_ATTACHMENTS,
            );
            const result = await repository.sendAutomatedMessage({
                actorUserId,
                chatId: idField(body, "chatId"),
                text: messageText(body, attachmentFileIds?.length ?? 0),
                attachmentFileIds,
                clientMutationId: optionalTokenField(body, "clientMutationId"),
            });
            await publishHints(request, pubsub, [result.hint]);
            return reply.code(201).send({ message: result.message, sync: result.hint });
        }),
    );
}

function authenticated(auth: AuthService, handler: AuthenticatedHandler) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            return await handler(request, reply, current.user.id);
        } catch (error) {
            if (error instanceof InvalidRequest)
                return reply.code(400).send({ error: "invalid_request", message: error.message });
            if (error instanceof CollaborationError) {
                const status = collaborationStatus(error.code);
                return reply.code(status).send({ error: error.code, message: error.message });
            }
            throw error;
        }
    };
}

function collaborationStatus(code: CollaborationError["code"]): 400 | 403 | 404 | 409 {
    switch (code) {
        case "invalid":
            return 400;
        case "forbidden":
            return 403;
        case "not_found":
            return 404;
        case "conflict":
        case "future_state":
        case "generation_mismatch":
            return 409;
    }
}

async function publishHints(
    request: FastifyRequest,
    pubsub: PubSub,
    hints: readonly MutationHint[],
    audience: PublishAudience = {},
): Promise<void> {
    const publications: Array<{ topic: RealtimeTopic; event: SyncHintEvent }> = [];
    for (const hint of hints) {
        const event: SyncHintEvent = { type: "sync", ...hint };
        const topics = new Set<RealtimeTopic>();
        for (const chat of hint.chats) topics.add(realtimeTopics.chat(chat.chatId));
        for (const userId of audience.userIds ?? []) topics.add(realtimeTopics.user(userId));
        if (audience.server || hint.areas.some((area) => area !== "preferences"))
            topics.add(realtimeTopics.server);
        for (const topic of topics) publications.push({ topic, event });
    }
    const results = await Promise.allSettled(
        publications.map(({ topic, event }) => pubsub.publish(topic, event)),
    );
    for (const result of results) {
        if (result.status === "rejected")
            request.log.warn({ err: result.reason }, "Could not publish realtime sync hint");
    }
}

function requestBody(request: FastifyRequest, allowed: readonly string[]): Record<string, unknown> {
    const body = record(request.body, "Request body");
    onlyKeys(body, allowed, "request body");
    return body;
}

function emptyBody(request: FastifyRequest): void {
    if (request.body === undefined || request.body === null) return;
    const body = record(request.body, "Request body");
    onlyKeys(body, [], "request body");
}

function requestQuery(
    request: FastifyRequest,
    allowed: readonly string[],
): Record<string, unknown> {
    const query = record(request.query, "Query");
    onlyKeys(query, allowed, "query");
    return query;
}

function emptyQuery(request: FastifyRequest): void {
    requestQuery(request, []);
}

function pathId(request: FastifyRequest, key: string): string {
    const params = record(request.params, "Path parameters");
    return id(params[key], key);
}

function record(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function onlyKeys(value: Record<string, unknown>, allowed: readonly string[], name: string): void {
    const unexpected = Object.keys(value).filter((key) => !allowed.includes(key));
    if (unexpected.length > 0)
        throw new InvalidRequest(`Unexpected ${name} field: ${unexpected[0]}`);
}

function requireField(value: Record<string, unknown>, key: string): void {
    if (!has(value, key)) throw new InvalidRequest(`${key} is required`);
}

function has(value: Record<string, unknown>, key: string): boolean {
    return Object.prototype.hasOwnProperty.call(value, key);
}

function idField(body: Record<string, unknown>, key: string): string {
    requireField(body, key);
    return id(body[key], key);
}

function optionalIdField(body: Record<string, unknown>, key: string): string | undefined {
    return has(body, key) ? id(body[key], key) : undefined;
}

function id(value: unknown, name: string): string {
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > MAX_ID_LENGTH ||
        value.trim() !== value ||
        hasControlCharacters(value)
    )
        throw new InvalidRequest(`${name} must be a valid identifier`);
    return value;
}

function idArrayField(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
    allowEmpty: boolean,
): string[] {
    requireField(body, key);
    return idArray(body[key], key, maximum, allowEmpty);
}

function optionalIdArrayField(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): string[] | undefined {
    return has(body, key) ? idArray(body[key], key, maximum, true) : undefined;
}

function idArray(value: unknown, name: string, maximum: number, allowEmpty: boolean): string[] {
    if (!Array.isArray(value) || (!allowEmpty && value.length === 0) || value.length > maximum)
        throw new InvalidRequest(
            `${name} must contain ${allowEmpty ? "at most" : "between 1 and"} ${maximum} identifiers`,
        );
    const result = value.map((entry) => id(entry, name));
    if (new Set(result).size !== result.length)
        throw new InvalidRequest(`${name} must not contain duplicates`);
    return result;
}

function trimmedString(body: Record<string, unknown>, key: string, maximum: number): string {
    requireField(body, key);
    const value = body[key];
    if (typeof value !== "string") throw new InvalidRequest(`${key} must be a string`);
    const result = value.trim();
    if (result.length === 0 || result.length > maximum || hasControlCharacters(result))
        throw new InvalidRequest(`${key} must be between 1 and ${maximum} characters`);
    return result;
}

function nullableTrimmedString(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): string | undefined {
    if (!has(body, key) || body[key] === null) return undefined;
    const value = body[key];
    if (typeof value !== "string") throw new InvalidRequest(`${key} must be a string or null`);
    const result = value.trim();
    if (result.length === 0) return undefined;
    if (result.length > maximum || hasControlCharacters(result))
        throw new InvalidRequest(`${key} must be at most ${maximum} characters`);
    return result;
}

function enumField<const T extends readonly string[]>(
    body: Record<string, unknown>,
    key: string,
    values: T,
): T[number] {
    requireField(body, key);
    const value = body[key];
    if (typeof value !== "string" || !values.includes(value))
        throw new InvalidRequest(`${key} must be one of: ${values.join(", ")}`);
    return value as T[number];
}

function optionalEnumField<const T extends readonly string[]>(
    body: Record<string, unknown>,
    key: string,
    values: T,
): T[number] | undefined {
    return has(body, key) ? enumField(body, key, values) : undefined;
}

function booleanField(body: Record<string, unknown>, key: string): boolean {
    requireField(body, key);
    if (typeof body[key] !== "boolean") throw new InvalidRequest(`${key} must be a boolean`);
    return body[key];
}

function channelSlug(body: Record<string, unknown>): string {
    const slug = trimmedString(body, "slug", 64).toLowerCase();
    if (!/^[a-z0-9][a-z0-9-]{0,62}[a-z0-9]$/.test(slug) && !/^[a-z0-9]$/.test(slug))
        throw new InvalidRequest("slug may contain lowercase letters, numbers, and inner hyphens");
    return slug;
}

function emojiName(body: Record<string, unknown>): string {
    const name = trimmedString(body, "name", 32).toLowerCase();
    if (!/^[a-z0-9][a-z0-9_-]*$/.test(name))
        throw new InvalidRequest(
            "name may contain lowercase letters, numbers, underscores, and hyphens",
        );
    return name;
}

function messageText(body: Record<string, unknown>, attachmentCount: number): string {
    if (!has(body, "text")) {
        if (attachmentCount > 0) return "";
        throw new InvalidRequest("A message requires text or an attachment");
    }
    if (typeof body.text !== "string") throw new InvalidRequest("text must be a string");
    if (body.text.length > MAX_MESSAGE_LENGTH)
        throw new InvalidRequest(`text must be at most ${MAX_MESSAGE_LENGTH} characters`);
    if (hasControlCharacters(body.text, true))
        throw new InvalidRequest("text contains unsupported control characters");
    if (body.text.trim().length === 0 && attachmentCount === 0)
        throw new InvalidRequest("A message requires text or an attachment");
    return body.text;
}

function optionalTokenField(body: Record<string, unknown>, key: string): string | undefined {
    if (!has(body, key)) return undefined;
    const value = body[key];
    if (
        typeof value !== "string" ||
        value.length === 0 ||
        value.length > 128 ||
        value.trim() !== value ||
        hasControlCharacters(value)
    )
        throw new InvalidRequest(`${key} must be a non-empty token of at most 128 characters`);
    return value;
}

function selfDestructExpiry(body: Record<string, unknown>): string | undefined {
    if (!has(body, "selfDestructSeconds")) return undefined;
    const seconds = body.selfDestructSeconds;
    if (
        typeof seconds !== "number" ||
        !Number.isSafeInteger(seconds) ||
        seconds < 1 ||
        seconds > MAX_SELF_DESTRUCT_SECONDS
    )
        throw new InvalidRequest(
            `selfDestructSeconds must be an integer between 1 and ${MAX_SELF_DESTRUCT_SECONDS}`,
        );
    return new Date(Date.now() + seconds * 1_000).toISOString();
}

function reactionBody(request: FastifyRequest): { emoji?: string; customEmojiId?: string } {
    const body = requestBody(request, ["emoji", "customEmojiId"]);
    const hasEmoji = has(body, "emoji");
    const hasCustom = has(body, "customEmojiId");
    if (hasEmoji === hasCustom)
        throw new InvalidRequest("Exactly one of emoji or customEmojiId is required");
    if (hasCustom) return { customEmojiId: id(body.customEmojiId, "customEmojiId") };
    if (
        typeof body.emoji !== "string" ||
        body.emoji.length === 0 ||
        body.emoji.length > 32 ||
        body.emoji.trim() !== body.emoji ||
        hasControlCharacters(body.emoji)
    )
        throw new InvalidRequest("emoji must be between 1 and 32 characters");
    return { emoji: body.emoji };
}

function messagePage(
    request: FastifyRequest,
    allowed: readonly string[],
): { beforeSequence?: number; afterSequence?: number; limit: number } {
    const query = requestQuery(request, allowed);
    const beforeSequence = optionalPositiveQueryInteger(query, "beforeSequence");
    const afterSequence = optionalPositiveQueryInteger(query, "afterSequence");
    if (beforeSequence !== undefined && afterSequence !== undefined)
        throw new InvalidRequest("beforeSequence and afterSequence are mutually exclusive");
    return {
        beforeSequence,
        afterSequence,
        limit: queryLimit(query, "limit", 100, 200),
    };
}

function queryLimit(
    query: Record<string, unknown>,
    key: string,
    fallback: number,
    maximum: number,
): number {
    if (!has(query, key)) return fallback;
    const value = query[key];
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
        throw new InvalidRequest(`${key} must be a positive integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed) || parsed > maximum)
        throw new InvalidRequest(`${key} must not exceed ${maximum}`);
    return parsed;
}

function optionalPositiveQueryInteger(
    query: Record<string, unknown>,
    key: string,
): number | undefined {
    if (!has(query, key)) return undefined;
    const value = query[key];
    if (typeof value !== "string" || !/^[1-9]\d*$/.test(value))
        throw new InvalidRequest(`${key} must be a positive integer`);
    const parsed = Number(value);
    if (!Number.isSafeInteger(parsed)) throw new InvalidRequest(`${key} is too large`);
    return parsed;
}

function queryString(query: Record<string, unknown>, key: string, maximum: number): string {
    if (!has(query, key) || typeof query[key] !== "string")
        throw new InvalidRequest(`${key} is required`);
    if (query[key].length > maximum || hasControlCharacters(query[key]))
        throw new InvalidRequest(`${key} must be at most ${maximum} characters`);
    return query[key];
}

function optionalQueryString(
    query: Record<string, unknown>,
    key: string,
    maximum: number,
): string | undefined {
    if (!has(query, key)) return undefined;
    return queryString(query, key, maximum);
}

function optionalQueryEnum<const T extends readonly string[]>(
    query: Record<string, unknown>,
    key: string,
    values: T,
): T[number] | undefined {
    if (!has(query, key)) return undefined;
    const value = query[key];
    if (typeof value !== "string" || !values.includes(value))
        throw new InvalidRequest(`${key} must be one of: ${values.join(", ")}`);
    return value as T[number];
}

function hasControlCharacters(value: string, allowLineBreaks = false): boolean {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code === 127 || (code < 32 && !(allowLineBreaks && (code === 9 || code === 10))))
            return true;
    }
    return false;
}

class InvalidRequest extends Error {}
