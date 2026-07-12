import { createId } from "@paralleldrive/cuid2";
import {
    createClient,
    type Client,
    type InArgs,
    type ResultSet,
    type Row,
    type Transaction,
} from "@libsql/client";
import type { FileKind } from "../database.js";
import {
    CollaborationError,
    type ChatKind,
    type ChatRole,
    type ChatSummary,
    type FileSummary,
    type MessageSummary,
    type MutationHint,
    type ReactionSummary,
    type SyncState,
    type UserSummary,
} from "./types.js";

type Executor = Pick<Client, "execute"> | Pick<Transaction, "execute">;
type ChatAccess = ChatSummary & { isServerAdmin: boolean };

interface ChatMutation {
    sequence: number;
    pts: number;
    chatId: string;
}

const CHAT_SELECT = `
    SELECT c.id, c.kind, c.name, c.slug, c.topic, c.created_by_user_id,
           c.pts, c.last_message_sequence, c.created_at, c.updated_at,
           cm.role AS membership_role, cm.membership_epoch,
           COALESCE(p.starred, 0) AS starred, p.sort_order
      FROM chats c
      LEFT JOIN chat_members cm
        ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
      LEFT JOIN user_chat_preferences p
        ON p.chat_id = c.id AND p.user_id = ?
`;

const USER_SELECT = `
    SELECT id, username, first_name, last_name, title, photo_file_id, role, last_access_at
      FROM users
`;

const FILE_SELECT = `
    SELECT id, kind, original_name, content_type, size, width, height, duration_ms,
           thumbhash, uploaded_by_user_id, created_at
      FROM files
`;

export class CollaborationRepository {
    private readonly client: Client;

    constructor(url: string, authToken?: string) {
        this.client = createClient({ url, authToken });
    }

    async initialize(): Promise<void> {
        await this.client.execute({
            sql: `INSERT OR IGNORE INTO server_sync_state (id, generation, sequence)
                  VALUES (1, ?, 0)`,
            args: [createId()],
        });
    }

    close(): void {
        this.client.close();
    }

    async getState(): Promise<SyncState> {
        const state = await one(
            this.client,
            `SELECT generation, sequence FROM server_sync_state WHERE id = 1`,
        );
        if (!state) throw new Error("Sync state has not been initialized");
        return syncState(state);
    }

    async canAccessChat(userId: string, chatId: string): Promise<boolean> {
        return Boolean(await this.chatAccess(this.client, userId, chatId, false));
    }

    async canPostToChat(userId: string, chatId: string): Promise<boolean> {
        return Boolean(await this.chatAccess(this.client, userId, chatId, true));
    }

    async listChats(userId: string): Promise<ChatSummary[]> {
        const result = await this.client.execute({
            sql: `${CHAT_SELECT}
                  WHERE c.deleted_at IS NULL
                    AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)
                  ORDER BY COALESCE(p.starred, 0) DESC,
                           CASE WHEN p.starred = 1 THEN p.sort_order END ASC,
                           c.updated_at DESC, c.id ASC`,
            args: [userId, userId],
        });
        return result.rows.map(asChat);
    }

    async getChat(userId: string, chatId: string): Promise<ChatSummary> {
        const chat = await this.chatAccess(this.client, userId, chatId, false);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        return chat;
    }

    async listChatMembers(userId: string, chatId: string): Promise<UserSummary[]> {
        const access = await this.chatAccess(this.client, userId, chatId, false);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.client.execute({
            sql: `${USER_SELECT}
                  WHERE deleted_at IS NULL
                    AND EXISTS (
                        SELECT 1 FROM accounts a WHERE a.id = users.account_id
                          AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL
                    )
                    AND id IN (
                        SELECT user_id FROM chat_members
                         WHERE chat_id = ? AND left_at IS NULL
                    )
                  ORDER BY lower(first_name), lower(last_name), id`,
            args: [chatId],
        });
        return result.rows.map(asUser);
    }

    async createChannel(input: {
        actorUserId: string;
        kind: "public_channel" | "private_channel";
        name: string;
        slug: string;
        topic?: string;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireActiveUser(tx, input.actorUserId);
            const id = createId();
            const membershipEpoch = createId();
            const sequence = await this.nextSequence(tx);
            try {
                await tx.execute({
                    sql: `INSERT INTO chats
                            (id, kind, name, slug, topic, created_by_user_id, pts,
                             last_change_sequence)
                          VALUES (?, ?, ?, ?, ?, ?, 1, ?)`,
                    args: [
                        id,
                        input.kind,
                        input.name,
                        input.slug,
                        input.topic ?? null,
                        input.actorUserId,
                        sequence,
                    ],
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError("conflict", "Channel slug is already in use");
                throw error;
            }
            await tx.execute({
                sql: `INSERT INTO chat_members
                        (chat_id, user_id, role, membership_epoch, sync_sequence)
                      VALUES (?, ?, 'owner', ?, ?)`,
                args: [id, input.actorUserId, membershipEpoch, sequence],
            });
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.created",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            const chat = await this.chatAccess(tx, input.actorUserId, id, false);
            if (!chat) throw new Error("Created channel is not readable");
            return { chat, hint: chatHint(sequence, id, 1) };
        });
    }

    async createDirectMessage(
        actorUserId: string,
        otherUserId: string,
    ): Promise<{ chat: ChatSummary; hint?: MutationHint }> {
        if (actorUserId === otherUserId)
            throw new CollaborationError("invalid", "A direct message requires another user");
        return this.write(async (tx) => {
            await this.requireActiveUser(tx, actorUserId);
            await this.requireActiveUser(tx, otherUserId);
            const dmKey = [actorUserId, otherUserId].sort().join(":");
            const existing = await one(tx, `SELECT id FROM chats WHERE dm_key = ?`, [dmKey]);
            if (existing) {
                const chat = await this.chatAccess(tx, actorUserId, text(existing.id), false);
                if (!chat) throw new Error("Existing DM is inaccessible");
                return { chat };
            }
            const id = createId();
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO chats
                        (id, kind, created_by_user_id, dm_key, pts, last_change_sequence)
                      VALUES (?, 'dm', ?, ?, 1, ?)`,
                args: [id, actorUserId, dmKey, sequence],
            });
            for (const userId of [actorUserId, otherUserId]) {
                await tx.execute({
                    sql: `INSERT INTO chat_members
                            (chat_id, user_id, role, membership_epoch, sync_sequence)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        userId,
                        userId === actorUserId ? "owner" : "member",
                        createId(),
                        sequence,
                    ],
                });
            }
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.created",
                entityId: id,
                actorUserId,
            });
            const chat = await this.chatAccess(tx, actorUserId, id, false);
            if (!chat) throw new Error("Created DM is not readable");
            return { chat, hint: chatHint(sequence, id, 1) };
        });
    }

    async updateTopic(
        actorUserId: string,
        chatId: string,
        topic: string | undefined,
    ): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, actorUserId, chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct messages do not have topics");
            const mutation = await this.advanceChat(
                tx,
                actorUserId,
                chatId,
                "chat.topicChanged",
                chatId,
            );
            await tx.execute({
                sql: `UPDATE chats SET topic = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [topic ?? null, chatId],
            });
            const chat = await this.chatAccess(tx, actorUserId, chatId, false);
            if (!chat) throw new Error("Updated chat is not readable");
            return { chat, hint: chatHint(mutation.sequence, chatId, mutation.pts) };
        });
    }

    async joinPublicChannel(
        actorUserId: string,
        chatId: string,
    ): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, actorUserId, chatId, false);
            if (!access || access.kind !== "public_channel")
                throw new CollaborationError("not_found", "Public channel was not found");
            if (access.membershipRole)
                throw new CollaborationError("conflict", "Already joined this channel");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                actorUserId,
                chatId,
                "member.joined",
                actorUserId,
                actorUserId,
            );
            await tx.execute({
                sql: `INSERT INTO chat_members
                        (chat_id, user_id, role, membership_epoch, sync_sequence)
                      VALUES (?, ?, 'member', ?, ?)
                      ON CONFLICT(chat_id, user_id) DO UPDATE SET
                        role = 'member', membership_epoch = excluded.membership_epoch,
                        sync_sequence = excluded.sync_sequence, joined_at = CURRENT_TIMESTAMP,
                        left_at = NULL`,
                args: [chatId, actorUserId, createId(), sequence],
            });
            const chat = await this.chatAccess(tx, actorUserId, chatId, false);
            if (!chat) throw new Error("Joined chat is not readable");
            return { chat, hint: chatHint(sequence, chatId, mutation.pts) };
        });
    }

    async leaveChannel(actorUserId: string, chatId: string): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, actorUserId, chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message membership is fixed");
            if (access.membershipRole === "owner") {
                const otherManager = await one(
                    tx,
                    `SELECT 1 AS found FROM chat_members
                      WHERE chat_id = ? AND user_id != ? AND left_at IS NULL
                        AND role IN ('owner', 'admin') LIMIT 1`,
                    [chatId, actorUserId],
                );
                if (!otherManager)
                    throw new CollaborationError(
                        "conflict",
                        "Assign another channel manager before leaving",
                    );
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                actorUserId,
                chatId,
                "member.left",
                actorUserId,
                actorUserId,
            );
            await tx.execute({
                sql: `UPDATE chat_members
                         SET left_at = CURRENT_TIMESTAMP, sync_sequence = ?
                       WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                args: [sequence, chatId, actorUserId],
            });
            return { hint: chatHint(sequence, chatId, mutation.pts) };
        });
    }

    async addChannelMember(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role?: ChatRole;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message membership is fixed");
            if (
                input.role === "owner" &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner"
            )
                throw new CollaborationError("forbidden", "Only an owner can assign ownership");
            await this.requireActiveUser(tx, input.userId);
            const existing = await one(
                tx,
                `SELECT left_at FROM chat_members WHERE chat_id = ? AND user_id = ?`,
                [input.chatId, input.userId],
            );
            if (existing && existing.left_at === null)
                throw new CollaborationError("conflict", "User is already a channel member");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "member.joined",
                input.userId,
                input.userId,
            );
            await tx.execute({
                sql: `INSERT INTO chat_members
                        (chat_id, user_id, role, membership_epoch, sync_sequence)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(chat_id, user_id) DO UPDATE SET
                        role = excluded.role, membership_epoch = excluded.membership_epoch,
                        sync_sequence = excluded.sync_sequence, joined_at = CURRENT_TIMESTAMP,
                        left_at = NULL`,
                args: [input.chatId, input.userId, input.role ?? "member", createId(), sequence],
            });
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async removeChannelMember(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message membership is fixed");
            const member = await one(
                tx,
                `SELECT role FROM chat_members
                  WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                [input.chatId, input.userId],
            );
            if (!member) throw new CollaborationError("not_found", "Member was not found");
            if (member.role === "owner" && !access.isServerAdmin)
                throw new CollaborationError(
                    "forbidden",
                    "Only a server admin can remove an owner",
                );
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "member.removed",
                input.userId,
                input.userId,
            );
            await tx.execute({
                sql: `UPDATE chat_members
                         SET left_at = CURRENT_TIMESTAMP, sync_sequence = ?
                       WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                args: [sequence, input.chatId, input.userId],
            });
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async setStar(
        actorUserId: string,
        chatId: string,
        starred: boolean,
    ): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            if (!(await this.chatAccess(tx, actorUserId, chatId, false)))
                throw new CollaborationError("not_found", "Chat was not found");
            const sequence = await this.nextSequence(tx);
            const nextOrder = starred
                ? number(
                      (
                          await one(
                              tx,
                              `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
                                 FROM user_chat_preferences
                                WHERE user_id = ? AND starred = 1`,
                              [actorUserId],
                          )
                      )?.next_order,
                  )
                : 0;
            await tx.execute({
                sql: `INSERT INTO user_chat_preferences
                        (user_id, chat_id, starred, sort_order, sync_sequence)
                      VALUES (?, ?, ?, ?, ?)
                      ON CONFLICT(user_id, chat_id) DO UPDATE SET
                        starred = excluded.starred, sort_order = excluded.sort_order,
                        sync_sequence = excluded.sync_sequence, updated_at = CURRENT_TIMESTAMP`,
                args: [actorUserId, chatId, starred ? 1 : 0, nextOrder, sequence],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.changed",
                entityId: chatId,
                actorUserId,
                targetUserId: actorUserId,
            });
            return { hint: areaHint(sequence, "preferences") };
        });
    }

    async reorderStarred(actorUserId: string, chatIds: string[]): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const starred = await tx.execute({
                sql: `SELECT chat_id FROM user_chat_preferences
                       WHERE user_id = ? AND starred = 1 ORDER BY sort_order, chat_id`,
                args: [actorUserId],
            });
            const current = starred.rows.map((row) => text(row.chat_id)).sort();
            const supplied = [...new Set(chatIds)].sort();
            if (
                current.length !== chatIds.length ||
                current.length !== supplied.length ||
                current.some((id, index) => id !== supplied[index])
            )
                throw new CollaborationError(
                    "invalid",
                    "Order must contain every starred chat exactly once",
                );
            const sequence = await this.nextSequence(tx);
            for (const [sortOrder, chatId] of chatIds.entries()) {
                await tx.execute({
                    sql: `UPDATE user_chat_preferences
                             SET sort_order = ?, sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE user_id = ? AND chat_id = ? AND starred = 1`,
                    args: [sortOrder, sequence, actorUserId, chatId],
                });
            }
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.reordered",
                actorUserId,
                targetUserId: actorUserId,
            });
            return { hint: areaHint(sequence, "preferences") };
        });
    }

    async sendMessage(input: {
        actorUserId: string;
        chatId: string;
        text: string;
        attachmentFileIds?: string[];
        quotedMessageId?: string;
        threadRootMessageId?: string;
        expiresAt?: string;
        clientMutationId?: string;
        kind?: "user" | "automated";
        forwardedFromMessageId?: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint }> {
        const scope = `message.send:${input.chatId}`;
        return this.write(async (tx) => {
            if (input.kind === "automated") await this.requireServerAdmin(tx, input.actorUserId);
            if (input.clientMutationId) {
                const previous = await this.findClientMutation(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                );
                if (previous) {
                    const message = await this.getMessageProjection(
                        tx,
                        input.actorUserId,
                        text(previous.messageId),
                    );
                    if (!message) throw new Error("Idempotent message result is missing");
                    return {
                        message,
                        hint: chatHint(
                            number(previous.sequence),
                            input.chatId,
                            number(previous.pts),
                        ),
                    };
                }
            }
            const access = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (input.quotedMessageId)
                await this.requireMessageInChat(tx, input.quotedMessageId, input.chatId);
            if (input.forwardedFromMessageId) {
                const source = await this.getMessageProjection(
                    tx,
                    input.actorUserId,
                    input.forwardedFromMessageId,
                );
                if (!source || source.deletedAt)
                    throw new CollaborationError("not_found", "Source message was not found");
            }
            if (input.threadRootMessageId) {
                const root = await this.requireMessageInChat(
                    tx,
                    input.threadRootMessageId,
                    input.chatId,
                );
                if (root.thread_root_message_id)
                    throw new CollaborationError("invalid", "Threads cannot be nested");
            }
            const fileIds = [...new Set(input.attachmentFileIds ?? [])];
            for (const fileId of fileIds)
                if (!(await this.canAccessFileWith(tx, input.actorUserId, fileId)))
                    throw new CollaborationError("not_found", "Attachment file was not found");
            const id = createId();
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                input.threadRootMessageId ? "thread.messageCreated" : "message.created",
                id,
                undefined,
                true,
            );
            if (mutation.messageSequence === undefined)
                throw new Error("Message sequence was not allocated");
            await tx.execute({
                sql: `INSERT INTO messages
                        (id, chat_id, sequence, change_pts, sender_user_id, kind, text,
                         quoted_message_id, thread_root_message_id,
                         forwarded_from_message_id, expires_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.chatId,
                    mutation.messageSequence,
                    mutation.pts,
                    input.kind === "automated" ? null : input.actorUserId,
                    input.kind ?? "user",
                    input.text,
                    input.quotedMessageId ?? null,
                    input.threadRootMessageId ?? null,
                    input.forwardedFromMessageId ?? null,
                    input.expiresAt ?? null,
                ],
            });
            for (const [position, fileId] of fileIds.entries()) {
                await tx.execute({
                    sql: `INSERT INTO message_attachments (message_id, file_id, position)
                          VALUES (?, ?, ?)`,
                    args: [id, fileId, position],
                });
            }
            if (input.threadRootMessageId) {
                await tx.execute({
                    sql: `INSERT INTO threads
                            (root_message_id, chat_id, created_by_user_id, reply_count, last_pts)
                          VALUES (?, ?, ?, 1, ?)
                          ON CONFLICT(root_message_id) DO UPDATE SET
                            reply_count = reply_count + 1, last_pts = excluded.last_pts,
                            updated_at = CURRENT_TIMESTAMP`,
                    args: [
                        input.threadRootMessageId,
                        input.chatId,
                        input.actorUserId,
                        mutation.pts,
                    ],
                });
                await tx.execute({
                    sql: `UPDATE messages SET change_pts = ? WHERE id = ?`,
                    args: [mutation.pts, input.threadRootMessageId],
                });
            }
            if (input.clientMutationId)
                await this.storeClientMutation(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                    { messageId: id, sequence, pts: mutation.pts },
                );
            const message = await this.getMessageProjection(tx, input.actorUserId, id);
            if (!message) throw new Error("Created message is not readable");
            return { message, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async forwardMessage(input: {
        actorUserId: string;
        messageId: string;
        targetChatIds: string[];
        clientMutationId?: string;
    }): Promise<{ messages: MessageSummary[]; hints: MutationHint[] }> {
        const targetChatIds = [...new Set(input.targetChatIds)];
        const scope = `message.forward:${input.messageId}`;
        return this.write(async (tx) => {
            if (input.clientMutationId) {
                const previous = await this.findClientMutation(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                );
                if (previous) {
                    const ids = Array.isArray(previous.messageIds)
                        ? previous.messageIds.map((id) => text(id))
                        : [];
                    const points = Array.isArray(previous.points)
                        ? (previous.points as Array<Record<string, unknown>>)
                        : [];
                    const messages: MessageSummary[] = [];
                    for (const id of ids) {
                        const message = await this.getMessageProjection(tx, input.actorUserId, id);
                        if (message) messages.push(message);
                    }
                    return {
                        messages,
                        hints: points.map((point) =>
                            chatHint(
                                number(previous.sequence),
                                text(point.chatId),
                                number(point.pts),
                            ),
                        ),
                    };
                }
            }
            const source = await this.getMessageProjection(tx, input.actorUserId, input.messageId);
            if (!source || source.deletedAt)
                throw new CollaborationError("not_found", "Source message was not found");
            for (const chatId of targetChatIds)
                if (!(await this.chatAccess(tx, input.actorUserId, chatId, true)))
                    throw new CollaborationError("not_found", "Destination chat was not found");
            const sequence = await this.nextSequence(tx);
            const messages: MessageSummary[] = [];
            const hints: MutationHint[] = [];
            const messageIds: string[] = [];
            const points: Array<{ chatId: string; pts: number }> = [];
            for (const chatId of targetChatIds) {
                const id = createId();
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    "message.forwarded",
                    id,
                    undefined,
                    true,
                );
                if (mutation.messageSequence === undefined)
                    throw new Error("Message sequence was not allocated");
                await tx.execute({
                    sql: `INSERT INTO messages
                            (id, chat_id, sequence, change_pts, sender_user_id, kind, text,
                             forwarded_from_message_id)
                          VALUES (?, ?, ?, ?, ?, 'user', ?, ?)`,
                    args: [
                        id,
                        chatId,
                        mutation.messageSequence,
                        mutation.pts,
                        input.actorUserId,
                        source.text,
                        source.id,
                    ],
                });
                for (const [position, file] of source.attachments.entries())
                    await tx.execute({
                        sql: `INSERT INTO message_attachments (message_id, file_id, position)
                              VALUES (?, ?, ?)`,
                        args: [id, file.id, position],
                    });
                const message = await this.getMessageProjection(tx, input.actorUserId, id);
                if (!message) throw new Error("Forwarded message is not readable");
                messages.push(message);
                messageIds.push(id);
                points.push({ chatId, pts: mutation.pts });
                hints.push(chatHint(sequence, chatId, mutation.pts));
            }
            if (input.clientMutationId)
                await this.storeClientMutation(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                    { messageIds, sequence, points },
                );
            return { messages, hints };
        });
    }

    async getMessage(userId: string, messageId: string): Promise<MessageSummary> {
        const message = await this.getMessageProjection(this.client, userId, messageId);
        if (!message) throw new CollaborationError("not_found", "Message was not found");
        return message;
    }

    async listMessages(input: {
        userId: string;
        chatId: string;
        beforeSequence?: number;
        afterSequence?: number;
        threadRootMessageId?: string;
        limit: number;
    }): Promise<{ messages: MessageSummary[]; chatPts: string; hasMore: boolean }> {
        const chat = await this.chatAccess(this.client, input.userId, input.chatId, false);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        const conditions = ["m.chat_id = ?"];
        const args: InArgs = [input.chatId];
        if (input.threadRootMessageId) {
            conditions.push("m.thread_root_message_id = ?");
            args.push(input.threadRootMessageId);
        } else conditions.push("m.thread_root_message_id IS NULL");
        if (input.beforeSequence !== undefined) {
            conditions.push("m.sequence < ?");
            args.push(input.beforeSequence);
        }
        if (input.afterSequence !== undefined) {
            conditions.push("m.sequence > ?");
            args.push(input.afterSequence);
        }
        const ascending = input.afterSequence !== undefined;
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `SELECT m.id FROM messages m
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY m.sequence ${ascending ? "ASC" : "DESC"}
                   LIMIT ?`,
            args,
        });
        const hasMore = result.rows.length > input.limit;
        const ids = result.rows.slice(0, input.limit).map((row) => text(row.id));
        const messages: MessageSummary[] = [];
        for (const id of ids) {
            const message = await this.getMessageProjection(this.client, input.userId, id);
            if (message) messages.push(message);
        }
        if (!ascending) messages.reverse();
        return { messages, chatPts: chat.pts, hasMore };
    }

    async deleteMessage(
        actorUserId: string,
        messageId: string,
    ): Promise<{ message: MessageSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const row = await one(
                tx,
                `SELECT m.chat_id, m.sender_user_id, m.deleted_at, m.thread_root_message_id,
                        u.role AS actor_role
                   FROM messages m JOIN users u ON u.id = ?
                  WHERE m.id = ?`,
                [actorUserId, messageId],
            );
            if (!row) throw new CollaborationError("not_found", "Message was not found");
            if (!(await this.chatAccess(tx, actorUserId, text(row.chat_id), false)))
                throw new CollaborationError("not_found", "Message was not found");
            if (row.deleted_at !== null)
                throw new CollaborationError("conflict", "Message is already deleted");
            if (text(row.sender_user_id, "") !== actorUserId && row.actor_role !== "admin")
                throw new CollaborationError("forbidden", "Cannot delete this message");
            const chatId = text(row.chat_id);
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                actorUserId,
                chatId,
                "message.deleted",
                messageId,
            );
            await tx.execute({
                sql: `UPDATE messages
                         SET text = '', deleted_at = CURRENT_TIMESTAMP,
                             deleted_by_user_id = ?, change_pts = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [actorUserId, mutation.pts, messageId],
            });
            if (row.thread_root_message_id) {
                await tx.execute({
                    sql: `UPDATE threads
                             SET reply_count = MAX(0, reply_count - 1), last_pts = ?,
                                 updated_at = CURRENT_TIMESTAMP
                           WHERE root_message_id = ?`,
                    args: [mutation.pts, row.thread_root_message_id],
                });
            }
            const message = await this.getMessageProjection(tx, actorUserId, messageId);
            if (!message) throw new Error("Deleted message tombstone is not readable");
            return { message, hint: chatHint(sequence, chatId, mutation.pts) };
        });
    }

    async setReaction(input: {
        actorUserId: string;
        messageId: string;
        emoji?: string;
        customEmojiId?: string;
        active: boolean;
    }): Promise<{ message: MessageSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            if (Boolean(input.emoji) === Boolean(input.customEmojiId))
                throw new CollaborationError(
                    "invalid",
                    "Exactly one reaction identifier is required",
                );
            const message = await this.getMessageProjection(tx, input.actorUserId, input.messageId);
            if (!message || message.deletedAt)
                throw new CollaborationError("not_found", "Message was not found");
            const reactionKey = input.customEmojiId
                ? `custom:${input.customEmojiId}`
                : `unicode:${input.emoji}`;
            if (input.customEmojiId) {
                const custom = await one(
                    tx,
                    `SELECT 1 AS found FROM custom_emojis
                      WHERE id = ? AND deleted_at IS NULL`,
                    [input.customEmojiId],
                );
                if (!custom)
                    throw new CollaborationError("not_found", "Custom emoji was not found");
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                message.chatId,
                "reaction.changed",
                input.messageId,
            );
            if (input.active) {
                await tx.execute({
                    sql: `INSERT OR IGNORE INTO reactions
                            (message_id, user_id, reaction_key, emoji, custom_emoji_id)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [
                        input.messageId,
                        input.actorUserId,
                        reactionKey,
                        input.emoji ?? null,
                        input.customEmojiId ?? null,
                    ],
                });
            } else {
                await tx.execute({
                    sql: `DELETE FROM reactions
                           WHERE message_id = ? AND user_id = ? AND reaction_key = ?`,
                    args: [input.messageId, input.actorUserId, reactionKey],
                });
            }
            await tx.execute({
                sql: `UPDATE messages SET change_pts = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [mutation.pts, input.messageId],
            });
            const updated = await this.getMessageProjection(tx, input.actorUserId, input.messageId);
            if (!updated) throw new Error("Reacted message is not readable");
            return {
                message: updated,
                hint: chatHint(sequence, message.chatId, mutation.pts),
            };
        });
    }

    async getDifference(input: {
        userId: string;
        generation: string;
        fromSequence: number;
        untilSequence?: number;
        limit: number;
    }): Promise<{
        kind: "empty" | "difference" | "slice" | "reset";
        changedChats: ChatSummary[];
        removedChatIds: string[];
        areas: string[];
        state: SyncState;
        targetState: SyncState;
    }> {
        const current = await this.getState();
        if (input.generation !== current.generation) {
            return {
                kind: "reset",
                changedChats: [],
                removedChatIds: [],
                areas: ["all"],
                state: current,
                targetState: current,
            };
        }
        const currentSequence = number(current.sequence);
        if (input.untilSequence !== undefined && input.untilSequence > currentSequence)
            throw new CollaborationError("future_state", "Sync target is ahead of the server");
        const target = Math.min(input.untilSequence ?? currentSequence, currentSequence);
        if (input.fromSequence > currentSequence || target < input.fromSequence)
            throw new CollaborationError("future_state", "Sync cursor is ahead of the server");
        const page = await this.client.execute({
            sql: `SELECT DISTINCT sequence FROM sync_events
                   WHERE sequence > ? AND sequence <= ?
                   ORDER BY sequence ASC LIMIT ?`,
            args: [input.fromSequence, target, input.limit + 1],
        });
        const sequences = page.rows.map((row) => number(row.sequence));
        const hasMore = sequences.length > input.limit;
        const included = sequences.slice(0, input.limit);
        const intermediate = hasMore ? included.at(-1)! : target;
        if (included.length === 0) {
            const state = stateAt(current.generation, target);
            return {
                kind: "empty",
                changedChats: [],
                removedChatIds: [],
                areas: [],
                state,
                targetState: state,
            };
        }
        const placeholders = included.map(() => "?").join(", ");
        const events = await this.client.execute({
            sql: `SELECT sequence, kind, chat_id, target_user_id
                    FROM sync_events WHERE sequence IN (${placeholders})
                   ORDER BY sequence, id`,
            args: included,
        });
        const changedChatIds = new Set<string>();
        const removedChatIds = new Set<string>();
        const areas = new Set<string>();
        for (const event of events.rows) {
            const targetUserId = optionalText(event.target_user_id);
            const kind = text(event.kind);
            const chatId = optionalText(event.chat_id);
            if (!chatId && targetUserId && targetUserId !== input.userId) continue;
            if (
                chatId &&
                targetUserId === input.userId &&
                (kind === "member.removed" || kind === "member.left")
            ) {
                if (!(await this.canAccessChat(input.userId, chatId))) removedChatIds.add(chatId);
                else changedChatIds.add(chatId);
                continue;
            }
            if (chatId && (await this.canAccessChat(input.userId, chatId))) {
                changedChatIds.add(chatId);
                continue;
            }
            if (kind.startsWith("preferences.")) areas.add("preferences");
            else if (kind.startsWith("user.")) areas.add("users");
            else if (kind.startsWith("emoji.")) areas.add("emoji");
            else if (kind.startsWith("server.")) areas.add("server");
            else if (!chatId) areas.add("directories");
        }
        const changedChats: ChatSummary[] = [];
        for (const chatId of changedChatIds) {
            const chat = await this.chatAccess(this.client, input.userId, chatId, false);
            if (chat) changedChats.push(chat);
        }
        const state = stateAt(current.generation, intermediate);
        const visibleChanges = changedChats.length + removedChatIds.size + areas.size;
        return {
            kind: hasMore ? "slice" : visibleChanges === 0 ? "empty" : "difference",
            changedChats,
            removedChatIds: [...removedChatIds],
            areas: [...areas],
            state,
            targetState: stateAt(current.generation, target),
        };
    }

    async getChatDifference(input: {
        userId: string;
        chatId: string;
        membershipEpoch: string;
        fromPts: number;
        untilPts?: number;
        limit: number;
    }): Promise<{
        kind: "empty" | "difference" | "slice" | "reset" | "tooLong";
        updates: Array<{ pts: string; ptsCount: 1; kind: string; entityId?: string }>;
        messages: MessageSummary[];
        chat: ChatSummary;
        state: { membershipEpoch: string; pts: string };
        targetState: { membershipEpoch: string; pts: string };
    }> {
        const chat = await this.getChat(input.userId, input.chatId);
        const currentPts = number(chat.pts);
        const currentEpoch = chat.membershipEpoch;
        if (input.untilPts !== undefined && input.untilPts > currentPts)
            throw new CollaborationError("future_state", "Chat target is ahead of the server");
        const target = Math.min(input.untilPts ?? currentPts, currentPts);
        const base = {
            updates: [],
            messages: [],
            chat,
            state: { membershipEpoch: currentEpoch, pts: String(currentPts) },
            targetState: { membershipEpoch: currentEpoch, pts: String(currentPts) },
        };
        if (currentEpoch !== input.membershipEpoch) return { kind: "reset", ...base };
        if (input.fromPts > currentPts || target < input.fromPts)
            throw new CollaborationError("future_state", "Chat cursor is ahead of the server");
        const recoverable = await one(
            this.client,
            `SELECT min_recoverable_pts FROM chats WHERE id = ?`,
            [input.chatId],
        );
        if (input.fromPts < number(recoverable?.min_recoverable_pts, 0))
            return { kind: "tooLong", ...base };
        const result = await this.client.execute({
            sql: `SELECT pts, pts_count, kind, entity_id
                    FROM chat_updates
                   WHERE chat_id = ? AND pts > ? AND pts <= ?
                   ORDER BY pts ASC LIMIT ?`,
            args: [input.chatId, input.fromPts, target, input.limit + 1],
        });
        const hasMore = result.rows.length > input.limit;
        const rows = result.rows.slice(0, input.limit);
        const intermediate = hasMore ? number(rows.at(-1)?.pts) : target;
        const updates = rows.map((row) => ({
            pts: text(row.pts),
            ptsCount: 1 as const,
            kind: text(row.kind),
            entityId: optionalText(row.entity_id),
        }));
        const messageIds = new Set(
            updates
                .filter(
                    (update) =>
                        update.entityId &&
                        (update.kind.startsWith("message.") ||
                            update.kind.startsWith("reaction.") ||
                            update.kind.startsWith("thread.")),
                )
                .map((update) => update.entityId!),
        );
        const messages: MessageSummary[] = [];
        const projectedMessageIds = new Set<string>();
        for (const messageId of messageIds) {
            const message = await this.getMessageProjection(this.client, input.userId, messageId);
            if (!message) continue;
            messages.push(message);
            projectedMessageIds.add(message.id);
            if (
                message.threadRootMessageId &&
                !projectedMessageIds.has(message.threadRootMessageId)
            ) {
                const root = await this.getMessageProjection(
                    this.client,
                    input.userId,
                    message.threadRootMessageId,
                );
                if (root) {
                    messages.push(root);
                    projectedMessageIds.add(root.id);
                }
            }
        }
        const state = { membershipEpoch: currentEpoch, pts: String(intermediate) };
        const targetState = { membershipEpoch: currentEpoch, pts: String(target) };
        return {
            kind: rows.length === 0 ? "empty" : hasMore ? "slice" : "difference",
            updates,
            messages,
            chat: await this.getChat(input.userId, input.chatId),
            state,
            targetState,
        };
    }

    async expireDueMessages(limit = 100): Promise<MutationHint | undefined> {
        return this.write(async (tx) => {
            const due = await tx.execute({
                sql: `SELECT id, chat_id, thread_root_message_id FROM messages
                       WHERE deleted_at IS NULL AND expires_at IS NOT NULL
                         AND datetime(expires_at) <= CURRENT_TIMESTAMP
                       ORDER BY expires_at, id LIMIT ?`,
                args: [limit],
            });
            if (due.rows.length === 0) return undefined;
            const sequence = await this.nextSequence(tx);
            const chats = new Map<string, number>();
            for (const row of due.rows) {
                const messageId = text(row.id);
                const chatId = text(row.chat_id);
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    undefined,
                    chatId,
                    "message.expired",
                    messageId,
                );
                const changed = await tx.execute({
                    sql: `UPDATE messages
                             SET text = '', deleted_at = CURRENT_TIMESTAMP,
                                 change_pts = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ? AND deleted_at IS NULL
                             AND datetime(expires_at) <= CURRENT_TIMESTAMP`,
                    args: [mutation.pts, messageId],
                });
                if (changed.rowsAffected) {
                    const threadRootMessageId = optionalText(row.thread_root_message_id);
                    if (threadRootMessageId) {
                        await tx.execute({
                            sql: `UPDATE threads
                                     SET reply_count = MAX(0, reply_count - 1), last_pts = ?,
                                         updated_at = CURRENT_TIMESTAMP
                                   WHERE root_message_id = ?`,
                            args: [mutation.pts, threadRootMessageId],
                        });
                        await tx.execute({
                            sql: `UPDATE messages SET change_pts = ? WHERE id = ?`,
                            args: [mutation.pts, threadRootMessageId],
                        });
                    }
                    chats.set(chatId, mutation.pts);
                }
            }
            return {
                sequence: String(sequence),
                chats: [...chats].map(([chatId, pts]) => ({ chatId, pts: String(pts) })),
                areas: [],
            };
        });
    }

    async listContacts(): Promise<UserSummary[]> {
        const result = await this.client.execute(
            `${USER_SELECT}
              WHERE deleted_at IS NULL
                AND EXISTS (
                    SELECT 1 FROM accounts a WHERE a.id = users.account_id
                      AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL
                )
              ORDER BY lower(first_name), lower(last_name), id`,
        );
        return result.rows.map(asUser);
    }

    async listDirectoryChannels(userId: string): Promise<ChatSummary[]> {
        const result = await this.client.execute({
            sql: `${CHAT_SELECT}
                  WHERE c.deleted_at IS NULL
                    AND c.kind IN ('public_channel', 'private_channel')
                    AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)
                  ORDER BY lower(c.name), c.id`,
            args: [userId, userId],
        });
        return result.rows.map(asChat);
    }

    async listFiles(input: {
        userId: string;
        kind?: FileKind;
        before?: string;
        limit: number;
    }): Promise<{ files: FileSummary[]; nextCursor?: string }> {
        const conditions = [
            "m.deleted_at IS NULL",
            "(m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)",
            "c.deleted_at IS NULL",
            "(c.kind = 'public_channel' OR cm.user_id IS NOT NULL)",
        ];
        const args: InArgs = [input.userId];
        if (input.kind) {
            conditions.push("f.kind = ?");
            args.push(input.kind);
        }
        if (input.before) {
            conditions.push(`(
                f.created_at < (SELECT created_at FROM files WHERE id = ?)
                OR (f.created_at = (SELECT created_at FROM files WHERE id = ?) AND f.id < ?)
            )`);
            args.push(input.before, input.before, input.before);
        }
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `SELECT DISTINCT f.id, f.kind, f.original_name, f.content_type, f.size,
                                  f.width, f.height, f.duration_ms, f.thumbhash,
                                  f.uploaded_by_user_id, f.created_at
                    FROM files f
                    JOIN message_attachments ma ON ma.file_id = f.id
                    JOIN messages m ON m.id = ma.message_id
                    JOIN chats c ON c.id = m.chat_id
               LEFT JOIN chat_members cm
                      ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY f.created_at DESC, f.id DESC LIMIT ?`,
            args,
        });
        const hasMore = result.rows.length > input.limit;
        const rows = result.rows.slice(0, input.limit);
        return {
            files: rows.map(asFile),
            nextCursor: hasMore ? text(rows.at(-1)?.id) : undefined,
        };
    }

    async canAccessFile(userId: string, fileId: string): Promise<boolean> {
        return this.canAccessFileWith(this.client, userId, fileId);
    }

    async listCustomEmoji(): Promise<
        Array<{ id: string; name: string; file: FileSummary; createdByUserId: string }>
    > {
        const result = await this.client.execute({
            sql: `SELECT e.id AS emoji_id, e.name, e.created_by_user_id,
                         f.id, f.kind, f.original_name, f.content_type, f.size, f.width,
                         f.height, f.duration_ms, f.thumbhash, f.uploaded_by_user_id, f.created_at
                    FROM custom_emojis e JOIN files f ON f.id = e.file_id
                   WHERE e.deleted_at IS NULL ORDER BY e.name`,
            args: [],
        });
        return result.rows.map((row) => ({
            id: text(row.emoji_id),
            name: text(row.name),
            file: asFile(row),
            createdByUserId: text(row.created_by_user_id),
        }));
    }

    async createCustomEmoji(input: { actorUserId: string; name: string; fileId: string }): Promise<{
        emoji: { id: string; name: string; file: FileSummary; createdByUserId: string };
        hint: MutationHint;
    }> {
        return this.write(async (tx) => {
            await this.requireActiveUser(tx, input.actorUserId);
            const file = await one(tx, `${FILE_SELECT} WHERE id = ?`, [input.fileId]);
            if (
                !file ||
                !(await this.canAccessFileWith(tx, input.actorUserId, input.fileId)) ||
                !["photo", "gif"].includes(text(file.kind))
            )
                throw new CollaborationError("not_found", "Emoji image file was not found");
            const id = createId();
            const sequence = await this.nextSequence(tx);
            try {
                await tx.execute({
                    sql: `INSERT INTO custom_emojis
                            (id, name, file_id, created_by_user_id, sync_sequence)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [id, input.name, input.fileId, input.actorUserId, sequence],
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError("conflict", "Emoji name is already in use");
                throw error;
            }
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "emoji.created",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            return {
                emoji: {
                    id,
                    name: input.name,
                    file: asFile(file),
                    createdByUserId: input.actorUserId,
                },
                hint: areaHint(sequence, "emoji"),
            };
        });
    }

    async deleteCustomEmoji(actorUserId: string, emojiId: string): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const emoji = await one(
                tx,
                `SELECT e.created_by_user_id, u.role AS actor_role
                   FROM custom_emojis e JOIN users u ON u.id = ?
                  WHERE e.id = ? AND e.deleted_at IS NULL`,
                [actorUserId, emojiId],
            );
            if (!emoji) throw new CollaborationError("not_found", "Emoji was not found");
            if (emoji.created_by_user_id !== actorUserId && emoji.actor_role !== "admin")
                throw new CollaborationError("forbidden", "Cannot delete this emoji");
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE custom_emojis
                         SET deleted_at = CURRENT_TIMESTAMP, sync_sequence = ? WHERE id = ?`,
                args: [sequence, emojiId],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "emoji.deleted",
                entityId: emojiId,
                actorUserId,
            });
            return { hint: areaHint(sequence, "emoji") };
        });
    }

    async search(
        userId: string,
        query: string,
        limit: number,
    ): Promise<
        Array<
            | { type: "message"; score: number; message: MessageSummary }
            | { type: "channel"; score: number; channel: ChatSummary }
            | { type: "user"; score: number; user: UserSummary }
        >
    > {
        const normalized = normalizeSearch(query);
        const candidates: Array<
            | { type: "message"; score: number; message: MessageSummary }
            | { type: "channel"; score: number; channel: ChatSummary }
            | { type: "user"; score: number; user: UserSummary }
        > = [];
        const users = await this.listContacts();
        for (const user of users) {
            const score = fuzzyScore(
                normalized,
                [user.username, user.firstName, user.lastName, user.title]
                    .filter(Boolean)
                    .join(" "),
            );
            if (score > 0) candidates.push({ type: "user", score, user });
        }
        const channels = await this.listDirectoryChannels(userId);
        for (const channel of channels) {
            const score = fuzzyScore(
                normalized,
                [channel.name, channel.slug, channel.topic].filter(Boolean).join(" "),
            );
            if (score > 0) candidates.push({ type: "channel", score, channel });
        }
        const visibleMessageSql = `
                    FROM messages m JOIN chats c ON c.id = m.chat_id
               LEFT JOIN chat_members cm
                      ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                   WHERE m.deleted_at IS NULL
                     AND (m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                     AND m.text != '' AND c.deleted_at IS NULL
                     AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)`;
        const messageCandidates = new Map<string, string>();
        if (normalized.length >= 3) {
            try {
                const exactRows = await this.client.execute({
                    sql: `SELECT m.id, m.text
                            FROM messages_fts f
                            JOIN messages m ON m.rowid = f.rowid
                            JOIN chats c ON c.id = m.chat_id
                       LEFT JOIN chat_members cm
                              ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                           WHERE messages_fts MATCH ?
                             AND m.deleted_at IS NULL
                             AND (m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                             AND c.deleted_at IS NULL
                             AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)
                           ORDER BY rank LIMIT 1000`,
                    args: [userId, `"${normalized.replaceAll('"', '""')}"`],
                });
                for (const row of exactRows.rows)
                    messageCandidates.set(text(row.id), text(row.text));
            } catch {
                // Trigram FTS cannot query every short/punctuation-only input; fuzzy fallback below.
            }
        }
        const recentRows = await this.client.execute({
            sql: `SELECT m.id, m.text
                    ${visibleMessageSql}
                   ORDER BY m.created_at DESC LIMIT 5000`,
            args: [userId],
        });
        for (const row of recentRows.rows) messageCandidates.set(text(row.id), text(row.text));
        const rankedMessages = [...messageCandidates]
            .map(([messageId, messageText]) => ({
                messageId,
                score: fuzzyScore(normalized, messageText),
            }))
            .filter(({ score }) => score > 0)
            .sort(
                (left, right) =>
                    right.score - left.score || left.messageId.localeCompare(right.messageId),
            )
            .slice(0, limit);
        for (const { messageId, score } of rankedMessages) {
            const message = await this.getMessageProjection(this.client, userId, messageId);
            if (message) candidates.push({ type: "message", score, message });
        }
        return candidates
            .sort(
                (left, right) =>
                    right.score - left.score || resultId(left).localeCompare(resultId(right)),
            )
            .slice(0, limit);
    }

    async getServerProfile(): Promise<{
        name: string;
        title?: string;
        photoFileId?: string;
        updatedAt: string;
    }> {
        const row = await one(
            this.client,
            `SELECT name, title, photo_file_id, updated_at FROM server_settings WHERE id = 1`,
        );
        if (!row) throw new Error("Server settings are missing");
        return {
            name: text(row.name),
            title: optionalText(row.title),
            photoFileId: optionalText(row.photo_file_id),
            updatedAt: text(row.updated_at),
        };
    }

    async listAdminUsers(actorUserId: string): Promise<
        Array<
            UserSummary & {
                email: string;
                bannedAt?: string;
                deletedAt?: string;
                sessionLastSeenAt?: string;
            }
        >
    > {
        await this.requireServerAdmin(this.client, actorUserId);
        const result = await this.client.execute({
            sql: `SELECT u.id, u.username, u.first_name, u.last_name, u.title,
                         u.photo_file_id, u.role, u.last_access_at, a.email,
                         a.banned_at, a.deleted_at,
                         MAX(s.last_seen_at) AS session_last_seen_at
                    FROM users u JOIN accounts a ON a.id = u.account_id
               LEFT JOIN auth_sessions s ON s.account_id = a.id
                   GROUP BY u.id
                   ORDER BY u.created_at, u.id`,
            args: [],
        });
        return result.rows.map((row) => ({
            ...asUser(row),
            email: text(row.email),
            bannedAt: optionalText(row.banned_at),
            deletedAt: optionalText(row.deleted_at),
            sessionLastSeenAt: optionalText(row.session_last_seen_at),
        }));
    }

    async updateServerProfile(input: {
        actorUserId: string;
        name?: string;
        title?: string | null;
        photoFileId?: string | null;
    }): Promise<{
        server: Awaited<ReturnType<CollaborationRepository["getServerProfile"]>>;
        hint: MutationHint;
    }> {
        const result = await this.write(async (tx) => {
            await this.requireServerAdmin(tx, input.actorUserId);
            if (
                input.photoFileId &&
                !(await this.canAccessFileWith(tx, input.actorUserId, input.photoFileId))
            )
                throw new CollaborationError("not_found", "Server photo file was not found");
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE server_settings
                         SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
                             title = CASE WHEN ? = 1 THEN ? ELSE title END,
                             photo_file_id = CASE WHEN ? = 1 THEN ? ELSE photo_file_id END,
                             sync_sequence = ?,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = 1`,
                args: [
                    input.name === undefined ? 0 : 1,
                    input.name ?? null,
                    input.title === undefined ? 0 : 1,
                    input.title ?? null,
                    input.photoFileId === undefined ? 0 : 1,
                    input.photoFileId ?? null,
                    sequence,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "server.updated",
                actorUserId: input.actorUserId,
            });
            return { sequence };
        });
        return { server: await this.getServerProfile(), hint: areaHint(result.sequence, "server") };
    }

    async updateUserAdministration(input: {
        actorUserId: string;
        userId: string;
        title?: string | null;
        role?: "member" | "admin";
    }): Promise<{ user: UserSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireServerAdmin(tx, input.actorUserId);
            await this.requireActiveUser(tx, input.userId);
            if (input.actorUserId === input.userId && input.role === "member")
                throw new CollaborationError("invalid", "An admin cannot demote themselves");
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE users
                         SET title = CASE WHEN ? = 1 THEN ? ELSE title END,
                             role = COALESCE(?, role), sync_sequence = ?
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [
                    input.title === undefined ? 0 : 1,
                    input.title ?? null,
                    input.role ?? null,
                    sequence,
                    input.userId,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "user.updated",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            const user = await one(tx, `${USER_SELECT} WHERE id = ?`, [input.userId]);
            if (!user) throw new Error("Updated user is missing");
            return { user: asUser(user), hint: areaHint(sequence, "users") };
        });
    }

    async setUserBanned(input: {
        actorUserId: string;
        userId: string;
        banned: boolean;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireServerAdmin(tx, input.actorUserId);
            if (input.actorUserId === input.userId)
                throw new CollaborationError("invalid", "An admin cannot ban themselves");
            await this.requireExistingUser(tx, input.userId);
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE accounts
                         SET banned_at = ${input.banned ? "CURRENT_TIMESTAMP" : "NULL"}
                       WHERE id = (SELECT account_id FROM users WHERE id = ?)`,
                args: [input.userId],
            });
            if (input.banned)
                await tx.execute({
                    sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                           WHERE account_id = (SELECT account_id FROM users WHERE id = ?)
                             AND revoked_at IS NULL`,
                    args: [input.userId],
                });
            await tx.execute({
                sql: `UPDATE users SET sync_sequence = ? WHERE id = ?`,
                args: [sequence, input.userId],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: input.banned ? "user.banned" : "user.unbanned",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            return { hint: areaHint(sequence, "users") };
        });
    }

    async deleteUser(input: {
        actorUserId: string;
        userId: string;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireServerAdmin(tx, input.actorUserId);
            if (input.actorUserId === input.userId)
                throw new CollaborationError("invalid", "An admin cannot delete themselves");
            await this.requireActiveUser(tx, input.userId);
            const sequence = await this.nextSequence(tx);
            const memberships = await tx.execute({
                sql: `SELECT cm.chat_id, c.kind
                        FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
                       WHERE cm.user_id = ? AND cm.left_at IS NULL AND c.deleted_at IS NULL`,
                args: [input.userId],
            });
            const chatPoints: Array<{ chatId: string; pts: string }> = [];
            for (const membership of memberships.rows) {
                const chatId = text(membership.chat_id);
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    "member.deleted",
                    input.userId,
                    input.userId,
                );
                chatPoints.push({ chatId, pts: String(mutation.pts) });
                if (membership.kind !== "dm")
                    await tx.execute({
                        sql: `UPDATE chat_members
                                 SET left_at = CURRENT_TIMESTAMP, sync_sequence = ?
                               WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                        args: [sequence, chatId, input.userId],
                    });
            }
            await tx.execute({
                sql: `UPDATE accounts
                         SET deleted_at = CURRENT_TIMESTAMP, active = 0, password_hash = NULL,
                             email = 'deleted+' || id || '@invalid.local'
                       WHERE id = (SELECT account_id FROM users WHERE id = ?)`,
                args: [input.userId],
            });
            await tx.execute({
                sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                       WHERE account_id = (SELECT account_id FROM users WHERE id = ?)
                         AND revoked_at IS NULL`,
                args: [input.userId],
            });
            await tx.execute({
                sql: `UPDATE users
                         SET deleted_at = CURRENT_TIMESTAMP, sync_sequence = ?,
                             first_name = 'Deleted', last_name = NULL, title = NULL,
                             username = 'deleted_' || id,
                             email = NULL, phone = NULL, photo_file_id = NULL
                       WHERE id = ?`,
                args: [sequence, input.userId],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "user.deleted",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            return {
                hint: { sequence: String(sequence), chats: chatPoints, areas: ["users"] },
            };
        });
    }

    async sendAutomatedMessage(input: {
        actorUserId: string;
        chatId: string;
        text: string;
        attachmentFileIds?: string[];
        clientMutationId?: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint }> {
        await this.requireServerAdmin(this.client, input.actorUserId);
        if (
            !(await one(
                this.client,
                `SELECT 1 AS found FROM chats WHERE id = ? AND deleted_at IS NULL`,
                [input.chatId],
            ))
        )
            throw new CollaborationError("not_found", "Chat was not found");
        return this.sendMessage({
            actorUserId: input.actorUserId,
            chatId: input.chatId,
            text: input.text,
            attachmentFileIds: input.attachmentFileIds,
            clientMutationId: input.clientMutationId,
            kind: "automated",
        });
    }

    private async chatAccess(
        executor: Executor,
        userId: string,
        chatId: string,
        requireMembership: boolean,
    ): Promise<ChatAccess | undefined> {
        const row = await one(
            executor,
            `${CHAT_SELECT}
             WHERE c.id = ? AND c.deleted_at IS NULL
               AND EXISTS (
                 SELECT 1 FROM users actor
                 JOIN accounts actor_account ON actor_account.id = actor.account_id
                  WHERE actor.id = ? AND actor.deleted_at IS NULL
                    AND actor_account.active = 1
                    AND actor_account.banned_at IS NULL
                    AND actor_account.deleted_at IS NULL
               )
               AND (${requireMembership ? "cm.user_id IS NOT NULL" : "c.kind = 'public_channel' OR cm.user_id IS NOT NULL"})`,
            [userId, userId, chatId, userId],
        );
        if (!row) return undefined;
        const actor = await one(
            executor,
            `SELECT role FROM users WHERE id = ? AND deleted_at IS NULL`,
            [userId],
        );
        return { ...asChat(row), isServerAdmin: actor?.role === "admin" };
    }

    private async requireChatManager(
        executor: Executor,
        userId: string,
        chatId: string,
    ): Promise<ChatAccess> {
        const access = await this.chatAccess(executor, userId, chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        if (
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.membershipRole !== "admin"
        )
            throw new CollaborationError("forbidden", "Channel manager permission is required");
        return access;
    }

    private async requireActiveUser(executor: Executor, userId: string): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.deleted_at IS NULL AND a.deleted_at IS NULL
                AND a.banned_at IS NULL AND a.active = 1`,
            [userId],
        );
        if (!row) throw new CollaborationError("not_found", "User was not found");
    }

    private async requireExistingUser(executor: Executor, userId: string): Promise<void> {
        if (!(await one(executor, `SELECT 1 AS found FROM users WHERE id = ?`, [userId])))
            throw new CollaborationError("not_found", "User was not found");
    }

    private async requireServerAdmin(executor: Executor, userId: string): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.role = 'admin' AND u.deleted_at IS NULL
                AND a.banned_at IS NULL AND a.deleted_at IS NULL AND a.active = 1`,
            [userId],
        );
        if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
    }

    private async nextSequence(tx: Transaction): Promise<number> {
        const row = await one(
            tx,
            `UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1
             RETURNING sequence`,
        );
        if (!row) throw new Error("Sync state has not been initialized");
        return number(row.sequence);
    }

    private async advanceChat(
        tx: Transaction,
        actorUserId: string,
        chatId: string,
        kind: string,
        entityId?: string,
        targetUserId?: string,
    ): Promise<ChatMutation & { messageSequence?: number }> {
        const sequence = await this.nextSequence(tx);
        return this.advanceChatWithSequence(
            tx,
            sequence,
            actorUserId,
            chatId,
            kind,
            entityId,
            targetUserId,
        );
    }

    private async advanceChatWithSequence(
        tx: Transaction,
        sequence: number,
        actorUserId: string | undefined,
        chatId: string,
        kind: string,
        entityId?: string,
        targetUserId?: string,
        incrementMessageSequence = false,
    ): Promise<ChatMutation & { messageSequence?: number }> {
        const row = await one(
            tx,
            `UPDATE chats
                SET pts = pts + 1,
                    last_message_sequence = last_message_sequence + ?,
                    last_change_sequence = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL
              RETURNING pts, last_message_sequence`,
            [incrementMessageSequence ? 1 : 0, sequence, chatId],
        );
        if (!row) throw new CollaborationError("not_found", "Chat was not found");
        const pts = number(row.pts);
        await this.insertChatUpdate(tx, {
            sequence,
            pts,
            chatId,
            kind,
            entityId,
            actorUserId,
            targetUserId,
        });
        return {
            sequence,
            pts,
            chatId,
            messageSequence: incrementMessageSequence
                ? number(row.last_message_sequence)
                : undefined,
        };
    }

    private async insertChatUpdate(
        tx: Transaction,
        input: {
            sequence: number;
            pts: number;
            chatId: string;
            kind: string;
            entityId?: string;
            actorUserId?: string;
            targetUserId?: string;
        },
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO chat_updates
                    (chat_id, pts, pts_count, kind, entity_id)
                  VALUES (?, ?, 1, ?, ?)`,
            args: [input.chatId, input.pts, input.kind, input.entityId ?? null],
        });
        await this.insertSyncEvent(tx, {
            sequence: input.sequence,
            kind: input.kind,
            chatId: input.chatId,
            chatPts: input.pts,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
    }

    private async insertSyncEvent(
        tx: Transaction,
        input: {
            sequence: number;
            kind: string;
            chatId?: string;
            chatPts?: number;
            entityId?: string;
            actorUserId?: string;
            targetUserId?: string;
        },
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO sync_events
                    (sequence, kind, chat_id, chat_pts, entity_id, actor_user_id, target_user_id)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                input.sequence,
                input.kind,
                input.chatId ?? null,
                input.chatPts ?? null,
                input.entityId ?? null,
                input.actorUserId ?? null,
                input.targetUserId ?? null,
            ],
        });
    }

    private async requireMessageInChat(
        executor: Executor,
        messageId: string,
        chatId: string,
    ): Promise<Row> {
        const row = await one(
            executor,
            `SELECT id, chat_id, thread_root_message_id FROM messages
              WHERE id = ? AND chat_id = ? AND deleted_at IS NULL
                AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`,
            [messageId, chatId],
        );
        if (!row) throw new CollaborationError("not_found", "Referenced message was not found");
        return row;
    }

    private async canAccessFileWith(
        executor: Executor,
        userId: string,
        fileId: string,
    ): Promise<boolean> {
        return Boolean(
            await one(
                executor,
                `SELECT 1 AS found FROM files f
                  WHERE f.id = ? AND (
                    f.is_public = 1 OR f.uploaded_by_user_id = ?
                    OR EXISTS (
                      SELECT 1 FROM custom_emojis e
                       WHERE e.file_id = f.id AND e.deleted_at IS NULL
                    )
                    OR EXISTS (
                      SELECT 1 FROM server_settings s WHERE s.photo_file_id = f.id
                    )
                    OR EXISTS (
                      SELECT 1 FROM message_attachments ma
                      JOIN messages m ON m.id = ma.message_id
                      JOIN chats c ON c.id = m.chat_id
                 LEFT JOIN chat_members cm
                        ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                     WHERE ma.file_id = f.id AND m.deleted_at IS NULL
                       AND (m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                       AND c.deleted_at IS NULL
                       AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)
                    )
                  ) LIMIT 1`,
                [fileId, userId, userId],
            ),
        );
    }

    private async getMessageProjection(
        executor: Executor,
        viewerUserId: string,
        messageId: string,
    ): Promise<MessageSummary | undefined> {
        const row = await one(
            executor,
            `SELECT m.id, m.chat_id, m.sequence, m.change_pts, m.sender_user_id,
                    m.kind, m.text, m.quoted_message_id, m.thread_root_message_id,
                    m.forwarded_from_message_id, m.expires_at, m.edited_at,
                    m.deleted_at, m.created_at,
                    su.id AS sender_id, su.username AS sender_username,
                    su.first_name AS sender_first_name, su.last_name AS sender_last_name,
                    su.title AS sender_title, su.photo_file_id AS sender_photo_file_id,
                    su.role AS sender_role, su.last_access_at AS sender_last_access_at,
                    qm.sender_user_id AS quoted_sender_user_id,
                    qm.text AS quoted_text, qm.deleted_at AS quoted_deleted_at,
                    qm.expires_at AS quoted_expires_at,
                    fm.chat_id AS forwarded_from_chat_id,
                    COALESCE(t.reply_count, 0) AS thread_reply_count
               FROM messages m
          LEFT JOIN users su ON su.id = m.sender_user_id
          LEFT JOIN messages qm ON qm.id = m.quoted_message_id
          LEFT JOIN messages fm ON fm.id = m.forwarded_from_message_id
          LEFT JOIN threads t ON t.root_message_id = m.id
              WHERE m.id = ?`,
            [messageId],
        );
        if (!row) return undefined;
        if (!(await this.chatAccess(executor, viewerUserId, text(row.chat_id), false)))
            return undefined;
        const deleted = row.deleted_at !== null || isPast(optionalText(row.expires_at));
        let attachments: FileSummary[] = [];
        if (!deleted) {
            const files = await executor.execute({
                sql: `${FILE_SELECT}
                       WHERE id IN (
                         SELECT file_id FROM message_attachments WHERE message_id = ?
                       )
                       ORDER BY (
                         SELECT position FROM message_attachments
                          WHERE message_id = ? AND file_id = files.id
                       ), id`,
                args: [messageId, messageId],
            });
            attachments = files.rows.map(asFile);
        }
        const reactionRows = deleted
            ? ({ rows: [] } as unknown as ResultSet)
            : await executor.execute({
                  sql: `SELECT reaction_key, emoji, custom_emoji_id, user_id
                          FROM reactions WHERE message_id = ?
                         ORDER BY reaction_key, created_at, user_id`,
                  args: [messageId],
              });
        const reactionMap = new Map<string, ReactionSummary>();
        for (const reaction of reactionRows.rows) {
            const key = text(reaction.reaction_key);
            const existing = reactionMap.get(key) ?? {
                key,
                emoji: optionalText(reaction.emoji),
                customEmojiId: optionalText(reaction.custom_emoji_id),
                count: 0,
                reacted: false,
                userIds: [],
            };
            const userId = text(reaction.user_id);
            existing.count += 1;
            existing.reacted ||= userId === viewerUserId;
            existing.userIds.push(userId);
            reactionMap.set(key, existing);
        }
        const sender = row.sender_id
            ? asUser({
                  id: row.sender_id,
                  username: row.sender_username,
                  first_name: row.sender_first_name,
                  last_name: row.sender_last_name,
                  title: row.sender_title,
                  photo_file_id: row.sender_photo_file_id,
                  role: row.sender_role,
                  last_access_at: row.sender_last_access_at,
              } as unknown as Row)
            : undefined;
        const forwardedFromChatId = optionalText(row.forwarded_from_chat_id);
        const forwardedFrom =
            row.forwarded_from_message_id &&
            forwardedFromChatId &&
            (await this.chatAccess(executor, viewerUserId, forwardedFromChatId, false))
                ? {
                      messageId: text(row.forwarded_from_message_id),
                      chatId: forwardedFromChatId,
                  }
                : undefined;
        const quotedDeleted =
            row.quoted_deleted_at !== null || isPast(optionalText(row.quoted_expires_at));
        return {
            id: text(row.id),
            chatId: text(row.chat_id),
            sequence: text(row.sequence),
            changePts: text(row.change_pts),
            sender,
            kind: text(row.kind) as "user" | "automated",
            text: deleted ? "" : text(row.text),
            quotedMessage: row.quoted_message_id
                ? {
                      id: text(row.quoted_message_id),
                      senderUserId: optionalText(row.quoted_sender_user_id),
                      text: quotedDeleted || deleted ? "" : text(row.quoted_text, ""),
                      deleted: quotedDeleted,
                  }
                : undefined,
            threadRootMessageId: optionalText(row.thread_root_message_id),
            threadReplyCount: number(row.thread_reply_count, 0),
            forwardedFrom,
            attachments,
            reactions: [...reactionMap.values()],
            expiresAt: optionalText(row.expires_at),
            editedAt: optionalText(row.edited_at),
            deletedAt: deleted
                ? (optionalText(row.deleted_at) ?? optionalText(row.expires_at))
                : undefined,
            createdAt: text(row.created_at),
        };
    }

    private async findClientMutation(
        executor: Executor,
        actorUserId: string,
        scope: string,
        clientMutationId: string,
    ): Promise<Record<string, unknown> | undefined> {
        const row = await one(
            executor,
            `SELECT result_json FROM client_mutations
              WHERE actor_user_id = ? AND scope = ? AND client_mutation_id = ?`,
            [actorUserId, scope, clientMutationId],
        );
        if (!row) return undefined;
        return JSON.parse(text(row.result_json)) as Record<string, unknown>;
    }

    private async storeClientMutation(
        tx: Transaction,
        actorUserId: string,
        scope: string,
        clientMutationId: string,
        result: Record<string, unknown>,
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO client_mutations
                    (actor_user_id, scope, client_mutation_id, result_json)
                  VALUES (?, ?, ?, ?)`,
            args: [actorUserId, scope, clientMutationId, JSON.stringify(result)],
        });
    }

    private async write<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
        const tx = await this.client.transaction("write");
        try {
            const result = await operation(tx);
            await tx.commit();
            return result;
        } catch (error) {
            if (!tx.closed) await tx.rollback();
            throw error;
        } finally {
            tx.close();
        }
    }
}

async function one(executor: Executor, sql: string, args: InArgs = []): Promise<Row | undefined> {
    return (await executor.execute({ sql, args })).rows[0];
}

function asChat(row: Row): ChatSummary {
    const kind = text(row.kind) as ChatKind;
    const starred = number(row.starred, 0) === 1;
    return {
        id: text(row.id),
        kind,
        name: optionalText(row.name),
        slug: optionalText(row.slug),
        topic: optionalText(row.topic),
        createdByUserId: text(row.created_by_user_id),
        pts: text(row.pts),
        lastMessageSequence: text(row.last_message_sequence),
        membershipEpoch:
            optionalText(row.membership_epoch) ?? (kind === "public_channel" ? "public" : ""),
        membershipRole: optionalText(row.membership_role) as ChatRole | undefined,
        starred,
        starOrder:
            !starred || row.sort_order === null || row.sort_order === undefined
                ? undefined
                : number(row.sort_order),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asUser(row: Row): UserSummary {
    return {
        id: text(row.id),
        username: text(row.username),
        firstName: text(row.first_name),
        lastName: optionalText(row.last_name),
        title: optionalText(row.title),
        photoFileId: optionalText(row.photo_file_id),
        role: text(row.role) as "member" | "admin",
        lastAccessAt: optionalText(row.last_access_at),
    };
}

function asFile(row: Row): FileSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as FileKind,
        originalName: optionalText(row.original_name),
        contentType: text(row.content_type),
        size: number(row.size),
        width: number(row.width, 0) || undefined,
        height: number(row.height, 0) || undefined,
        durationMs: number(row.duration_ms, 0) || undefined,
        thumbhash: optionalText(row.thumbhash) || undefined,
        uploadedByUserId: text(row.uploaded_by_user_id),
        createdAt: text(row.created_at),
    };
}

function syncState(row: Row): SyncState {
    return stateAt(text(row.generation), number(row.sequence));
}

function stateAt(generation: string, sequence: number): SyncState {
    return { protocolVersion: 1, generation, sequence: String(sequence) };
}

function chatHint(sequence: number, chatId: string, pts: number): MutationHint {
    return {
        sequence: String(sequence),
        chats: [{ chatId, pts: String(pts) }],
        areas: [],
    };
}

function areaHint(sequence: number, area: string): MutationHint {
    return { sequence: String(sequence), chats: [], areas: [area] };
}

function text(value: unknown, fallback?: string): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    if (fallback !== undefined) return fallback;
    throw new Error("Expected database text value");
}

function optionalText(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : text(value);
}

function number(value: unknown, fallback?: number): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
    if (fallback !== undefined) return fallback;
    throw new Error("Expected database integer value");
}

function isUniqueConstraint(error: unknown): boolean {
    return (
        String((error as { code?: unknown }).code ?? "").includes("CONSTRAINT") ||
        String((error as { message?: unknown }).message ?? "").includes("UNIQUE constraint")
    );
}

function isPast(value: string | undefined): boolean {
    return value ? Date.parse(value) <= Date.now() : false;
}

function normalizeSearch(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function fuzzyScore(query: string, candidate: string): number {
    const normalized = normalizeSearch(candidate);
    if (!query || !normalized) return 0;
    if (normalized === query) return 1;
    if (normalized.startsWith(query)) return 0.96;
    if (normalized.includes(query)) return 0.9;
    let best = 0;
    for (const token of normalized.split(/[^\p{L}\p{N}_-]+/u).filter(Boolean)) {
        const distance = levenshtein(query, token);
        const longest = Math.max(query.length, token.length);
        const similarity = longest === 0 ? 1 : 1 - distance / longest;
        if (distance <= Math.max(1, Math.floor(longest / 3)))
            best = Math.max(best, similarity * 0.82);
    }
    return best;
}

function levenshtein(left: string, right: string): number {
    const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
    for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
        let diagonal = previous[0];
        previous[0] = leftIndex;
        for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
            const above = previous[rightIndex];
            previous[rightIndex] = Math.min(
                previous[rightIndex] + 1,
                previous[rightIndex - 1] + 1,
                diagonal + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
            );
            diagonal = above;
        }
    }
    return previous[right.length];
}

function resultId(
    result:
        | { type: "message"; message: MessageSummary }
        | { type: "channel"; channel: ChatSummary }
        | { type: "user"; user: UserSummary },
): string {
    if (result.type === "message") return result.message.id;
    if (result.type === "channel") return result.channel.id;
    return result.user.id;
}
