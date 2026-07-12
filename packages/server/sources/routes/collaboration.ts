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
            const memberships = await repository.listChatMemberships(
                userId,
                pathId(request, "chatId"),
            );
            return {
                users: memberships.map(({ user }) => user),
                memberships,
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
    app.get(
        "/v0/threads",
        authenticated(auth, async (request, _reply, userId) => {
            const query = requestQuery(request, ["before", "unreadOnly", "limit"]);
            return repository.listMyThreads({
                userId,
                before: optionalQueryString(query, "before", MAX_ID_LENGTH),
                unreadOnly: optionalQueryBoolean(query, "unreadOnly"),
                limit: queryLimit(query, "limit", 50, 100),
            });
        }),
    );
    app.get(
        "/v0/notifications",
        authenticated(auth, async (request, _reply, userId) => {
            const query = requestQuery(request, ["before", "unreadOnly", "limit"]);
            return repository.listNotifications({
                userId,
                before: optionalQueryString(query, "before", MAX_ID_LENGTH),
                unreadOnly: optionalQueryBoolean(query, "unreadOnly"),
                limit: queryLimit(query, "limit", 50, 100),
            });
        }),
    );
    app.post(
        "/v0/notifications/markRead",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["notificationIds", "all"]);
            const result = await repository.markNotificationsRead({
                actorUserId: userId,
                notificationIds: has(body, "notificationIds")
                    ? idArrayField(body, "notificationIds", 500, true)
                    : undefined,
                all: has(body, "all") ? booleanField(body, "all") : undefined,
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
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
        "/v0/chats/createGroupDirectMessage",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["userIds", "name"]);
            const result = await repository.createGroupDirectMessage({
                actorUserId: userId,
                userIds: idArrayField(body, "userIds", 49, false),
                name: has(body, "name") ? trimmedString(body, "name", 100) : undefined,
            });
            if (result.hint)
                await publishHints(request, pubsub, [result.hint], {
                    userIds: result.memberUserIds,
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
        "/v0/chats/:chatId/updateChannel",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, [
                "name",
                "slug",
                "topic",
                "kind",
                "photoFileId",
                "isListed",
            ]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one channel field is required");
            const result = await repository.updateChannel({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                name: has(body, "name") ? trimmedString(body, "name", 100) : undefined,
                slug: has(body, "slug") ? channelSlug(body) : undefined,
                topic: has(body, "topic")
                    ? body.topic === null
                        ? null
                        : (nullableTrimmedString(body, "topic", 500) ?? null)
                    : undefined,
                kind: optionalEnumField(body, "kind", [
                    "public_channel",
                    "private_channel",
                ] as const),
                photoFileId: has(body, "photoFileId")
                    ? body.photoFileId === null
                        ? null
                        : id(body.photoFileId, "photoFileId")
                    : undefined,
                isListed: has(body, "isListed") ? booleanField(body, "isListed") : undefined,
            });
            await publishHints(request, pubsub, [result.hint], {
                server: result.chat.kind === "public_channel",
            });
            return { chat: result.chat, sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/updatePolicies",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, [
                "retentionMode",
                "retentionSeconds",
                "defaultExpiryMode",
                "defaultSelfDestructSeconds",
                "defaultAfterReadScope",
            ]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one policy field is required");
            const result = await repository.updateChannelPolicies({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                retentionMode: optionalEnumField(body, "retentionMode", [
                    "inherit",
                    "forever",
                    "duration",
                ] as const),
                retentionSeconds: optionalNullablePositiveIntegerField(
                    body,
                    "retentionSeconds",
                    MAX_SELF_DESTRUCT_SECONDS * 100,
                ),
                defaultExpiryMode: optionalEnumField(body, "defaultExpiryMode", [
                    "none",
                    "after_send",
                    "after_read",
                ] as const),
                defaultSelfDestructSeconds: optionalNullablePositiveIntegerField(
                    body,
                    "defaultSelfDestructSeconds",
                    MAX_SELF_DESTRUCT_SECONDS,
                ),
                defaultAfterReadScope: optionalEnumField(body, "defaultAfterReadScope", [
                    "any_reader",
                    "all_readers",
                ] as const),
            });
            await publishHints(request, pubsub, [result.hint]);
            return { chat: result.chat, sync: result.hint };
        }),
    );
    for (const [path, archived] of [
        ["archiveChannel", true],
        ["unarchiveChannel", false],
    ] as const)
        app.post(
            `/v0/chats/:chatId/${path}`,
            authenticated(auth, async (request, _reply, userId) => {
                const body =
                    request.body === undefined || request.body === null
                        ? {}
                        : requestBody(request, ["reason"]);
                const result = await repository.setChannelArchived({
                    actorUserId: userId,
                    chatId: pathId(request, "chatId"),
                    archived,
                    reason: has(body, "reason")
                        ? (nullableTrimmedString(body, "reason", 500) ?? undefined)
                        : undefined,
                });
                await publishHints(request, pubsub, [result.hint], {
                    server: result.chat.kind === "public_channel",
                });
                return { chat: result.chat, sync: result.hint };
            }),
        );
    app.post(
        "/v0/chats/:chatId/deleteChannel",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["reason"]);
            const result = await repository.deleteChannel({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                reason: has(body, "reason")
                    ? (nullableTrimmedString(body, "reason", 500) ?? undefined)
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint], {
                userIds: result.memberUserIds,
            });
            return { sync: result.hint };
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
        "/v0/chats/:chatId/setMemberRole",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["userId", "role"]);
            const targetUserId = idField(body, "userId");
            const result = await repository.setChannelMemberRole({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                userId: targetUserId,
                role: enumField(body, "role", ["owner", "admin", "member"] as const),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [targetUserId] });
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
        "/v0/chats/:chatId/markRead",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["messageId"]);
            const result = await repository.markChatRead({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                messageId: optionalIdField(body, "messageId"),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { chat: result.chat, sync: result.hint };
        }),
    );
    app.post(
        "/v0/chats/:chatId/updateNotificationPreferences",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, [
                "notificationLevel",
                "mutedUntil",
                "notifyThreadReplies",
                "showMessagePreviews",
            ]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one preference is required");
            const result = await repository.setChatNotificationPreferences({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                notificationLevel: optionalEnumField(body, "notificationLevel", [
                    "all",
                    "mentions",
                    "none",
                ] as const),
                mutedUntil: optionalNullableDateField(body, "mutedUntil"),
                notifyThreadReplies: has(body, "notifyThreadReplies")
                    ? booleanField(body, "notifyThreadReplies")
                    : undefined,
                showMessagePreviews: has(body, "showMessagePreviews")
                    ? booleanField(body, "showMessagePreviews")
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { chat: result.chat, sync: result.hint };
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
                "expiryMode",
                "selfDestructSeconds",
                "afterReadScope",
                "clientMutationId",
            ]);
            const attachmentFileIds = optionalIdArrayField(
                body,
                "attachmentFileIds",
                MAX_ATTACHMENTS,
            );
            const text = messageText(body, attachmentFileIds?.length ?? 0);
            const selfDestructSeconds = optionalPositiveIntegerField(
                body,
                "selfDestructSeconds",
                MAX_SELF_DESTRUCT_SECONDS,
            );
            const result = await repository.sendMessage({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                text,
                attachmentFileIds,
                quotedMessageId: optionalIdField(body, "quotedMessageId"),
                threadRootMessageId: optionalIdField(body, "threadRootMessageId"),
                expiryMode:
                    optionalEnumField(body, "expiryMode", [
                        "none",
                        "after_send",
                        "after_read",
                    ] as const) ?? (selfDestructSeconds ? "after_send" : undefined),
                selfDestructSeconds,
                afterReadScope: optionalEnumField(body, "afterReadScope", [
                    "any_reader",
                    "all_readers",
                ] as const),
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
                "expiryMode",
                "selfDestructSeconds",
                "afterReadScope",
                "clientMutationId",
            ]);
            const attachmentFileIds = optionalIdArrayField(
                body,
                "attachmentFileIds",
                MAX_ATTACHMENTS,
            );
            const selfDestructSeconds = optionalPositiveIntegerField(
                body,
                "selfDestructSeconds",
                MAX_SELF_DESTRUCT_SECONDS,
            );
            const result = await repository.sendMessage({
                actorUserId: userId,
                chatId: selected.chatId,
                text: messageText(body, attachmentFileIds?.length ?? 0),
                attachmentFileIds,
                quotedMessageId: optionalIdField(body, "quotedMessageId"),
                threadRootMessageId: rootMessageId,
                expiryMode:
                    optionalEnumField(body, "expiryMode", [
                        "none",
                        "after_send",
                        "after_read",
                    ] as const) ?? (selfDestructSeconds ? "after_send" : undefined),
                selfDestructSeconds,
                afterReadScope: optionalEnumField(body, "afterReadScope", [
                    "any_reader",
                    "all_readers",
                ] as const),
                clientMutationId: optionalTokenField(body, "clientMutationId"),
            });
            await publishHints(request, pubsub, [result.hint]);
            return reply.code(201).send({ message: result.message, sync: result.hint });
        }),
    );
    app.post(
        "/v0/messages/:messageId/updateThreadSubscription",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["subscribed", "notificationLevel"]);
            const selected = await repository.getMessage(userId, pathId(request, "messageId"));
            const rootMessageId = selected.threadRootMessageId ?? selected.id;
            const result = await repository.setThreadSubscription({
                actorUserId: userId,
                threadRootMessageId: rootMessageId,
                subscribed: booleanField(body, "subscribed"),
                notificationLevel: optionalEnumField(body, "notificationLevel", [
                    "all",
                    "mentions",
                    "none",
                ] as const),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/messages/:messageId/markThreadRead",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["throughMessageId"]);
            const selected = await repository.getMessage(userId, pathId(request, "messageId"));
            const rootMessageId = selected.threadRootMessageId ?? selected.id;
            const result = await repository.markThreadRead({
                actorUserId: userId,
                threadRootMessageId: rootMessageId,
                messageId: optionalIdField(body, "throughMessageId"),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { sync: result.hint };
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
        "/v0/messages/:messageId/editMessage",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["text", "reason", "expectedRevision"]);
            const result = await repository.editMessage({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                text: messageText(body, 0),
                reason: has(body, "reason")
                    ? (nullableTrimmedString(body, "reason", 500) ?? undefined)
                    : undefined,
                expectedRevision: optionalPositiveIntegerField(
                    body,
                    "expectedRevision",
                    Number.MAX_SAFE_INTEGER,
                ),
            });
            await publishHints(request, pubsub, [result.hint]);
            return { message: result.message, sync: result.hint };
        }),
    );
    app.get(
        "/v0/messages/:messageId/revisions",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return {
                revisions: await repository.listMessageRevisions(
                    userId,
                    pathId(request, "messageId"),
                ),
            };
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
    app.post(
        "/v0/messages/:messageId/pinMessage",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.setMessagePinned({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                pinned: true,
            });
            await publishHints(request, pubsub, [result.hint]);
            return { sync: result.hint };
        }),
    );
    app.post(
        "/v0/messages/:messageId/unpinMessage",
        authenticated(auth, async (request, _reply, userId) => {
            emptyBody(request);
            const result = await repository.setMessagePinned({
                actorUserId: userId,
                messageId: pathId(request, "messageId"),
                pinned: false,
            });
            await publishHints(request, pubsub, [result.hint]);
            return { sync: result.hint };
        }),
    );
    app.get(
        "/v0/chats/:chatId/pins",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return {
                pins: await repository.listChatPins(userId, pathId(request, "chatId")),
            };
        }),
    );
    app.get(
        "/v0/chats/:chatId/bookmarks",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return {
                bookmarks: await repository.listChatBookmarks(userId, pathId(request, "chatId")),
            };
        }),
    );
    app.post(
        "/v0/chats/:chatId/createBookmark",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, [
                "kind",
                "title",
                "url",
                "messageId",
                "fileId",
                "emoji",
            ]);
            const kind = enumField(body, "kind", ["link", "message", "file"] as const);
            const url = has(body, "url") ? httpUrlField(body, "url") : undefined;
            const messageId = optionalIdField(body, "messageId");
            const fileId = optionalIdField(body, "fileId");
            if (
                (kind === "link" && (!url || messageId || fileId)) ||
                (kind === "message" && (!messageId || url || fileId)) ||
                (kind === "file" && (!fileId || url || messageId))
            )
                throw new InvalidRequest("Bookmark target does not match its kind");
            const result = await repository.createChatBookmark({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                kind,
                title: trimmedString(body, "title", 200),
                url,
                messageId,
                fileId,
                emoji: has(body, "emoji")
                    ? (nullableTrimmedString(body, "emoji", 32) ?? undefined)
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint]);
            return reply.code(201).send({ bookmark: result.bookmark, sync: result.hint });
        }),
    );
    app.post(
        "/v0/chats/:chatId/deleteBookmark",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["bookmarkId"]);
            const result = await repository.deleteChatBookmark({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                bookmarkId: idField(body, "bookmarkId"),
            });
            await publishHints(request, pubsub, [result.hint]);
            return { sync: result.hint };
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
                statuses: await repository.listPresenceSettings(users.map((user) => user.id)),
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
                statuses: await repository.listPresenceSettings(users.map((user) => user.id)),
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
                statuses: await repository.listPresenceSettings(users.map((user) => user.id)),
            };
        }),
    );
    app.get(
        "/v0/presence",
        authenticated(auth, async (request) => {
            emptyQuery(request);
            const users = await repository.listContacts();
            return {
                presence: await pubsub.getPresenceSnapshot(users.map((user) => user.id)),
                statuses: await repository.listPresenceSettings(users.map((user) => user.id)),
            };
        }),
    );
    app.post(
        "/v0/me/updateStatus",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, [
                "availability",
                "customStatusText",
                "customStatusEmoji",
                "statusExpiresAt",
                "dndUntil",
            ]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one presence field is required");
            const result = await repository.updatePresenceSettings({
                actorUserId: userId,
                availability: optionalEnumField(body, "availability", [
                    "automatic",
                    "online",
                    "away",
                    "dnd",
                ] as const),
                customStatusText: nullableStringUpdate(body, "customStatusText", 200),
                customStatusEmoji: nullableStringUpdate(body, "customStatusEmoji", 32),
                statusExpiresAt: optionalNullableDateField(body, "statusExpiresAt"),
                dndUntil: optionalNullableDateField(body, "dndUntil"),
            });
            await publishHints(request, pubsub, [result.hint], { server: true });
            return { status: result.presence, sync: result.hint };
        }),
    );
    app.get(
        "/v0/me/notificationPreferences",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { preferences: await repository.getNotificationPreferences(userId) };
        }),
    );
    app.post(
        "/v0/me/updateNotificationPreferences",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, [
                "directMessages",
                "mentions",
                "threadReplies",
                "reactions",
                "calls",
                "emailNotifications",
                "desktopNotifications",
                "dndStartMinutes",
                "dndEndMinutes",
                "timezone",
            ]);
            if (Object.keys(body).length === 0)
                throw new InvalidRequest("At least one notification preference is required");
            const result = await repository.updateNotificationPreferences({
                actorUserId: userId,
                directMessages: optionalEnumField(body, "directMessages", ["all", "none"] as const),
                mentions: optionalEnumField(body, "mentions", ["all", "none"] as const),
                threadReplies: optionalEnumField(body, "threadReplies", [
                    "all",
                    "mentions",
                    "none",
                ] as const),
                reactions: optionalEnumField(body, "reactions", ["all", "none"] as const),
                calls: optionalEnumField(body, "calls", ["all", "none"] as const),
                emailNotifications: has(body, "emailNotifications")
                    ? booleanField(body, "emailNotifications")
                    : undefined,
                desktopNotifications: has(body, "desktopNotifications")
                    ? booleanField(body, "desktopNotifications")
                    : undefined,
                dndStartMinutes: optionalNullableMinute(body, "dndStartMinutes"),
                dndEndMinutes: optionalNullableMinute(body, "dndEndMinutes"),
                timezone: nullableStringUpdate(body, "timezone", 100),
            });
            await publishHints(request, pubsub, [result.hint], { userIds: [userId] });
            return { preferences: result.preferences, sync: result.hint };
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
            const query = requestQuery(request, ["q", "cursor", "limit"]);
            const search = queryString(query, "q", 200);
            if (search.trim().length === 0) throw new InvalidRequest("Search query is required");
            return repository.searchPage({
                userId,
                query: search.trim(),
                cursor: optionalQueryString(query, "cursor", 1_024),
                limit: queryLimit(query, "limit", 20, 50),
            });
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
        "/v0/calls",
        authenticated(auth, async (request, _reply, userId) => {
            const query = requestQuery(request, ["chatId", "limit"]);
            return {
                calls: await repository.listCalls({
                    userId,
                    chatId: optionalQueryString(query, "chatId", MAX_ID_LENGTH),
                    limit: queryLimit(query, "limit", 50, 100),
                }),
            };
        }),
    );
    app.get(
        "/v0/calls/:callId",
        authenticated(auth, async (request, _reply, userId) => {
            emptyQuery(request);
            return { call: await repository.getCall(userId, pathId(request, "callId")) };
        }),
    );
    app.post(
        "/v0/chats/:chatId/createCall",
        authenticated(auth, async (request, reply, userId) => {
            const body = requestBody(request, ["kind", "invitedUserIds"]);
            const result = await repository.createCall({
                actorUserId: userId,
                chatId: pathId(request, "chatId"),
                kind: enumField(body, "kind", ["audio", "video"] as const),
                invitedUserIds: has(body, "invitedUserIds")
                    ? idArrayField(body, "invitedUserIds", 50, false)
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint], {
                userIds: [userId, ...result.invitedUserIds],
            });
            return reply.code(201).send({ call: result.call, sync: result.hint });
        }),
    );
    for (const [path, action] of [
        ["joinCall", "join"],
        ["declineCall", "decline"],
        ["leaveCall", "leave"],
    ] as const)
        app.post(
            `/v0/calls/:callId/${path}`,
            authenticated(auth, async (request, _reply, userId) => {
                emptyBody(request);
                const result = await repository.updateCallParticipation({
                    actorUserId: userId,
                    callId: pathId(request, "callId"),
                    action,
                });
                await publishHints(request, pubsub, [result.hint], {
                    userIds: result.call.participants.map((participant) => participant.userId),
                });
                return { call: result.call, sync: result.hint };
            }),
        );
    app.post(
        "/v0/calls/:callId/endCall",
        authenticated(auth, async (request, _reply, userId) => {
            const body = requestBody(request, ["reason"]);
            const result = await repository.endCall({
                actorUserId: userId,
                callId: pathId(request, "callId"),
                reason: has(body, "reason")
                    ? (nullableTrimmedString(body, "reason", 200) ?? undefined)
                    : undefined,
            });
            await publishHints(request, pubsub, [result.hint], {
                userIds: result.call.participants.map((participant) => participant.userId),
            });
            return { call: result.call, sync: result.hint };
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
            const body = requestBody(request, [
                "name",
                "title",
                "photoFileId",
                "defaultRetentionMode",
                "defaultRetentionSeconds",
            ]);
            if (Object.keys(body).length === 0)
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
                defaultRetentionMode: optionalEnumField(body, "defaultRetentionMode", [
                    "forever",
                    "duration",
                ] as const),
                defaultRetentionSeconds: optionalNullablePositiveIntegerField(
                    body,
                    "defaultRetentionSeconds",
                    MAX_SELF_DESTRUCT_SECONDS * 100,
                ),
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
                "botId",
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
                botId: optionalIdField(body, "botId"),
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

function optionalPositiveIntegerField(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): number | undefined {
    if (!has(body, key)) return undefined;
    const value = body[key];
    if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
        throw new InvalidRequest(`${key} must be an integer between 1 and ${maximum}`);
    return value;
}

function optionalNullablePositiveIntegerField(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): number | null | undefined {
    if (!has(body, key)) return undefined;
    if (body[key] === null) return null;
    return optionalPositiveIntegerField(body, key, maximum);
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

function optionalQueryBoolean(query: Record<string, unknown>, key: string): boolean | undefined {
    if (!has(query, key)) return undefined;
    if (query[key] !== "true" && query[key] !== "false")
        throw new InvalidRequest(`${key} must be true or false`);
    return query[key] === "true";
}

function optionalNullableDateField(
    body: Record<string, unknown>,
    key: string,
): string | null | undefined {
    if (!has(body, key)) return undefined;
    if (body[key] === null) return null;
    if (typeof body[key] !== "string" || !Number.isFinite(Date.parse(body[key])))
        throw new InvalidRequest(`${key} must be an ISO date-time or null`);
    return new Date(body[key]).toISOString();
}

function nullableStringUpdate(
    body: Record<string, unknown>,
    key: string,
    maximum: number,
): string | null | undefined {
    if (!has(body, key)) return undefined;
    if (body[key] === null) return null;
    return nullableTrimmedString(body, key, maximum) ?? null;
}

function optionalNullableMinute(
    body: Record<string, unknown>,
    key: string,
): number | null | undefined {
    if (!has(body, key)) return undefined;
    if (body[key] === null) return null;
    const value = body[key];
    if (!Number.isSafeInteger(value) || (value as number) < 0 || (value as number) >= 1_440)
        throw new InvalidRequest(`${key} must be an integer from 0 through 1439 or null`);
    return value as number;
}

function httpUrlField(body: Record<string, unknown>, key: string): string {
    const value = trimmedString(body, key, 2_048);
    let parsed: URL;
    try {
        parsed = new URL(value);
    } catch {
        throw new InvalidRequest(`${key} must be a valid URL`);
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:")
        throw new InvalidRequest(`${key} must use http or https`);
    return parsed.toString();
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
