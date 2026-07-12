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
    type ChatBookmarkSummary,
    type ChatPinSummary,
    type ChatRole,
    type ChatSummary,
    type CallSummary,
    type AdminUserSummary,
    type FileSummary,
    type MessageSummary,
    type MutationHint,
    type NotificationLevel,
    type NotificationSummary,
    type PresenceSettingsSummary,
    type ReactionSummary,
    type SyncState,
    type ThreadSummary,
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
           c.dm_type, c.owner_user_id, c.photo_file_id, c.is_listed, c.archived_at,
           c.retention_mode, c.retention_seconds, c.default_expiry_mode,
           c.default_self_destruct_seconds, c.default_after_read_scope, c.lifecycle_version,
           c.pts, c.last_message_sequence, c.created_at, c.updated_at,
           cm.role AS membership_role, cm.membership_epoch,
           COALESCE(cm.last_read_sequence, 0) AS last_read_sequence,
           COALESCE(cm.unread_count, 0) AS unread_count,
           COALESCE(cm.mention_count, 0) AS mention_count,
           COALESCE(p.starred, 0) AS starred, p.sort_order,
           COALESCE(p.notification_level, 'all') AS notification_level,
           p.muted_until
      FROM chats c
      LEFT JOIN chat_members cm
        ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
      LEFT JOIN user_chat_preferences p
        ON p.chat_id = c.id AND p.user_id = ?
`;

const USER_SELECT = `
    SELECT id, username, first_name, last_name, title, photo_file_id, role
      FROM users
`;

const FILE_SELECT = `
    SELECT id, kind, original_name, content_type, size, width, height, duration_ms,
           thumbhash, uploaded_by_user_id, created_at
      FROM files
`;

export class CollaborationRepository {
    private readonly client: Client;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
    }

    async initialize(): Promise<void> {
        await this.client.execute({
            sql: `INSERT OR IGNORE INTO server_sync_state (id, generation, sequence)
                  VALUES (1, ?, 0)`,
            args: [createId()],
        });
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    /** Package-internal shared connection for transactional backend extensions. */
    extensionClient(): Client {
        return this.client;
    }

    async getState(): Promise<SyncState> {
        const state = await one(
            this.client,
            `SELECT generation, sequence FROM server_sync_state WHERE id = 1`,
        );
        if (!state) throw new Error("Sync state has not been initialized");
        return syncState(state);
    }

    async acknowledgeSyncConsumer(input: {
        userId: string;
        deviceId: string;
        generation: string;
        sequence: number;
    }): Promise<void> {
        await this.requireActiveUser(this.client, input.userId);
        const state = await one(
            this.client,
            `SELECT generation, sequence, min_recoverable_sequence
               FROM server_sync_state WHERE id = 1`,
        );
        if (!state) throw new Error("Sync state has not been initialized");
        if (input.generation !== state.generation)
            throw new CollaborationError("generation_mismatch", "Sync generation has changed");
        if (input.sequence > number(state.sequence))
            throw new CollaborationError("future_state", "Sync cursor is ahead of the server");
        if (input.sequence < number(state.min_recoverable_sequence, 0))
            throw new CollaborationError("conflict", "Sync cursor is no longer recoverable");
        await this.client.execute({
            sql: `INSERT INTO sync_consumers
                    (id, user_id, device_id, generation, sequence)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id, device_id) DO UPDATE SET
                    generation = excluded.generation,
                    sequence = MAX(sync_consumers.sequence, excluded.sequence),
                    last_seen_at = CURRENT_TIMESTAMP, revoked_at = NULL`,
            args: [createId(), input.userId, input.deviceId, input.generation, input.sequence],
        });
    }

    async compactSync(): Promise<{
        minRecoverableSequence: string;
        eventsDeleted: number;
        mutationsDeleted: number;
        chatUpdatesDeleted: number;
    }> {
        return this.write(async (tx) => {
            const state = await one(
                tx,
                `SELECT generation, sequence, min_recoverable_sequence
                   FROM server_sync_state WHERE id = 1`,
            );
            const settings = await one(
                tx,
                `SELECT sync_event_retention_seconds, chat_update_retention_seconds,
                        idempotency_retention_seconds
                   FROM server_settings WHERE id = 1`,
            );
            if (!state || !settings) throw new Error("Sync retention settings are missing");
            const retentionSeconds = number(settings.sync_event_retention_seconds);
            const candidate = await one(
                tx,
                `SELECT COALESCE(MAX(sequence), 0) AS sequence FROM sync_events
                  WHERE datetime(created_at) < datetime('now', '-' || ? || ' seconds')`,
                [retentionSeconds],
            );
            const activeFloor = await one(
                tx,
                `SELECT MIN(sequence) AS sequence FROM sync_consumers
                  WHERE revoked_at IS NULL AND generation = ?
                    AND datetime(last_seen_at) >= datetime('now', '-90 days')`,
                [text(state.generation)],
            );
            const previousMin = number(state.min_recoverable_sequence, 0);
            const candidateSequence = number(candidate?.sequence, 0);
            const consumerSequence =
                activeFloor?.sequence === null || activeFloor?.sequence === undefined
                    ? number(state.sequence)
                    : number(activeFloor.sequence);
            const newMin = Math.max(previousMin, Math.min(candidateSequence, consumerSequence));
            const compactionId = createId();
            await tx.execute({
                sql: `INSERT INTO sync_compactions
                        (id, generation, previous_min_sequence, new_min_sequence)
                      VALUES (?, ?, ?, ?)`,
                args: [compactionId, text(state.generation), previousMin, newMin],
            });
            const deletedEvents =
                newMin > previousMin
                    ? await tx.execute({
                          sql: `DELETE FROM sync_events WHERE sequence <= ?`,
                          args: [newMin],
                      })
                    : { rowsAffected: 0 };
            const mutationRetention = number(settings.idempotency_retention_seconds);
            const deletedMutations = await tx.execute({
                sql: `DELETE FROM client_mutations
                       WHERE (expires_at IS NOT NULL AND datetime(expires_at) <= CURRENT_TIMESTAMP)
                          OR datetime(created_at) < datetime('now', '-' || ? || ' seconds')`,
                args: [mutationRetention],
            });
            await tx.execute(
                `DELETE FROM idempotency_keys WHERE datetime(expires_at) <= CURRENT_TIMESTAMP`,
            );
            const chatRetention = number(settings.chat_update_retention_seconds);
            const chats = await tx.execute({
                sql: `SELECT chat_id, MAX(pts) AS new_min_pts
                        FROM chat_updates
                       WHERE datetime(created_at) < datetime('now', '-' || ? || ' seconds')
                       GROUP BY chat_id`,
                args: [chatRetention],
            });
            let chatUpdatesDeleted = 0;
            for (const chat of chats.rows) {
                const chatId = text(chat.chat_id);
                const newMinPts = number(chat.new_min_pts, 0);
                const current = await one(
                    tx,
                    `SELECT min_recoverable_pts FROM chats WHERE id = ?`,
                    [chatId],
                );
                const previousMinPts = number(current?.min_recoverable_pts, 0);
                if (newMinPts <= previousMinPts) continue;
                const deleted = await tx.execute({
                    sql: `DELETE FROM chat_updates WHERE chat_id = ? AND pts <= ?`,
                    args: [chatId, newMinPts],
                });
                chatUpdatesDeleted += deleted.rowsAffected;
                await tx.execute({
                    sql: `UPDATE chats SET min_recoverable_pts = ? WHERE id = ?`,
                    args: [newMinPts, chatId],
                });
                await tx.execute({
                    sql: `INSERT INTO chat_sync_compactions
                            (id, chat_id, previous_min_pts, new_min_pts, updates_deleted)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [createId(), chatId, previousMinPts, newMinPts, deleted.rowsAffected],
                });
            }
            await tx.execute({
                sql: `UPDATE server_sync_state
                         SET min_recoverable_sequence = ?, last_compacted_at = CURRENT_TIMESTAMP,
                             compaction_version = compaction_version + 1
                       WHERE id = 1`,
                args: [newMin],
            });
            await tx.execute({
                sql: `UPDATE sync_compactions
                         SET events_deleted = ?, mutations_deleted = ?,
                             completed_at = CURRENT_TIMESTAMP,
                             details_json = ? WHERE id = ?`,
                args: [
                    deletedEvents.rowsAffected,
                    deletedMutations.rowsAffected,
                    JSON.stringify({ chatUpdatesDeleted }),
                    compactionId,
                ],
            });
            return {
                minRecoverableSequence: String(newMin),
                eventsDeleted: deletedEvents.rowsAffected,
                mutationsDeleted: deletedMutations.rowsAffected,
                chatUpdatesDeleted,
            };
        });
    }

    async canAccessChat(userId: string, chatId: string): Promise<boolean> {
        return Boolean(await this.chatAccess(this.client, userId, chatId, false));
    }

    async canPostToChat(userId: string, chatId: string): Promise<boolean> {
        const chat = await this.chatAccess(this.client, userId, chatId, true);
        return Boolean(
            chat &&
            !chat.archivedAt &&
            !(await this.isPostingRestricted(this.client, userId, chatId)),
        );
    }

    async listChats(userId: string): Promise<ChatSummary[]> {
        const result = await this.client.execute({
            sql: `${CHAT_SELECT}
                  WHERE c.deleted_at IS NULL
                    AND ((c.kind = 'public_channel' AND c.is_listed = 1) OR cm.user_id IS NOT NULL)
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
        let access = await this.chatAccess(this.client, userId, chatId, false);
        if (!access) {
            try {
                access = await this.requireChatManager(this.client, userId, chatId);
            } catch (error) {
                if (!(error instanceof CollaborationError)) throw error;
                // Preserve private-channel non-disclosure for ordinary users.
            }
        }
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

    async listChatMemberships(
        userId: string,
        chatId: string,
    ): Promise<Array<{ user: UserSummary; role: ChatRole; joinedAt: string }>> {
        await this.listChatMembers(userId, chatId);
        const result = await this.client.execute({
            sql: `SELECT u.id, u.username, u.first_name, u.last_name, u.title,
                         u.photo_file_id, u.role, cm.role AS chat_role, cm.joined_at
                    FROM chat_members cm JOIN users u ON u.id = cm.user_id
                    JOIN accounts a ON a.id = u.account_id
                   WHERE cm.chat_id = ? AND cm.left_at IS NULL AND u.deleted_at IS NULL
                     AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL
                   ORDER BY cm.joined_at, cm.user_id`,
            args: [chatId],
        });
        return result.rows.map((row) => ({
            user: asUser(row),
            role: text(row.chat_role) as ChatRole,
            joinedAt: text(row.joined_at),
        }));
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
                             owner_user_id, visibility, last_change_sequence)
                          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
                    args: [
                        id,
                        input.kind,
                        input.name,
                        input.slug,
                        input.topic ?? null,
                        input.actorUserId,
                        input.actorUserId,
                        input.kind === "public_channel" ? "public" : "private",
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
                        (id, kind, dm_type, created_by_user_id, owner_user_id, dm_key, pts,
                         is_listed, visibility, last_change_sequence)
                      VALUES (?, 'dm', 'direct', ?, ?, ?, 1, 0, 'direct', ?)`,
                args: [id, actorUserId, actorUserId, dmKey, sequence],
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

    async createGroupDirectMessage(input: {
        actorUserId: string;
        userIds: string[];
        name?: string;
    }): Promise<{ chat: ChatSummary; hint?: MutationHint; memberUserIds: string[] }> {
        const memberUserIds = [...new Set([input.actorUserId, ...input.userIds])].sort();
        if (memberUserIds.length < 3 || memberUserIds.length > 50)
            throw new CollaborationError(
                "invalid",
                "A group direct message requires between 3 and 50 distinct members",
            );
        return this.write(async (tx) => {
            for (const userId of memberUserIds) await this.requireActiveUser(tx, userId);
            const dmKey = `group:${memberUserIds.join(":")}`;
            const existing = await one(
                tx,
                `SELECT id FROM chats WHERE dm_key = ? AND deleted_at IS NULL`,
                [dmKey],
            );
            if (existing) {
                const chat = await this.chatAccess(tx, input.actorUserId, text(existing.id), false);
                if (!chat) throw new Error("Existing group DM is inaccessible");
                return { chat, memberUserIds };
            }
            const id = createId();
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO chats
                        (id, kind, dm_type, name, created_by_user_id, owner_user_id, dm_key, pts,
                         is_listed, visibility, last_change_sequence)
                      VALUES (?, 'dm', 'group', ?, ?, ?, ?, 1, 0, 'direct', ?)`,
                args: [
                    id,
                    input.name ?? null,
                    input.actorUserId,
                    input.actorUserId,
                    dmKey,
                    sequence,
                ],
            });
            for (const userId of memberUserIds)
                await tx.execute({
                    sql: `INSERT INTO chat_members
                            (chat_id, user_id, role, membership_epoch, sync_sequence,
                             invited_by_user_id)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        userId,
                        userId === input.actorUserId ? "owner" : "member",
                        createId(),
                        sequence,
                        input.actorUserId,
                    ],
                });
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.groupDirectMessageCreated",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            const chat = await this.chatAccess(tx, input.actorUserId, id, false);
            if (!chat) throw new Error("Created group DM is not readable");
            return { chat, hint: chatHint(sequence, id, 1), memberUserIds };
        });
    }

    async updateChannel(input: {
        actorUserId: string;
        chatId: string;
        name?: string;
        slug?: string;
        topic?: string | null;
        kind?: "public_channel" | "private_channel";
        photoFileId?: string | null;
        isListed?: boolean;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError(
                    "invalid",
                    "Direct messages cannot use channel settings",
                );
            if (input.photoFileId !== undefined && input.photoFileId !== null) {
                const file = await one(
                    tx,
                    `SELECT kind FROM files
                      WHERE id = ? AND deleted_at IS NULL
                        AND upload_status = 'complete' AND scan_status != 'infected'
                        AND (uploaded_by_user_id = ? OR is_public = 1)`,
                    [input.photoFileId, input.actorUserId],
                );
                if (!file || !["photo", "gif"].includes(text(file.kind)))
                    throw new CollaborationError("not_found", "Channel photo was not found");
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                input.kind && input.kind !== access.kind
                    ? "chat.visibilityChanged"
                    : "chat.updated",
                input.chatId,
            );
            try {
                await tx.execute({
                    sql: `UPDATE chats
                             SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
                                 slug = CASE WHEN ? = 1 THEN ? ELSE slug END,
                                 topic = CASE WHEN ? = 1 THEN ? ELSE topic END,
                                 kind = COALESCE(?, kind),
                                 visibility = CASE COALESCE(?, kind)
                                     WHEN 'public_channel' THEN 'public' ELSE 'private' END,
                                 photo_file_id = CASE WHEN ? = 1 THEN ? ELSE photo_file_id END,
                                 is_listed = CASE WHEN ? = 1 THEN ? ELSE is_listed END,
                                 lifecycle_version = lifecycle_version + 1,
                                 updated_at = CURRENT_TIMESTAMP
                           WHERE id = ? AND deleted_at IS NULL`,
                    args: [
                        input.name === undefined ? 0 : 1,
                        input.name ?? null,
                        input.slug === undefined ? 0 : 1,
                        input.slug ?? null,
                        input.topic === undefined ? 0 : 1,
                        input.topic ?? null,
                        input.kind ?? null,
                        input.kind ?? null,
                        input.photoFileId === undefined ? 0 : 1,
                        input.photoFileId ?? null,
                        input.isListed === undefined ? 0 : 1,
                        input.isListed ? 1 : 0,
                        input.chatId,
                    ],
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError("conflict", "Channel slug is already in use");
                throw error;
            }
            const chat = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            return { chat, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async setChannelArchived(input: {
        actorUserId: string;
        chatId: string;
        archived: boolean;
        reason?: string;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct messages cannot be archived");
            if (Boolean(access.archivedAt) === input.archived)
                throw new CollaborationError(
                    "conflict",
                    input.archived ? "Channel is already archived" : "Channel is not archived",
                );
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                input.archived ? "chat.archived" : "chat.unarchived",
                input.chatId,
            );
            await tx.execute({
                sql: `UPDATE chats
                         SET archived_at = ${input.archived ? "CURRENT_TIMESTAMP" : "NULL"},
                             archived_by_user_id = ?, archive_reason = ?,
                             lifecycle_version = lifecycle_version + 1,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [
                    input.archived ? input.actorUserId : null,
                    input.archived ? (input.reason ?? null) : null,
                    input.chatId,
                ],
            });
            const chat = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            return { chat, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async updateChannelPolicies(input: {
        actorUserId: string;
        chatId: string;
        retentionMode?: "inherit" | "forever" | "duration";
        retentionSeconds?: number | null;
        defaultExpiryMode?: "none" | "after_send" | "after_read";
        defaultSelfDestructSeconds?: number | null;
        defaultAfterReadScope?: "any_reader" | "all_readers";
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (
                input.retentionMode === "duration" &&
                input.retentionSeconds === undefined &&
                !access.retentionSeconds
            )
                throw new CollaborationError("invalid", "Duration retention requires seconds");
            if (
                input.defaultExpiryMode !== undefined &&
                input.defaultExpiryMode !== "none" &&
                input.defaultSelfDestructSeconds === undefined &&
                !access.defaultSelfDestructSeconds
            )
                throw new CollaborationError(
                    "invalid",
                    "The default self-destruct mode requires seconds",
                );
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "chat.policiesChanged",
                input.chatId,
            );
            await tx.execute({
                sql: `UPDATE chats
                         SET retention_mode = COALESCE(?, retention_mode),
                             retention_seconds = CASE WHEN ? = 1
                                 THEN ? ELSE retention_seconds END,
                             default_expiry_mode = COALESCE(?, default_expiry_mode),
                             default_self_destruct_seconds = CASE WHEN ? = 1
                                 THEN ? ELSE default_self_destruct_seconds END,
                             default_after_read_scope = COALESCE(?, default_after_read_scope),
                             lifecycle_version = lifecycle_version + 1,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [
                    input.retentionMode ?? null,
                    input.retentionSeconds === undefined ? 0 : 1,
                    input.retentionSeconds ?? null,
                    input.defaultExpiryMode ?? null,
                    input.defaultSelfDestructSeconds === undefined ? 0 : 1,
                    input.defaultSelfDestructSeconds ?? null,
                    input.defaultAfterReadScope ?? null,
                    input.chatId,
                ],
            });
            const chat = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            return { chat, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async deleteChannel(input: {
        actorUserId: string;
        chatId: string;
        reason?: string;
    }): Promise<{ hint: MutationHint; memberUserIds: string[] }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct messages cannot be deleted");
            if (!access.isServerAdmin && access.membershipRole !== "owner")
                throw new CollaborationError("forbidden", "Only an owner can delete a channel");
            const members = await tx.execute({
                sql: `SELECT user_id FROM chat_members WHERE chat_id = ? AND left_at IS NULL`,
                args: [input.chatId],
            });
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "chat.deleted",
                input.chatId,
            );
            await tx.execute({
                sql: `UPDATE chats
                         SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?,
                             delete_reason = ?, lifecycle_version = lifecycle_version + 1,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [input.actorUserId, input.reason ?? null, input.chatId],
            });
            return {
                hint: chatHint(sequence, input.chatId, mutation.pts),
                memberUserIds: members.rows.map((row) => text(row.user_id)),
            };
        });
    }

    async setChannelMemberRole(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role: ChatRole;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.requireChatManager(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message roles are fixed");
            if (
                input.role === "owner" &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner"
            )
                throw new CollaborationError("forbidden", "Only an owner can assign ownership");
            const member = await one(
                tx,
                `SELECT role FROM chat_members
                  WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                [input.chatId, input.userId],
            );
            if (!member) throw new CollaborationError("not_found", "Member was not found");
            if (member.role === input.role)
                throw new CollaborationError("conflict", "Member already has this role");
            let replacementOwnerId: string | undefined;
            if (member.role === "owner" && input.role !== "owner") {
                const another = await one(
                    tx,
                    `SELECT user_id FROM chat_members
                      WHERE chat_id = ? AND user_id != ? AND left_at IS NULL AND role = 'owner'
                      ORDER BY joined_at, user_id LIMIT 1`,
                    [input.chatId, input.userId],
                );
                if (!another)
                    throw new CollaborationError(
                        "conflict",
                        "Transfer ownership before demoting the only owner",
                    );
                replacementOwnerId = text(another.user_id);
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "member.roleChanged",
                input.userId,
                input.userId,
            );
            await tx.execute({
                sql: `UPDATE chat_members
                         SET role = ?, sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                args: [input.role, sequence, input.chatId, input.userId],
            });
            if (input.role === "owner")
                await tx.execute({
                    sql: `UPDATE chats SET owner_user_id = ? WHERE id = ?`,
                    args: [input.userId, input.chatId],
                });
            else if (replacementOwnerId)
                await tx.execute({
                    sql: `UPDATE chats SET owner_user_id = ?
                           WHERE id = ? AND owner_user_id = ?`,
                    args: [replacementOwnerId, input.chatId, input.userId],
                });
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
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
            const chat = await this.requireChatManager(tx, actorUserId, chatId);
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
                const otherOwner = await one(
                    tx,
                    `SELECT user_id FROM chat_members
                      WHERE chat_id = ? AND user_id != ? AND left_at IS NULL
                        AND role = 'owner' ORDER BY joined_at, user_id LIMIT 1`,
                    [chatId, actorUserId],
                );
                if (!otherOwner)
                    throw new CollaborationError(
                        "conflict",
                        "Transfer channel ownership before leaving",
                    );
                await tx.execute({
                    sql: `UPDATE chats SET owner_user_id = ?
                           WHERE id = ? AND owner_user_id = ?`,
                    args: [text(otherOwner.user_id), chatId, actorUserId],
                });
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
            if (member.role === "owner") {
                const otherOwner = await one(
                    tx,
                    `SELECT user_id FROM chat_members
                      WHERE chat_id = ? AND user_id != ? AND left_at IS NULL AND role = 'owner'
                      ORDER BY joined_at, user_id LIMIT 1`,
                    [input.chatId, input.userId],
                );
                let replacementOwnerId = optionalText(otherOwner?.user_id);
                if (!replacementOwnerId) {
                    const successor = await one(
                        tx,
                        `SELECT user_id FROM chat_members
                          WHERE chat_id = ? AND user_id != ? AND left_at IS NULL
                          ORDER BY CASE role WHEN 'admin' THEN 0 ELSE 1 END, joined_at, user_id
                          LIMIT 1`,
                        [input.chatId, input.userId],
                    );
                    if (!successor)
                        throw new CollaborationError(
                            "conflict",
                            "The last channel owner cannot be removed",
                        );
                    await tx.execute({
                        sql: `UPDATE chat_members SET role = 'owner', updated_at = CURRENT_TIMESTAMP
                               WHERE chat_id = ? AND user_id = ?`,
                        args: [input.chatId, successor.user_id],
                    });
                    replacementOwnerId = text(successor.user_id);
                }
                await tx.execute({
                    sql: `UPDATE chats SET owner_user_id = ?
                           WHERE id = ? AND owner_user_id = ?`,
                    args: [replacementOwnerId, input.chatId, input.userId],
                });
            }
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

    async markChatRead(input: {
        actorUserId: string;
        chatId: string;
        messageId?: string;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            const target = input.messageId
                ? await one(
                      tx,
                      `SELECT id, sequence, change_pts FROM messages
                        WHERE id = ? AND chat_id = ? AND deleted_at IS NULL
                          AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`,
                      [input.messageId, input.chatId],
                  )
                : await one(
                      tx,
                      `SELECT id, sequence, change_pts FROM messages
                        WHERE chat_id = ? AND deleted_at IS NULL
                          AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
                        ORDER BY sequence DESC LIMIT 1`,
                      [input.chatId],
                  );
            const targetSequence = number(target?.sequence, 0);
            const targetPts = number(target?.change_pts, 0);
            const sequence = await this.nextSequence(tx);
            const receiptMutation = target
                ? await this.advanceChatWithSequence(
                      tx,
                      sequence,
                      input.actorUserId,
                      input.chatId,
                      "receipt.read",
                      text(target.id),
                  )
                : undefined;
            await tx.execute({
                sql: `INSERT INTO message_receipts
                        (message_id, user_id, delivered_at, read_at)
                      SELECT m.id, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
                        FROM messages m
                       WHERE m.chat_id = ? AND m.sequence <= ?
                         AND m.deleted_at IS NULL
                         AND (m.sender_user_id IS NULL OR m.sender_user_id != ?)
                      ON CONFLICT(message_id, user_id) DO UPDATE SET
                        delivered_at = COALESCE(message_receipts.delivered_at, CURRENT_TIMESTAMP),
                        read_at = COALESCE(message_receipts.read_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP`,
                args: [input.actorUserId, input.chatId, targetSequence, input.actorUserId],
            });
            await tx.execute({
                sql: `UPDATE messages
                         SET first_read_at = COALESCE(first_read_at, CURRENT_TIMESTAMP),
                             expires_at = CASE
                               WHEN expires_at IS NULL OR datetime(expires_at) > datetime(
                                 'now', '+' || self_destruct_seconds || ' seconds'
                               ) THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now',
                                 '+' || self_destruct_seconds || ' seconds')
                               ELSE expires_at
                             END
                       WHERE chat_id = ? AND sequence <= ? AND deleted_at IS NULL
                         AND (sender_user_id IS NULL OR sender_user_id != ?)
                         AND expiry_mode = 'after_read'
                         AND self_destruct_seconds IS NOT NULL
                         AND (
                           after_read_scope = 'any_reader'
                           OR NOT EXISTS (
                             SELECT 1 FROM message_receipts mr
                              WHERE mr.message_id = messages.id
                                AND mr.read_at IS NULL
                                AND (messages.sender_user_id IS NULL
                                     OR mr.user_id != messages.sender_user_id)
                           )
                         )`,
                args: [input.chatId, targetSequence, input.actorUserId],
            });
            await tx.execute({
                sql: `UPDATE message_receipts
                         SET expiry_triggered_at = COALESCE(expiry_triggered_at, CURRENT_TIMESTAMP),
                             updated_at = CURRENT_TIMESTAMP
                       WHERE user_id = ? AND read_at IS NOT NULL
                         AND message_id IN (
                           SELECT id FROM messages WHERE chat_id = ? AND sequence <= ?
                             AND expiry_mode = 'after_read' AND expires_at IS NOT NULL
                         )`,
                args: [input.actorUserId, input.chatId, targetSequence],
            });
            await tx.execute({
                sql: `UPDATE chat_members
                         SET last_read_message_id = ?,
                             last_read_sequence = MAX(last_read_sequence, ?),
                             last_read_pts = MAX(last_read_pts, ?),
                             last_read_at = CURRENT_TIMESTAMP,
                             unread_count = (
                               SELECT count(*) FROM messages m
                                WHERE m.chat_id = ? AND m.sequence > ?
                                  AND m.deleted_at IS NULL
                                  AND (m.sender_user_id IS NULL OR m.sender_user_id != ?)
                                  AND (m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                             ),
                             mention_count = (
                               SELECT count(*) FROM message_mentions mm
                               JOIN messages m ON m.id = mm.message_id
                                WHERE m.chat_id = ? AND m.sequence > ?
                                  AND mm.mentioned_user_id = ? AND m.deleted_at IS NULL
                             ),
                             sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                args: [
                    target ? text(target.id) : null,
                    targetSequence,
                    targetPts,
                    input.chatId,
                    targetSequence,
                    input.actorUserId,
                    input.chatId,
                    targetSequence,
                    input.actorUserId,
                    sequence,
                    input.chatId,
                    input.actorUserId,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.chatRead",
                entityId: input.chatId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            if (target && receiptMutation)
                await tx.execute({
                    sql: `UPDATE messages SET change_pts = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
                    args: [receiptMutation.pts, text(target.id)],
                });
            const chat = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!chat) throw new Error("Read chat became inaccessible");
            return {
                chat,
                hint: receiptMutation
                    ? {
                          ...chatHint(sequence, input.chatId, receiptMutation.pts),
                          areas: ["preferences"],
                      }
                    : areaHint(sequence, "preferences"),
            };
        });
    }

    async setChatNotificationPreferences(input: {
        actorUserId: string;
        chatId: string;
        notificationLevel?: NotificationLevel;
        mutedUntil?: string | null;
        notifyThreadReplies?: boolean;
        showMessagePreviews?: boolean;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            if (!(await this.chatAccess(tx, input.actorUserId, input.chatId, false)))
                throw new CollaborationError("not_found", "Chat was not found");
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO user_chat_preferences
                        (user_id, chat_id, notification_level, muted_until,
                         notify_thread_replies, show_message_previews, sync_sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(user_id, chat_id) DO UPDATE SET
                        notification_level = CASE WHEN ? = 1
                            THEN excluded.notification_level ELSE notification_level END,
                        muted_until = CASE WHEN ? = 1 THEN excluded.muted_until ELSE muted_until END,
                        notify_thread_replies = CASE WHEN ? = 1
                            THEN excluded.notify_thread_replies ELSE notify_thread_replies END,
                        show_message_previews = CASE WHEN ? = 1
                            THEN excluded.show_message_previews ELSE show_message_previews END,
                        sync_sequence = excluded.sync_sequence,
                        updated_at = CURRENT_TIMESTAMP`,
                args: [
                    input.actorUserId,
                    input.chatId,
                    input.notificationLevel ?? "all",
                    input.mutedUntil ?? null,
                    input.notifyThreadReplies === false ? 0 : 1,
                    input.showMessagePreviews === false ? 0 : 1,
                    sequence,
                    input.notificationLevel === undefined ? 0 : 1,
                    input.mutedUntil === undefined ? 0 : 1,
                    input.notifyThreadReplies === undefined ? 0 : 1,
                    input.showMessagePreviews === undefined ? 0 : 1,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.notificationsChanged",
                entityId: input.chatId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            const chat = await this.chatAccess(tx, input.actorUserId, input.chatId, false);
            if (!chat) throw new Error("Preference chat became inaccessible");
            return { chat, hint: areaHint(sequence, "preferences") };
        });
    }

    async getNotificationPreferences(userId: string): Promise<{
        directMessages: "all" | "none";
        mentions: "all" | "none";
        threadReplies: NotificationLevel;
        reactions: "all" | "none";
        calls: "all" | "none";
        emailNotifications: boolean;
        desktopNotifications: boolean;
        dndStartMinutes?: number;
        dndEndMinutes?: number;
        timezone?: string;
    }> {
        await this.requireActiveUser(this.client, userId);
        const row = await one(
            this.client,
            `SELECT direct_messages, mentions, thread_replies, reactions, calls,
                    email_notifications, desktop_notifications, dnd_start_minutes,
                    dnd_end_minutes, timezone
               FROM user_notification_preferences WHERE user_id = ?`,
            [userId],
        );
        return {
            directMessages: text(row?.direct_messages, "all") as "all" | "none",
            mentions: text(row?.mentions, "all") as "all" | "none",
            threadReplies: text(row?.thread_replies, "all") as NotificationLevel,
            reactions: text(row?.reactions, "all") as "all" | "none",
            calls: text(row?.calls, "all") as "all" | "none",
            emailNotifications: number(row?.email_notifications, 0) === 1,
            desktopNotifications: number(row?.desktop_notifications, 1) === 1,
            dndStartMinutes:
                row?.dnd_start_minutes === null || row?.dnd_start_minutes === undefined
                    ? undefined
                    : number(row.dnd_start_minutes),
            dndEndMinutes:
                row?.dnd_end_minutes === null || row?.dnd_end_minutes === undefined
                    ? undefined
                    : number(row.dnd_end_minutes),
            timezone: optionalText(row?.timezone),
        };
    }

    async updateNotificationPreferences(input: {
        actorUserId: string;
        directMessages?: "all" | "none";
        mentions?: "all" | "none";
        threadReplies?: NotificationLevel;
        reactions?: "all" | "none";
        calls?: "all" | "none";
        emailNotifications?: boolean;
        desktopNotifications?: boolean;
        dndStartMinutes?: number | null;
        dndEndMinutes?: number | null;
        timezone?: string | null;
    }): Promise<{
        preferences: Awaited<ReturnType<CollaborationRepository["getNotificationPreferences"]>>;
        hint: MutationHint;
    }> {
        const sequence = await this.write(async (tx) => {
            await this.requireActiveUser(tx, input.actorUserId);
            const existing = await one(
                tx,
                `SELECT 1 AS found FROM user_notification_preferences WHERE user_id = ?`,
                [input.actorUserId],
            );
            if (!existing)
                await tx.execute({
                    sql: `INSERT INTO user_notification_preferences (user_id, sync_sequence)
                          VALUES (?, ?)`,
                    args: [input.actorUserId, await this.nextSequence(tx)],
                });
            const next = existing ? await this.nextSequence(tx) : undefined;
            const syncSequence =
                next ??
                number(
                    (
                        await one(
                            tx,
                            `SELECT sync_sequence FROM user_notification_preferences WHERE user_id = ?`,
                            [input.actorUserId],
                        )
                    )?.sync_sequence,
                );
            await tx.execute({
                sql: `UPDATE user_notification_preferences
                         SET direct_messages = COALESCE(?, direct_messages),
                             mentions = COALESCE(?, mentions),
                             thread_replies = COALESCE(?, thread_replies),
                             reactions = COALESCE(?, reactions), calls = COALESCE(?, calls),
                             email_notifications = CASE WHEN ? = 1 THEN ? ELSE email_notifications END,
                             desktop_notifications = CASE WHEN ? = 1 THEN ? ELSE desktop_notifications END,
                             dnd_start_minutes = CASE WHEN ? = 1 THEN ? ELSE dnd_start_minutes END,
                             dnd_end_minutes = CASE WHEN ? = 1 THEN ? ELSE dnd_end_minutes END,
                             timezone = CASE WHEN ? = 1 THEN ? ELSE timezone END,
                             sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                       WHERE user_id = ?`,
                args: [
                    input.directMessages ?? null,
                    input.mentions ?? null,
                    input.threadReplies ?? null,
                    input.reactions ?? null,
                    input.calls ?? null,
                    input.emailNotifications === undefined ? 0 : 1,
                    input.emailNotifications ? 1 : 0,
                    input.desktopNotifications === undefined ? 0 : 1,
                    input.desktopNotifications ? 1 : 0,
                    input.dndStartMinutes === undefined ? 0 : 1,
                    input.dndStartMinutes ?? null,
                    input.dndEndMinutes === undefined ? 0 : 1,
                    input.dndEndMinutes ?? null,
                    input.timezone === undefined ? 0 : 1,
                    input.timezone ?? null,
                    syncSequence,
                    input.actorUserId,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence: syncSequence,
                kind: "preferences.globalNotificationsChanged",
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            return syncSequence;
        });
        return {
            preferences: await this.getNotificationPreferences(input.actorUserId),
            hint: areaHint(sequence, "preferences"),
        };
    }

    async listNotifications(input: {
        userId: string;
        before?: string;
        unreadOnly?: boolean;
        limit: number;
    }): Promise<{ notifications: NotificationSummary[]; nextCursor?: string }> {
        const conditions = [
            "n.user_id = ?",
            "(n.expires_at IS NULL OR datetime(n.expires_at) > CURRENT_TIMESTAMP)",
        ];
        const args: InArgs = [input.userId];
        if (input.unreadOnly) conditions.push("n.read_at IS NULL");
        if (input.before) {
            conditions.push(`(
                n.created_at < (SELECT created_at FROM notifications WHERE id = ?)
                OR (n.created_at = (SELECT created_at FROM notifications WHERE id = ?) AND n.id < ?)
            )`);
            args.push(input.before, input.before, input.before);
        }
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `SELECT n.id, n.kind, n.chat_id, n.message_id, n.thread_root_message_id,
                         n.actor_user_id, n.read_at, n.created_at
                    FROM notifications n WHERE ${conditions.join(" AND ")}
                   ORDER BY n.created_at DESC, n.id DESC LIMIT ?`,
            args,
        });
        const hasMore = result.rows.length > input.limit;
        const rows = result.rows.slice(0, input.limit);
        return {
            notifications: rows.map(asNotification),
            nextCursor: hasMore ? optionalText(rows.at(-1)?.id) : undefined,
        };
    }

    async markNotificationsRead(input: {
        actorUserId: string;
        notificationIds?: string[];
        all?: boolean;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const ids = [...new Set(input.notificationIds ?? [])];
            if (!input.all && ids.length === 0)
                throw new CollaborationError("invalid", "Notification ids or all=true is required");
            const sequence = await this.nextSequence(tx);
            if (input.all)
                await tx.execute({
                    sql: `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
                           WHERE user_id = ? AND read_at IS NULL`,
                    args: [input.actorUserId],
                });
            else {
                const placeholders = ids.map(() => "?").join(", ");
                await tx.execute({
                    sql: `UPDATE notifications SET read_at = CURRENT_TIMESTAMP
                           WHERE user_id = ? AND read_at IS NULL
                             AND id IN (${placeholders})`,
                    args: [input.actorUserId, ...ids],
                });
            }
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "notification.read",
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            return { hint: areaHint(sequence, "notifications") };
        });
    }

    async listMyThreads(input: {
        userId: string;
        before?: string;
        unreadOnly?: boolean;
        limit: number;
    }): Promise<{ threads: ThreadSummary[]; nextCursor?: string }> {
        const conditions = [
            `(tus.user_id = ? OR tp.user_id = ? OR root.sender_user_id = ?)`,
            `c.deleted_at IS NULL`,
            `(c.kind = 'public_channel' OR cm.user_id IS NOT NULL)`,
        ];
        const args: InArgs = [input.userId, input.userId, input.userId];
        if (input.unreadOnly) conditions.push("COALESCE(tus.unread_count, 0) > 0");
        if (input.before) {
            conditions.push(`(
                t.updated_at < (SELECT updated_at FROM threads WHERE root_message_id = ?)
                OR (t.updated_at = (SELECT updated_at FROM threads WHERE root_message_id = ?)
                    AND t.root_message_id < ?)
            )`);
            args.push(input.before, input.before, input.before);
        }
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `SELECT DISTINCT t.root_message_id, t.reply_count, t.participant_count,
                         t.last_reply_message_id, t.last_reply_sequence, t.updated_at,
                         COALESCE(tus.subscribed, 0) AS subscribed,
                         COALESCE(tus.unread_count, 0) AS unread_count,
                         COALESCE(tus.mention_count, 0) AS mention_count
                    FROM threads t
                    JOIN messages root ON root.id = t.root_message_id
                    JOIN chats c ON c.id = t.chat_id
               LEFT JOIN chat_members cm
                      ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
               LEFT JOIN thread_user_states tus
                      ON tus.thread_root_message_id = t.root_message_id AND tus.user_id = ?
               LEFT JOIN thread_participants tp
                      ON tp.thread_root_message_id = t.root_message_id AND tp.user_id = ?
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY t.updated_at DESC, t.root_message_id DESC LIMIT ?`,
            args: [input.userId, input.userId, input.userId, ...args],
        });
        const hasMore = result.rows.length > input.limit;
        const rows = result.rows.slice(0, input.limit);
        const threads: ThreadSummary[] = [];
        for (const row of rows) {
            const root = await this.getMessageProjection(
                this.client,
                input.userId,
                text(row.root_message_id),
            );
            if (!root) continue;
            threads.push({
                root,
                replyCount: number(row.reply_count, 0),
                participantCount: number(row.participant_count, 0),
                lastReplyMessageId: optionalText(row.last_reply_message_id),
                lastReplySequence: optionalText(row.last_reply_sequence),
                subscribed: number(row.subscribed, 0) === 1,
                unreadCount: number(row.unread_count, 0),
                mentionCount: number(row.mention_count, 0),
                updatedAt: text(row.updated_at),
            });
        }
        return {
            threads,
            nextCursor: hasMore ? optionalText(rows.at(-1)?.root_message_id) : undefined,
        };
    }

    async setThreadSubscription(input: {
        actorUserId: string;
        threadRootMessageId: string;
        subscribed: boolean;
        notificationLevel?: NotificationLevel;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const root = await this.getMessageProjection(
                tx,
                input.actorUserId,
                input.threadRootMessageId,
            );
            if (!root || root.deletedAt)
                throw new CollaborationError("not_found", "Thread was not found");
            if (
                !(await one(tx, `SELECT 1 AS found FROM threads WHERE root_message_id = ?`, [
                    input.threadRootMessageId,
                ]))
            )
                throw new CollaborationError("not_found", "Thread was not found");
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO thread_user_states
                        (thread_root_message_id, user_id, subscribed, notification_level)
                      VALUES (?, ?, ?, ?)
                      ON CONFLICT(thread_root_message_id, user_id) DO UPDATE SET
                        subscribed = excluded.subscribed,
                        notification_level = CASE WHEN ? = 1
                            THEN excluded.notification_level
                            ELSE thread_user_states.notification_level END,
                        updated_at = CURRENT_TIMESTAMP`,
                args: [
                    input.threadRootMessageId,
                    input.actorUserId,
                    input.subscribed ? 1 : 0,
                    input.notificationLevel ?? "all",
                    input.notificationLevel === undefined ? 0 : 1,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "threadPreferences.subscriptionChanged",
                entityId: input.threadRootMessageId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            return { hint: areaHint(sequence, "threads") };
        });
    }

    async markThreadRead(input: {
        actorUserId: string;
        threadRootMessageId: string;
        messageId?: string;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const root = await this.getMessageProjection(
                tx,
                input.actorUserId,
                input.threadRootMessageId,
            );
            if (!root) throw new CollaborationError("not_found", "Thread was not found");
            const target = input.messageId
                ? await one(
                      tx,
                      `SELECT id, sequence FROM messages
                        WHERE id = ? AND thread_root_message_id = ? AND deleted_at IS NULL`,
                      [input.messageId, input.threadRootMessageId],
                  )
                : await one(
                      tx,
                      `SELECT id, sequence FROM messages
                        WHERE thread_root_message_id = ? AND deleted_at IS NULL
                        ORDER BY sequence DESC LIMIT 1`,
                      [input.threadRootMessageId],
                  );
            const targetSequence = number(target?.sequence, 0);
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO thread_user_states
                        (thread_root_message_id, user_id, subscribed, last_read_message_id,
                         last_read_sequence, unread_count, mention_count)
                      VALUES (?, ?, 1, ?, ?, 0, 0)
                      ON CONFLICT(thread_root_message_id, user_id) DO UPDATE SET
                        last_read_message_id = excluded.last_read_message_id,
                        last_read_sequence = MAX(last_read_sequence, excluded.last_read_sequence),
                        unread_count = (
                          SELECT count(*) FROM messages m
                           WHERE m.thread_root_message_id = ? AND m.sequence > ?
                             AND m.deleted_at IS NULL
                        ),
                        mention_count = (
                          SELECT count(*) FROM message_mentions mm
                          JOIN messages m ON m.id = mm.message_id
                           WHERE m.thread_root_message_id = ? AND m.sequence > ?
                             AND mm.mentioned_user_id = ? AND m.deleted_at IS NULL
                        ),
                        updated_at = CURRENT_TIMESTAMP`,
                args: [
                    input.threadRootMessageId,
                    input.actorUserId,
                    target ? text(target.id) : null,
                    targetSequence,
                    input.threadRootMessageId,
                    targetSequence,
                    input.threadRootMessageId,
                    targetSequence,
                    input.actorUserId,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "threadPreferences.read",
                entityId: input.threadRootMessageId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            return { hint: areaHint(sequence, "threads") };
        });
    }

    async listChatPins(userId: string, chatId: string): Promise<ChatPinSummary[]> {
        if (!(await this.chatAccess(this.client, userId, chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.client.execute({
            sql: `SELECT id, message_id, pinned_by_user_id, created_at
                    FROM chat_pins WHERE chat_id = ? ORDER BY created_at DESC, id DESC`,
            args: [chatId],
        });
        const pins: ChatPinSummary[] = [];
        for (const row of result.rows) {
            const message = await this.getMessageProjection(
                this.client,
                userId,
                text(row.message_id),
            );
            if (!message) continue;
            pins.push({
                id: text(row.id),
                chatId,
                message,
                pinnedByUserId: optionalText(row.pinned_by_user_id),
                createdAt: text(row.created_at),
            });
        }
        return pins;
    }

    async setMessagePinned(input: {
        actorUserId: string;
        messageId: string;
        pinned: boolean;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const message = await this.getMessageProjection(tx, input.actorUserId, input.messageId);
            if (!message || message.deletedAt)
                throw new CollaborationError("not_found", "Message was not found");
            const access = await this.chatAccess(tx, input.actorUserId, message.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Message was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestricted(tx, input.actorUserId, message.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            const existing = await one(
                tx,
                `SELECT id, pinned_by_user_id FROM chat_pins WHERE chat_id = ? AND message_id = ?`,
                [message.chatId, input.messageId],
            );
            if (Boolean(existing) === input.pinned)
                throw new CollaborationError(
                    "conflict",
                    input.pinned ? "Message is already pinned" : "Message is not pinned",
                );
            if (
                !input.pinned &&
                existing?.pinned_by_user_id !== input.actorUserId &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner" &&
                access.membershipRole !== "admin"
            )
                throw new CollaborationError("forbidden", "Cannot remove this pin");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                message.chatId,
                input.pinned ? "pin.created" : "pin.deleted",
                input.messageId,
            );
            if (input.pinned)
                await tx.execute({
                    sql: `INSERT INTO chat_pins
                            (id, chat_id, message_id, pinned_by_user_id)
                          VALUES (?, ?, ?, ?)`,
                    args: [createId(), message.chatId, input.messageId, input.actorUserId],
                });
            else
                await tx.execute({
                    sql: `DELETE FROM chat_pins WHERE chat_id = ? AND message_id = ?`,
                    args: [message.chatId, input.messageId],
                });
            return { hint: chatHint(sequence, message.chatId, mutation.pts) };
        });
    }

    async listChatBookmarks(userId: string, chatId: string): Promise<ChatBookmarkSummary[]> {
        if (!(await this.chatAccess(this.client, userId, chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.client.execute({
            sql: `SELECT id, kind, title, url, message_id, file_id, emoji,
                         created_by_user_id, sort_order, created_at
                    FROM chat_bookmarks WHERE chat_id = ? ORDER BY sort_order, id`,
            args: [chatId],
        });
        return result.rows.map((row) => ({
            id: text(row.id),
            chatId,
            kind: text(row.kind) as ChatBookmarkSummary["kind"],
            title: text(row.title),
            url: optionalText(row.url),
            messageId: optionalText(row.message_id),
            fileId: optionalText(row.file_id),
            emoji: optionalText(row.emoji),
            createdByUserId: optionalText(row.created_by_user_id),
            sortOrder: number(row.sort_order, 0),
            createdAt: text(row.created_at),
        }));
    }

    async createChatBookmark(input: {
        actorUserId: string;
        chatId: string;
        kind: "link" | "message" | "file";
        title: string;
        url?: string;
        messageId?: string;
        fileId?: string;
        emoji?: string;
    }): Promise<{ bookmark: ChatBookmarkSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (input.kind === "message")
                await this.requireMessageInChat(tx, input.messageId!, input.chatId);
            if (
                input.kind === "file" &&
                !(await this.canAccessFileWith(tx, input.actorUserId, input.fileId!))
            )
                throw new CollaborationError("not_found", "File was not found");
            const id = createId();
            const order = number(
                (
                    await one(
                        tx,
                        `SELECT COALESCE(MAX(sort_order), -1) + 1 AS next_order
                           FROM chat_bookmarks WHERE chat_id = ?`,
                        [input.chatId],
                    )
                )?.next_order,
                0,
            );
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "bookmark.created",
                id,
            );
            await tx.execute({
                sql: `INSERT INTO chat_bookmarks
                        (id, chat_id, kind, title, url, message_id, file_id, emoji,
                         sort_order, created_by_user_id)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.chatId,
                    input.kind,
                    input.title,
                    input.url ?? null,
                    input.messageId ?? null,
                    input.fileId ?? null,
                    input.emoji ?? null,
                    order,
                    input.actorUserId,
                ],
            });
            return {
                bookmark: {
                    id,
                    chatId: input.chatId,
                    kind: input.kind,
                    title: input.title,
                    url: input.url,
                    messageId: input.messageId,
                    fileId: input.fileId,
                    emoji: input.emoji,
                    createdByUserId: input.actorUserId,
                    sortOrder: order,
                    createdAt: new Date().toISOString(),
                },
                hint: chatHint(sequence, input.chatId, mutation.pts),
            };
        });
    }

    async deleteChatBookmark(input: {
        actorUserId: string;
        chatId: string;
        bookmarkId: string;
    }): Promise<{ hint: MutationHint }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            const bookmark = await one(
                tx,
                `SELECT created_by_user_id FROM chat_bookmarks WHERE id = ? AND chat_id = ?`,
                [input.bookmarkId, input.chatId],
            );
            if (!bookmark) throw new CollaborationError("not_found", "Bookmark was not found");
            if (
                bookmark.created_by_user_id !== input.actorUserId &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner" &&
                access.membershipRole !== "admin"
            )
                throw new CollaborationError("forbidden", "Cannot delete this bookmark");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "bookmark.deleted",
                input.bookmarkId,
            );
            await tx.execute({
                sql: `DELETE FROM chat_bookmarks WHERE id = ? AND chat_id = ?`,
                args: [input.bookmarkId, input.chatId],
            });
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
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
        expiryMode?: "none" | "after_send" | "after_read";
        selfDestructSeconds?: number;
        afterReadScope?: "any_reader" | "all_readers";
        clientMutationId?: string;
        kind?: "user" | "automated";
        senderBotId?: string;
        forwardedFromMessageId?: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint }> {
        const scope = `message.send:${input.chatId}`;
        return this.write(async (tx) => {
            if (input.kind === "automated") {
                await this.requireServerAdmin(tx, input.actorUserId);
                if (
                    input.senderBotId &&
                    !(await one(
                        tx,
                        `SELECT 1 AS found FROM bot_identities
                          WHERE id = ? AND active = 1 AND deleted_at IS NULL`,
                        [input.senderBotId],
                    ))
                )
                    throw new CollaborationError("not_found", "Bot identity was not found");
            }
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
            const access =
                input.kind === "automated"
                    ? await this.requireChatManager(tx, input.actorUserId, input.chatId)
                    : await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestricted(tx, input.actorUserId, input.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            const expiryMode =
                input.expiryMode ??
                (input.expiresAt
                    ? "after_send"
                    : access.defaultExpiryMode === "none"
                      ? "none"
                      : access.defaultExpiryMode);
            const selfDestructSeconds =
                input.selfDestructSeconds ?? access.defaultSelfDestructSeconds;
            if (expiryMode !== "none" && !selfDestructSeconds && !input.expiresAt)
                throw new CollaborationError(
                    "invalid",
                    "Self-destructing messages require a duration",
                );
            const selfDestructAt =
                expiryMode === "after_send"
                    ? (input.expiresAt ??
                      new Date(Date.now() + selfDestructSeconds! * 1_000).toISOString())
                    : null;
            let retentionSeconds = access.retentionSeconds;
            if (access.retentionMode === "inherit") {
                const defaults = await one(
                    tx,
                    `SELECT default_retention_mode, default_retention_seconds
                       FROM server_settings WHERE id = 1`,
                );
                retentionSeconds =
                    defaults?.default_retention_mode === "duration"
                        ? number(defaults.default_retention_seconds, 0) || undefined
                        : undefined;
            } else if (access.retentionMode === "forever") retentionSeconds = undefined;
            const retentionAt = retentionSeconds
                ? new Date(Date.now() + retentionSeconds * 1_000).toISOString()
                : null;
            const expiresAt = earliestDate(selfDestructAt, retentionAt);
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
                         forwarded_from_message_id, expires_at, expiry_mode,
                         self_destruct_seconds, after_read_scope, sender_bot_id, published_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
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
                    expiresAt,
                    expiryMode,
                    selfDestructSeconds ?? null,
                    input.afterReadScope ?? "any_reader",
                    input.senderBotId ?? null,
                ],
            });
            const mentions = await this.replaceMessageMentions(tx, id, input.text);
            await this.indexMessageForSearch(tx, id, input.chatId, input.text, 1);
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
                            (root_message_id, chat_id, created_by_user_id, reply_count, last_pts,
                             last_reply_message_id, last_reply_sequence, participant_count)
                          VALUES (?, ?, ?, 1, ?, ?, ?, 1)
                          ON CONFLICT(root_message_id) DO UPDATE SET
                            reply_count = reply_count + 1, last_pts = excluded.last_pts,
                            last_reply_message_id = excluded.last_reply_message_id,
                            last_reply_sequence = excluded.last_reply_sequence,
                            updated_at = CURRENT_TIMESTAMP`,
                    args: [
                        input.threadRootMessageId,
                        input.chatId,
                        input.actorUserId,
                        mutation.pts,
                        id,
                        mutation.messageSequence,
                    ],
                });
                await tx.execute({
                    sql: `INSERT INTO thread_participants
                            (thread_root_message_id, user_id, reply_count)
                          VALUES (?, ?, 1)
                          ON CONFLICT(thread_root_message_id, user_id) DO UPDATE SET
                            reply_count = reply_count + 1,
                            last_participated_at = CURRENT_TIMESTAMP`,
                    args: [input.threadRootMessageId, input.actorUserId],
                });
                await tx.execute({
                    sql: `UPDATE threads
                             SET participant_count = (
                                 SELECT count(*) FROM thread_participants
                                  WHERE thread_root_message_id = ?
                             )
                           WHERE root_message_id = ?`,
                    args: [input.threadRootMessageId, input.threadRootMessageId],
                });
                await tx.execute({
                    sql: `UPDATE messages SET change_pts = ? WHERE id = ?`,
                    args: [mutation.pts, input.threadRootMessageId],
                });
            }
            await this.recordMessageDelivery(tx, {
                actorUserId: input.actorUserId,
                chat: access,
                messageId: id,
                messageSequence: mutation.messageSequence,
                threadRootMessageId: input.threadRootMessageId,
                mentionedUserIds: mentions.userIds,
                mentionAll: mentions.notifyAll,
                syncSequence: sequence,
            });
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
            if (input.kind === "automated")
                await this.appendAudit(tx, {
                    actorUserId: input.actorUserId,
                    action: "message.automated_sent",
                    targetType: "message",
                    targetId: id,
                    chatId: input.chatId,
                    after: { botId: input.senderBotId },
                });
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
            const destinations = new Map<string, ChatAccess>();
            for (const chatId of targetChatIds) {
                const destination = await this.chatAccess(tx, input.actorUserId, chatId, true);
                if (!destination)
                    throw new CollaborationError("not_found", "Destination chat was not found");
                if (destination.archivedAt)
                    throw new CollaborationError("forbidden", "Archived chats are read-only");
                if (await this.isPostingRestricted(tx, input.actorUserId, chatId))
                    throw new CollaborationError(
                        "forbidden",
                        "Posting is restricted by moderation",
                    );
                destinations.set(chatId, destination);
            }
            const sequence = await this.nextSequence(tx);
            const messages: MessageSummary[] = [];
            const hints: MutationHint[] = [];
            const messageIds: string[] = [];
            const points: Array<{ chatId: string; pts: number }> = [];
            for (const chatId of targetChatIds) {
                const destination = destinations.get(chatId)!;
                let retentionSeconds = destination.retentionSeconds;
                if (destination.retentionMode === "inherit") {
                    const defaults = await one(
                        tx,
                        `SELECT default_retention_mode, default_retention_seconds
                           FROM server_settings WHERE id = 1`,
                    );
                    retentionSeconds =
                        defaults?.default_retention_mode === "duration"
                            ? number(defaults.default_retention_seconds, 0) || undefined
                            : undefined;
                } else if (destination.retentionMode === "forever") retentionSeconds = undefined;
                const expiryMode = destination.defaultExpiryMode;
                const selfDestructSeconds = destination.defaultSelfDestructSeconds;
                const selfDestructAt =
                    expiryMode === "after_send" && selfDestructSeconds
                        ? new Date(Date.now() + selfDestructSeconds * 1_000).toISOString()
                        : null;
                const retentionAt = retentionSeconds
                    ? new Date(Date.now() + retentionSeconds * 1_000).toISOString()
                    : null;
                const expiresAt = earliestDate(selfDestructAt, retentionAt);
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
                             forwarded_from_message_id, expires_at, expiry_mode,
                             self_destruct_seconds, after_read_scope, published_at)
                          VALUES (?, ?, ?, ?, ?, 'user', ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                    args: [
                        id,
                        chatId,
                        mutation.messageSequence,
                        mutation.pts,
                        input.actorUserId,
                        source.text,
                        source.id,
                        expiresAt ?? null,
                        expiryMode,
                        selfDestructSeconds ?? null,
                        destination.defaultAfterReadScope,
                    ],
                });
                await this.indexMessageForSearch(tx, id, chatId, source.text, 1);
                await tx.execute({
                    sql: `INSERT INTO message_forward_metadata
                            (message_id, source_message_id, source_chat_id,
                             source_sender_user_id, source_created_at, source_text_snapshot,
                             forwarded_by_user_id)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        source.id,
                        source.chatId,
                        source.sender?.id ?? null,
                        source.createdAt,
                        source.text,
                        input.actorUserId,
                    ],
                });
                for (const [position, file] of source.attachments.entries())
                    await tx.execute({
                        sql: `INSERT INTO message_attachments (message_id, file_id, position)
                              VALUES (?, ?, ?)`,
                        args: [id, file.id, position],
                    });
                await this.recordMessageDelivery(tx, {
                    actorUserId: input.actorUserId,
                    chat: destination,
                    messageId: id,
                    messageSequence: mutation.messageSequence,
                    mentionedUserIds: [],
                    syncSequence: sequence,
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

    async editMessage(input: {
        actorUserId: string;
        messageId: string;
        text: string;
        reason?: string;
        expectedRevision?: number;
    }): Promise<{ message: MessageSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const row = await one(
                tx,
                `SELECT m.chat_id, m.sender_user_id, m.kind, m.text, m.content_json,
                        m.revision, m.deleted_at, m.expires_at
                   FROM messages m
                  WHERE m.id = ?`,
                [input.messageId],
            );
            if (!row || row.deleted_at !== null || isPast(optionalText(row.expires_at)))
                throw new CollaborationError("not_found", "Message was not found");
            const access = await this.chatAccess(tx, input.actorUserId, text(row.chat_id), false);
            if (!access) throw new CollaborationError("not_found", "Message was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestricted(tx, input.actorUserId, text(row.chat_id)))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            if (row.kind !== "user" || row.sender_user_id !== input.actorUserId)
                throw new CollaborationError("forbidden", "Cannot edit this message");
            const revision = number(row.revision, 1);
            if (input.expectedRevision !== undefined && input.expectedRevision !== revision)
                throw new CollaborationError("conflict", "Message was edited by another request");
            if (text(row.text) === input.text)
                throw new CollaborationError("conflict", "Message text is unchanged");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                text(row.chat_id),
                "message.edited",
                input.messageId,
            );
            await tx.execute({
                sql: `INSERT OR IGNORE INTO message_revisions
                        (id, message_id, revision, text, content_json, edited_by_user_id,
                         edit_reason)
                      VALUES (?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    createId(),
                    input.messageId,
                    revision,
                    text(row.text),
                    row.content_json ?? null,
                    input.actorUserId,
                    input.reason ?? null,
                ],
            });
            const nextRevision = revision + 1;
            await tx.execute({
                sql: `UPDATE messages
                         SET text = ?, revision = ?, edited_at = CURRENT_TIMESTAMP,
                             edited_by_user_id = ?, edit_reason = ?, change_pts = ?,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [
                    input.text,
                    nextRevision,
                    input.actorUserId,
                    input.reason ?? null,
                    mutation.pts,
                    input.messageId,
                ],
            });
            await tx.execute({
                sql: `INSERT INTO message_revisions
                        (id, message_id, revision, text, content_json, edited_by_user_id,
                         edit_reason)
                      VALUES (?, ?, ?, ?, NULL, ?, ?)`,
                args: [
                    createId(),
                    input.messageId,
                    nextRevision,
                    input.text,
                    input.actorUserId,
                    input.reason ?? null,
                ],
            });
            await this.replaceMessageMentions(tx, input.messageId, input.text);
            await this.indexMessageForSearch(
                tx,
                input.messageId,
                text(row.chat_id),
                input.text,
                nextRevision,
            );
            const message = await this.getMessageProjection(tx, input.actorUserId, input.messageId);
            if (!message) throw new Error("Edited message is not readable");
            return {
                message,
                hint: chatHint(sequence, text(row.chat_id), mutation.pts),
            };
        });
    }

    async listMessageRevisions(
        userId: string,
        messageId: string,
    ): Promise<
        Array<{
            revision: number;
            text: string;
            editedByUserId?: string;
            editReason?: string;
            createdAt: string;
        }>
    > {
        const message = await this.getMessageProjection(this.client, userId, messageId);
        if (!message || message.deletedAt)
            throw new CollaborationError("not_found", "Message was not found");
        const result = await this.client.execute({
            sql: `SELECT revision, text, edited_by_user_id, edit_reason, created_at
                    FROM message_revisions WHERE message_id = ? ORDER BY revision DESC`,
            args: [messageId],
        });
        return result.rows.map((row) => ({
            revision: number(row.revision),
            text: text(row.text),
            editedByUserId: optionalText(row.edited_by_user_id),
            editReason: optionalText(row.edit_reason),
            createdAt: text(row.created_at),
        }));
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
            await tx.execute({
                sql: `DELETE FROM message_search_documents WHERE message_id = ?`,
                args: [messageId],
            });
            await tx.execute({
                sql: `DELETE FROM message_revisions WHERE message_id = ?`,
                args: [messageId],
            });
            await tx.execute({
                sql: `DELETE FROM notifications WHERE message_id = ?`,
                args: [messageId],
            });
            if (row.thread_root_message_id) {
                await this.recomputeThreadProjection(
                    tx,
                    text(row.thread_root_message_id),
                    mutation.pts,
                );
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
            if (await this.isPostingRestricted(tx, input.actorUserId, message.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            const reactionKey = input.customEmojiId
                ? `custom:${input.customEmojiId}`
                : `unicode:${input.emoji}`;
            let customEmoji: Row | undefined;
            if (input.customEmojiId) {
                customEmoji = await one(
                    tx,
                    `SELECT name, file_id FROM custom_emojis
                      WHERE id = ? AND deleted_at IS NULL`,
                    [input.customEmojiId],
                );
                if (!customEmoji)
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
                            (message_id, user_id, reaction_key, emoji, custom_emoji_id,
                             custom_emoji_name_snapshot, custom_emoji_file_id_snapshot)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        input.messageId,
                        input.actorUserId,
                        reactionKey,
                        input.emoji ?? null,
                        input.customEmojiId ?? null,
                        customEmoji ? text(customEmoji.name) : null,
                        customEmoji ? text(customEmoji.file_id) : null,
                    ],
                });
            } else {
                await tx.execute({
                    sql: `DELETE FROM reactions
                           WHERE message_id = ? AND user_id = ? AND reaction_key = ?`,
                    args: [input.messageId, input.actorUserId, reactionKey],
                });
            }
            const recipient = await one(tx, `SELECT sender_user_id FROM messages WHERE id = ?`, [
                input.messageId,
            ]);
            const recipientUserId = optionalText(recipient?.sender_user_id);
            const reactionPreference = recipientUserId
                ? await one(
                      tx,
                      `SELECT COALESCE(reactions, 'all') AS reactions
                         FROM user_notification_preferences WHERE user_id = ?`,
                      [recipientUserId],
                  )
                : undefined;
            if (
                input.active &&
                recipientUserId &&
                recipientUserId !== input.actorUserId &&
                reactionPreference?.reactions !== "none"
            ) {
                const notificationId = createId();
                await tx.execute({
                    sql: `INSERT INTO notifications
                            (id, user_id, kind, chat_id, message_id, actor_user_id,
                             payload_json, sync_sequence)
                          VALUES (?, ?, 'reaction', ?, ?, ?, ?, ?)`,
                    args: [
                        notificationId,
                        recipientUserId,
                        message.chatId,
                        input.messageId,
                        input.actorUserId,
                        JSON.stringify({ reactionKey }),
                        sequence,
                    ],
                });
                await this.insertSyncEvent(tx, {
                    sequence,
                    kind: "notification.created",
                    entityId: notificationId,
                    actorUserId: input.actorUserId,
                    targetUserId: recipientUserId,
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
        const retention = await one(
            this.client,
            `SELECT min_recoverable_sequence FROM server_sync_state WHERE id = 1`,
        );
        if (input.fromSequence < number(retention?.min_recoverable_sequence, 0))
            return {
                kind: "reset",
                changedChats: [],
                removedChatIds: [],
                areas: ["all"],
                state: current,
                targetState: current,
            };
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
            if (targetUserId && targetUserId !== input.userId) continue;
            if (
                chatId &&
                targetUserId === input.userId &&
                (kind === "member.removed" || kind === "member.left")
            ) {
                if (!(await this.canAccessChat(input.userId, chatId))) removedChatIds.add(chatId);
                else changedChatIds.add(chatId);
                continue;
            }
            if (chatId && kind === "chat.deleted") {
                const wasMember = await one(
                    this.client,
                    `SELECT 1 AS found FROM chat_members WHERE chat_id = ? AND user_id = ?`,
                    [chatId, input.userId],
                );
                if (wasMember) removedChatIds.add(chatId);
                continue;
            }
            if (chatId && kind === "chat.visibilityChanged") {
                if (await this.canAccessChat(input.userId, chatId)) changedChatIds.add(chatId);
                else removedChatIds.add(chatId);
                continue;
            }
            if (kind.startsWith("call.")) areas.add("calls");
            if (chatId && (await this.canAccessChat(input.userId, chatId))) {
                changedChatIds.add(chatId);
                continue;
            }
            if (kind.startsWith("preferences.")) areas.add("preferences");
            else if (kind.startsWith("notification.")) areas.add("notifications");
            else if (kind.startsWith("threadPreferences.")) areas.add("threads");
            else if (kind.startsWith("scheduled.")) areas.add("scheduledMessages");
            else if (kind.startsWith("automation.")) areas.add("automations");
            else if (kind.startsWith("bot.")) areas.add("bots");
            else if (kind.startsWith("integration.")) areas.add("integrations");
            else if (kind.startsWith("presence.")) areas.add("presence");
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
                            update.kind.startsWith("thread.") ||
                            update.kind.startsWith("receipt.")),
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
                sql: `SELECT m.id, m.chat_id, m.thread_root_message_id
                        FROM messages m
                        JOIN chats c ON c.id = m.chat_id
                        JOIN server_settings s ON s.id = 1
                       WHERE m.deleted_at IS NULL AND (
                         (m.expires_at IS NOT NULL
                          AND datetime(m.expires_at) <= CURRENT_TIMESTAMP)
                         OR (c.retention_mode = 'duration'
                             AND c.retention_seconds IS NOT NULL
                             AND datetime(m.created_at, '+' || c.retention_seconds || ' seconds')
                                 <= CURRENT_TIMESTAMP)
                         OR (c.retention_mode = 'inherit'
                             AND s.default_retention_mode = 'duration'
                             AND s.default_retention_seconds IS NOT NULL
                             AND datetime(m.created_at, '+' || s.default_retention_seconds || ' seconds')
                                 <= CURRENT_TIMESTAMP)
                       )
                       ORDER BY COALESCE(m.expires_at, m.created_at), m.id LIMIT ?`,
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
                           WHERE id = ? AND deleted_at IS NULL`,
                    args: [mutation.pts, messageId],
                });
                if (changed.rowsAffected) {
                    await tx.execute({
                        sql: `DELETE FROM message_search_documents WHERE message_id = ?`,
                        args: [messageId],
                    });
                    await tx.execute({
                        sql: `DELETE FROM message_revisions WHERE message_id = ?`,
                        args: [messageId],
                    });
                    await tx.execute({
                        sql: `DELETE FROM notifications WHERE message_id = ?`,
                        args: [messageId],
                    });
                    const threadRootMessageId = optionalText(row.thread_root_message_id);
                    if (threadRootMessageId) {
                        await this.recomputeThreadProjection(tx, threadRootMessageId, mutation.pts);
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

    async listPresenceSettings(userIds?: string[]): Promise<PresenceSettingsSummary[]> {
        const ids = userIds ? [...new Set(userIds)] : undefined;
        if (ids?.length === 0) return [];
        const condition = ids ? `WHERE ups.user_id IN (${ids.map(() => "?").join(", ")})` : "";
        const result = await this.client.execute({
            sql: `SELECT ups.user_id, ups.availability,
                         CASE WHEN ups.status_expires_at IS NULL
                                   OR datetime(ups.status_expires_at) > CURRENT_TIMESTAMP
                              THEN ups.custom_status_text END AS custom_status_text,
                         CASE WHEN ups.status_expires_at IS NULL
                                   OR datetime(ups.status_expires_at) > CURRENT_TIMESTAMP
                              THEN ups.custom_status_emoji END AS custom_status_emoji,
                         CASE WHEN ups.status_expires_at IS NULL
                                   OR datetime(ups.status_expires_at) > CURRENT_TIMESTAMP
                              THEN ups.status_expires_at END AS status_expires_at,
                         CASE WHEN ups.dnd_until IS NOT NULL
                                   AND datetime(ups.dnd_until) > CURRENT_TIMESTAMP
                              THEN ups.dnd_until END AS dnd_until,
                         ups.updated_at
                    FROM user_presence_settings ups ${condition}
                   ORDER BY ups.user_id`,
            args: ids ?? [],
        });
        return result.rows.map((row) => ({
            userId: text(row.user_id),
            availability:
                optionalText(row.dnd_until) !== undefined
                    ? "dnd"
                    : (text(row.availability) as PresenceSettingsSummary["availability"]),
            customStatusText: optionalText(row.custom_status_text),
            customStatusEmoji: optionalText(row.custom_status_emoji),
            statusExpiresAt: optionalText(row.status_expires_at),
            dndUntil: optionalText(row.dnd_until),
            updatedAt: text(row.updated_at),
        }));
    }

    async updatePresenceSettings(input: {
        actorUserId: string;
        availability?: "automatic" | "online" | "away" | "dnd";
        customStatusText?: string | null;
        customStatusEmoji?: string | null;
        statusExpiresAt?: string | null;
        dndUntil?: string | null;
    }): Promise<{ presence: PresenceSettingsSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireActiveUser(tx, input.actorUserId);
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `INSERT INTO user_presence_settings
                        (user_id, availability, custom_status_text, custom_status_emoji,
                         status_expires_at, dnd_until, sync_sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?)
                      ON CONFLICT(user_id) DO UPDATE SET
                        availability = CASE WHEN ? = 1
                            THEN excluded.availability ELSE availability END,
                        custom_status_text = CASE WHEN ? = 1
                            THEN excluded.custom_status_text ELSE custom_status_text END,
                        custom_status_emoji = CASE WHEN ? = 1
                            THEN excluded.custom_status_emoji ELSE custom_status_emoji END,
                        status_expires_at = CASE WHEN ? = 1
                            THEN excluded.status_expires_at ELSE status_expires_at END,
                        dnd_until = CASE WHEN ? = 1 THEN excluded.dnd_until ELSE dnd_until END,
                        sync_sequence = excluded.sync_sequence,
                        updated_at = CURRENT_TIMESTAMP`,
                args: [
                    input.actorUserId,
                    input.availability ?? "automatic",
                    input.customStatusText ?? null,
                    input.customStatusEmoji ?? null,
                    input.statusExpiresAt ?? null,
                    input.dndUntil ?? null,
                    sequence,
                    input.availability === undefined ? 0 : 1,
                    input.customStatusText === undefined ? 0 : 1,
                    input.customStatusEmoji === undefined ? 0 : 1,
                    input.statusExpiresAt === undefined ? 0 : 1,
                    input.dndUntil === undefined ? 0 : 1,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "presence.updated",
                entityId: input.actorUserId,
                actorUserId: input.actorUserId,
            });
            const [presence] = await this.listPresenceSettingsWith(tx, [input.actorUserId]);
            if (!presence) throw new Error("Presence settings were not saved");
            return { presence, hint: areaHint(sequence, "presence") };
        });
    }

    async createCall(input: {
        actorUserId: string;
        chatId: string;
        kind: "audio" | "video";
        invitedUserIds?: string[];
    }): Promise<{ call: CallSummary; hint: MutationHint; invitedUserIds: string[] }> {
        return this.write(async (tx) => {
            const access = await this.chatAccess(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestricted(tx, input.actorUserId, input.chatId))
                throw new CollaborationError("forbidden", "Calling is restricted by moderation");
            const members = await tx.execute({
                sql: `SELECT user_id FROM chat_members
                       WHERE chat_id = ? AND left_at IS NULL AND user_id != ?`,
                args: [input.chatId, input.actorUserId],
            });
            const memberIds = new Set(members.rows.map((row) => text(row.user_id)));
            const invitedUserIds = input.invitedUserIds
                ? [...new Set(input.invitedUserIds)]
                : [...memberIds];
            if (invitedUserIds.length === 0 || invitedUserIds.length > 50)
                throw new CollaborationError(
                    "invalid",
                    "A call requires between 1 and 50 invited participants",
                );
            if (invitedUserIds.some((userId) => !memberIds.has(userId)))
                throw new CollaborationError("not_found", "A call participant was not found");
            const active = await one(
                tx,
                `SELECT id FROM calls
                  WHERE chat_id = ? AND status IN ('ringing', 'active') LIMIT 1`,
                [input.chatId],
            );
            if (active) throw new CollaborationError("conflict", "Chat already has an active call");
            const id = createId();
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "call.created",
                id,
            );
            await tx.execute({
                sql: `INSERT INTO calls (id, chat_id, created_by_user_id, kind)
                      VALUES (?, ?, ?, ?)`,
                args: [id, input.chatId, input.actorUserId, input.kind],
            });
            await tx.execute({
                sql: `INSERT INTO call_participants
                        (call_id, user_id, invited_by_user_id, status, joined_at, last_seen_at)
                      VALUES (?, ?, ?, 'joined', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`,
                args: [id, input.actorUserId, input.actorUserId],
            });
            await tx.execute({
                sql: `INSERT INTO call_events (id, call_id, kind, actor_user_id)
                      VALUES (?, ?, 'created', ?)`,
                args: [createId(), id, input.actorUserId],
            });
            for (const userId of invitedUserIds) {
                await tx.execute({
                    sql: `INSERT INTO call_participants
                            (call_id, user_id, invited_by_user_id, status, ringing_at)
                          VALUES (?, ?, ?, 'ringing', CURRENT_TIMESTAMP)`,
                    args: [id, userId, input.actorUserId],
                });
                await tx.execute({
                    sql: `INSERT INTO call_events
                            (id, call_id, kind, actor_user_id, target_user_id)
                          VALUES (?, ?, 'ringing', ?, ?)`,
                    args: [createId(), id, input.actorUserId, userId],
                });
                const notificationPreference = await one(
                    tx,
                    `SELECT calls FROM user_notification_preferences WHERE user_id = ?`,
                    [userId],
                );
                if (notificationPreference?.calls === "none") continue;
                const notificationId = createId();
                await tx.execute({
                    sql: `INSERT INTO notifications
                            (id, user_id, kind, chat_id, actor_user_id, payload_json,
                             sync_sequence)
                          VALUES (?, ?, 'call', ?, ?, ?, ?)`,
                    args: [
                        notificationId,
                        userId,
                        input.chatId,
                        input.actorUserId,
                        JSON.stringify({ callId: id, kind: input.kind }),
                        sequence,
                    ],
                });
                await this.insertSyncEvent(tx, {
                    sequence,
                    kind: "notification.created",
                    entityId: notificationId,
                    actorUserId: input.actorUserId,
                    targetUserId: userId,
                });
            }
            const call = await this.getCallProjection(tx, input.actorUserId, id);
            if (!call) throw new Error("Created call is not readable");
            return {
                call,
                hint: {
                    ...chatHint(sequence, input.chatId, mutation.pts),
                    areas: ["calls"],
                },
                invitedUserIds,
            };
        });
    }

    async getCall(userId: string, callId: string): Promise<CallSummary> {
        const call = await this.getCallProjection(this.client, userId, callId);
        if (!call) throw new CollaborationError("not_found", "Call was not found");
        return call;
    }

    async listCalls(input: {
        userId: string;
        chatId?: string;
        limit: number;
    }): Promise<CallSummary[]> {
        if (
            input.chatId &&
            !(await this.chatAccess(this.client, input.userId, input.chatId, false))
        )
            throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.client.execute({
            sql: `SELECT c.id FROM calls c
                   WHERE (? IS NULL OR c.chat_id = ?)
                     AND EXISTS (
                       SELECT 1 FROM call_participants cp
                        WHERE cp.call_id = c.id AND cp.user_id = ?
                     )
                   ORDER BY c.created_at DESC, c.id DESC LIMIT ?`,
            args: [input.chatId ?? null, input.chatId ?? null, input.userId, input.limit],
        });
        const calls: CallSummary[] = [];
        for (const row of result.rows) {
            const call = await this.getCallProjection(this.client, input.userId, text(row.id));
            if (call) calls.push(call);
        }
        return calls;
    }

    async updateCallParticipation(input: {
        actorUserId: string;
        callId: string;
        action: "join" | "decline" | "leave";
    }): Promise<{ call: CallSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const call = await this.getCallProjection(tx, input.actorUserId, input.callId);
            if (!call) throw new CollaborationError("not_found", "Call was not found");
            if (call.status === "ended" || call.status === "cancelled" || call.status === "failed")
                throw new CollaborationError("conflict", "Call has ended");
            const participant = await one(
                tx,
                `SELECT status FROM call_participants WHERE call_id = ? AND user_id = ?`,
                [input.callId, input.actorUserId],
            );
            if (!participant) throw new CollaborationError("not_found", "Call was not found");
            const nextStatus =
                input.action === "join"
                    ? "joined"
                    : input.action === "decline"
                      ? "declined"
                      : "left";
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                call.chatId,
                `call.${nextStatus}`,
                input.callId,
            );
            await tx.execute({
                sql: `UPDATE call_participants
                         SET status = ?,
                             joined_at = CASE WHEN ? = 'joined' THEN COALESCE(joined_at, CURRENT_TIMESTAMP) ELSE joined_at END,
                             left_at = CASE WHEN ? IN ('declined', 'left') THEN CURRENT_TIMESTAMP ELSE left_at END,
                             last_seen_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                       WHERE call_id = ? AND user_id = ?`,
                args: [nextStatus, nextStatus, nextStatus, input.callId, input.actorUserId],
            });
            await tx.execute({
                sql: `INSERT INTO call_events (id, call_id, kind, actor_user_id)
                      VALUES (?, ?, ?, ?)`,
                args: [createId(), input.callId, nextStatus, input.actorUserId],
            });
            if (nextStatus === "joined")
                await tx.execute({
                    sql: `UPDATE calls SET status = 'active',
                                 started_at = COALESCE(started_at, CURRENT_TIMESTAMP),
                                 updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                    args: [input.callId],
                });
            else {
                const remaining = await one(
                    tx,
                    `SELECT 1 AS found FROM call_participants
                      WHERE call_id = ? AND status IN ('joined', 'ringing', 'invited') LIMIT 1`,
                    [input.callId],
                );
                if (!remaining)
                    await tx.execute({
                        sql: `UPDATE calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP,
                                     end_reason = 'no_participants', updated_at = CURRENT_TIMESTAMP
                               WHERE id = ?`,
                        args: [input.callId],
                    });
            }
            const updated = await this.getCallProjection(tx, input.actorUserId, input.callId);
            if (!updated) throw new Error("Updated call is not readable");
            return {
                call: updated,
                hint: {
                    ...chatHint(sequence, call.chatId, mutation.pts),
                    areas: ["calls"],
                },
            };
        });
    }

    async endCall(input: {
        actorUserId: string;
        callId: string;
        reason?: string;
    }): Promise<{ call: CallSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            const call = await this.getCallProjection(tx, input.actorUserId, input.callId);
            if (!call) throw new CollaborationError("not_found", "Call was not found");
            const access = await this.chatAccess(tx, input.actorUserId, call.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Call was not found");
            if (
                call.createdByUserId !== input.actorUserId &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner" &&
                access.membershipRole !== "admin"
            )
                throw new CollaborationError("forbidden", "Cannot end this call");
            if (!["ringing", "active"].includes(call.status))
                throw new CollaborationError("conflict", "Call has already ended");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                call.chatId,
                "call.ended",
                input.callId,
            );
            await tx.execute({
                sql: `UPDATE calls SET status = 'ended', ended_at = CURRENT_TIMESTAMP,
                             end_reason = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [input.reason ?? "ended", input.callId],
            });
            await tx.execute({
                sql: `UPDATE call_participants
                         SET status = CASE WHEN status IN ('ringing', 'invited') THEN 'missed'
                                           WHEN status = 'joined' THEN 'left' ELSE status END,
                             left_at = CASE WHEN status IN ('ringing', 'invited', 'joined')
                                            THEN CURRENT_TIMESTAMP ELSE left_at END,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE call_id = ?`,
                args: [input.callId],
            });
            await tx.execute({
                sql: `INSERT INTO call_events (id, call_id, kind, actor_user_id, payload_json)
                      VALUES (?, ?, 'ended', ?, ?)`,
                args: [
                    createId(),
                    input.callId,
                    input.actorUserId,
                    JSON.stringify({ reason: input.reason ?? "ended" }),
                ],
            });
            const updated = await this.getCallProjection(tx, input.actorUserId, input.callId);
            if (!updated) throw new Error("Ended call is not readable");
            return {
                call: updated,
                hint: {
                    ...chatHint(sequence, call.chatId, mutation.pts),
                    areas: ["calls"],
                },
            };
        });
    }

    async canSignalCall(input: {
        userId: string;
        callId: string;
        chatId: string;
        recipientUserId?: string;
    }): Promise<boolean> {
        const row = await one(
            this.client,
            `SELECT 1 AS found FROM calls c
              JOIN call_participants sender
                ON sender.call_id = c.id AND sender.user_id = ?
             WHERE c.id = ? AND c.chat_id = ? AND c.status IN ('ringing', 'active')
               AND sender.status IN ('ringing', 'joined')
               AND (? IS NULL OR EXISTS (
                 SELECT 1 FROM call_participants recipient
                  WHERE recipient.call_id = c.id AND recipient.user_id = ?
                    AND recipient.status IN ('ringing', 'joined')
               ))`,
            [
                input.userId,
                input.callId,
                input.chatId,
                input.recipientUserId ?? null,
                input.recipientUserId ?? null,
            ],
        );
        return Boolean(row);
    }

    async listDirectoryChannels(userId: string): Promise<ChatSummary[]> {
        const result = await this.client.execute({
            sql: `${CHAT_SELECT}
                  WHERE c.deleted_at IS NULL
                    AND c.kind IN ('public_channel', 'private_channel')
                    AND ((c.kind = 'public_channel' AND c.is_listed = 1)
                         OR cm.user_id IS NOT NULL)
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
            "f.deleted_at IS NULL",
            "f.upload_status = 'complete'",
            "f.scan_status != 'infected'",
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
                   WHERE e.deleted_at IS NULL AND f.deleted_at IS NULL
                     AND f.upload_status = 'complete' AND f.scan_status != 'infected'
                   ORDER BY e.name`,
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
            const file = await one(
                tx,
                `${FILE_SELECT}
                  WHERE id = ? AND deleted_at IS NULL AND upload_status = 'complete'
                    AND scan_status != 'infected'
                    AND (uploaded_by_user_id = ? OR is_public = 1)`,
                [input.fileId, input.actorUserId],
            );
            if (!file || !["photo", "gif"].includes(text(file.kind)))
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
                await tx.execute({
                    sql: `INSERT INTO custom_emoji_revisions
                            (id, custom_emoji_id, name, file_id, changed_by_user_id,
                             change_kind)
                          VALUES (?, ?, ?, ?, ?, 'created')`,
                    args: [createId(), id, input.name, input.fileId, input.actorUserId],
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
                `SELECT e.created_by_user_id, e.name, e.file_id, u.role AS actor_role
                   FROM custom_emojis e JOIN users u ON u.id = ?
                  WHERE e.id = ? AND e.deleted_at IS NULL`,
                [actorUserId, emojiId],
            );
            if (!emoji) throw new CollaborationError("not_found", "Emoji was not found");
            if (emoji.created_by_user_id !== actorUserId && emoji.actor_role !== "admin")
                throw new CollaborationError("forbidden", "Cannot delete this emoji");
            const sequence = await this.nextSequence(tx);
            const affected = await tx.execute({
                sql: `SELECT DISTINCT m.chat_id
                        FROM reactions r JOIN messages m ON m.id = r.message_id
                       WHERE r.custom_emoji_id = ? AND m.deleted_at IS NULL`,
                args: [emojiId],
            });
            const chats: Array<{ chatId: string; pts: string }> = [];
            for (const row of affected.rows) {
                const chatId = text(row.chat_id);
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    actorUserId,
                    chatId,
                    "reaction.emojiDeleted",
                    emojiId,
                );
                chats.push({ chatId, pts: String(mutation.pts) });
            }
            await tx.execute({
                sql: `DELETE FROM reactions WHERE custom_emoji_id = ?`,
                args: [emojiId],
            });
            await tx.execute({
                sql: `UPDATE custom_emojis
                         SET deleted_at = CURRENT_TIMESTAMP, sync_sequence = ? WHERE id = ?`,
                args: [sequence, emojiId],
            });
            await tx.execute({
                sql: `INSERT INTO custom_emoji_revisions
                        (id, custom_emoji_id, name, file_id, changed_by_user_id, change_kind)
                      VALUES (?, ?, ?, ?, ?, 'deleted')`,
                args: [createId(), emojiId, text(emoji.name), text(emoji.file_id), actorUserId],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "emoji.deleted",
                entityId: emojiId,
                actorUserId,
            });
            return {
                hint: { sequence: String(sequence), chats, areas: ["emoji"] },
            };
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
        return (await this.searchPage({ userId, query, limit })).results;
    }

    async searchPage(input: {
        userId: string;
        query: string;
        limit: number;
        cursor?: string;
    }): Promise<{
        results: Array<
            | { type: "message"; score: number; message: MessageSummary }
            | { type: "channel"; score: number; channel: ChatSummary }
            | { type: "user"; score: number; user: UserSummary }
        >;
        nextCursor?: string;
    }> {
        const normalized = normalizeSearch(input.query);
        const offset = decodeSearchCursor(input.cursor, normalized);
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
        const channels = await this.listDirectoryChannels(input.userId);
        for (const channel of channels) {
            const score = fuzzyScore(
                normalized,
                [channel.name, channel.slug, channel.topic].filter(Boolean).join(" "),
            );
            if (score > 0) candidates.push({ type: "channel", score, channel });
        }
        const grams = [...searchGrams(normalized).keys()];
        const rankedMessages: Array<{ messageId: string; score: number }> = [];
        if (grams.length > 0) {
            const placeholders = grams.map(() => "?").join(", ");
            const candidateLimit = offset + input.limit + candidates.length + 1;
            const messageRows = await this.client.execute({
                sql: `WITH matched AS (
                        SELECT g.message_id, count(*) AS matched_grams
                          FROM message_search_ngrams g
                         WHERE g.gram IN (${placeholders})
                         GROUP BY g.message_id
                      )
                      SELECT d.message_id, d.normalized_text,
                             CASE WHEN instr(d.normalized_text, ?) > 0 THEN 1.0
                                  ELSE CAST(matched.matched_grams AS REAL) /
                                       MAX(1, d.gram_count + ? - matched.matched_grams)
                              END AS candidate_score
                        FROM matched
                        JOIN message_search_documents d ON d.message_id = matched.message_id
                        JOIN messages m ON m.id = d.message_id
                        JOIN chats c ON c.id = d.chat_id
                   LEFT JOIN chat_members cm
                          ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                       WHERE m.deleted_at IS NULL
                         AND (m.expires_at IS NULL OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                         AND c.deleted_at IS NULL
                         AND (c.kind = 'public_channel' OR cm.user_id IS NOT NULL)
                       ORDER BY candidate_score DESC, d.message_created_at DESC, d.message_id DESC
                       LIMIT ?`,
                args: [...grams, normalized, grams.length, input.userId, candidateLimit],
            });
            for (const row of messageRows.rows) {
                const fuzzy = fuzzyScore(normalized, text(row.normalized_text));
                const ngram = Number(row.candidate_score);
                const score = Math.max(fuzzy, Number.isFinite(ngram) ? ngram * 0.85 : 0);
                if (score > 0) rankedMessages.push({ messageId: text(row.message_id), score });
            }
        }
        for (const { messageId, score } of rankedMessages) {
            const message = await this.getMessageProjection(this.client, input.userId, messageId);
            if (message) candidates.push({ type: "message", score, message });
        }
        const ranked = candidates.sort(
            (left, right) =>
                right.score - left.score || resultId(left).localeCompare(resultId(right)),
        );
        const results = ranked.slice(offset, offset + input.limit);
        return {
            results,
            nextCursor:
                ranked.length > offset + input.limit
                    ? encodeSearchCursor(normalized, offset + input.limit)
                    : undefined,
        };
    }

    async getServerProfile(): Promise<{
        name: string;
        title?: string;
        photoFileId?: string;
        defaultRetentionMode: "forever" | "duration";
        defaultRetentionSeconds?: number;
        updatedAt: string;
    }> {
        const row = await one(
            this.client,
            `SELECT name, title, photo_file_id, default_retention_mode,
                    default_retention_seconds, updated_at
               FROM server_settings WHERE id = 1`,
        );
        if (!row) throw new Error("Server settings are missing");
        return {
            name: text(row.name),
            title: optionalText(row.title),
            photoFileId: optionalText(row.photo_file_id),
            defaultRetentionMode: text(row.default_retention_mode) as "forever" | "duration",
            defaultRetentionSeconds:
                row.default_retention_seconds === null
                    ? undefined
                    : number(row.default_retention_seconds),
            updatedAt: text(row.updated_at),
        };
    }

    async listAdminUsers(actorUserId: string): Promise<
        Array<
            AdminUserSummary & {
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
            lastAccessAt: optionalText(row.last_access_at),
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
        defaultRetentionMode?: "forever" | "duration";
        defaultRetentionSeconds?: number | null;
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
            const current = await one(
                tx,
                `SELECT default_retention_mode, default_retention_seconds
                   FROM server_settings WHERE id = 1`,
            );
            if (!current) throw new Error("Server settings are missing");
            const retentionMode =
                input.defaultRetentionMode ?? text(current.default_retention_mode);
            const retentionSeconds =
                input.defaultRetentionSeconds === undefined
                    ? current.default_retention_seconds === null
                        ? undefined
                        : number(current.default_retention_seconds)
                    : (input.defaultRetentionSeconds ?? undefined);
            if (retentionMode === "duration" && !retentionSeconds)
                throw new CollaborationError(
                    "invalid",
                    "Duration retention requires defaultRetentionSeconds",
                );
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE server_settings
                         SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
                             title = CASE WHEN ? = 1 THEN ? ELSE title END,
                             photo_file_id = CASE WHEN ? = 1 THEN ? ELSE photo_file_id END,
                             default_retention_mode = CASE WHEN ? = 1
                                 THEN ? ELSE default_retention_mode END,
                             default_retention_seconds = CASE WHEN ? = 1
                                 THEN ? ELSE default_retention_seconds END,
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
                    input.defaultRetentionMode === undefined ? 0 : 1,
                    input.defaultRetentionMode ?? null,
                    input.defaultRetentionSeconds === undefined ? 0 : 1,
                    input.defaultRetentionSeconds ?? null,
                    sequence,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "server.updated",
                actorUserId: input.actorUserId,
            });
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "server.updated",
                targetType: "server",
                targetId: "1",
                after: {
                    name: input.name,
                    title: input.title,
                    photoFileId: input.photoFileId,
                    defaultRetentionMode: input.defaultRetentionMode,
                    defaultRetentionSeconds: input.defaultRetentionSeconds,
                },
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
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "user.administration_updated",
                targetType: "user",
                targetId: input.userId,
                after: { title: input.title, role: input.role },
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
            const target = await one(
                tx,
                `SELECT u.account_id, a.banned_at
                   FROM users u JOIN accounts a ON a.id = u.account_id
                  WHERE u.id = ?`,
                [input.userId],
            );
            if (!target) throw new CollaborationError("not_found", "User was not found");
            if ((target.banned_at !== null) === input.banned)
                throw new CollaborationError(
                    "conflict",
                    input.banned ? "User is already banned" : "User is not banned",
                );
            await tx.execute({
                sql: `UPDATE accounts
                         SET banned_at = ${input.banned ? "CURRENT_TIMESTAMP" : "NULL"},
                             ban_expires_at = NULL,
                             ban_reason = ${input.banned ? "'Administrative action'" : "NULL"},
                             banned_by_user_id = ${input.banned ? "?" : "NULL"}
                       WHERE id = (SELECT account_id FROM users WHERE id = ?)`,
                args: input.banned ? [input.actorUserId, input.userId] : [input.userId],
            });
            if (input.banned) {
                await tx.execute({
                    sql: `INSERT INTO account_bans
                            (id, account_id, banned_by_user_id, reason)
                          VALUES (?, ?, ?, 'Administrative action')`,
                    args: [createId(), text(target.account_id), input.actorUserId],
                });
                await tx.execute({
                    sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                           WHERE account_id = (SELECT account_id FROM users WHERE id = ?)
                             AND revoked_at IS NULL`,
                    args: [input.userId],
                });
            } else {
                await tx.execute({
                    sql: `UPDATE account_bans
                             SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP),
                                 revoked_by_user_id = COALESCE(revoked_by_user_id, ?),
                                 revoke_reason = COALESCE(revoke_reason, 'Administrative action')
                           WHERE account_id = ? AND revoked_at IS NULL`,
                    args: [input.actorUserId, text(target.account_id)],
                });
            }
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
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: input.banned ? "user.banned" : "user.unbanned",
                targetType: "user",
                targetId: input.userId,
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
                sql: `SELECT cm.chat_id, cm.role, c.kind
                        FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
                       WHERE cm.user_id = ? AND cm.left_at IS NULL AND c.deleted_at IS NULL`,
                args: [input.userId],
            });
            const chatPoints: Array<{ chatId: string; pts: string }> = [];
            for (const membership of memberships.rows) {
                const chatId = text(membership.chat_id);
                let eventKind = "member.deleted";
                if (membership.kind !== "dm" && membership.role === "owner") {
                    const remainingOwner = await one(
                        tx,
                        `SELECT user_id FROM chat_members
                          WHERE chat_id = ? AND user_id != ? AND left_at IS NULL
                            AND role = 'owner' LIMIT 1`,
                        [chatId, input.userId],
                    );
                    let replacementOwnerId = optionalText(remainingOwner?.user_id);
                    if (!replacementOwnerId) {
                        const successor = await one(
                            tx,
                            `SELECT cm.user_id
                               FROM chat_members cm
                               JOIN users u ON u.id = cm.user_id
                               JOIN accounts a ON a.id = u.account_id
                              WHERE cm.chat_id = ? AND cm.user_id != ? AND cm.left_at IS NULL
                                AND u.deleted_at IS NULL AND a.active = 1
                                AND a.banned_at IS NULL AND a.deleted_at IS NULL
                              ORDER BY CASE cm.role WHEN 'admin' THEN 0 ELSE 1 END,
                                       cm.joined_at, cm.user_id LIMIT 1`,
                            [chatId, input.userId],
                        );
                        if (successor) {
                            replacementOwnerId = text(successor.user_id);
                            await tx.execute({
                                sql: `UPDATE chat_members
                                         SET role = 'owner', sync_sequence = ?,
                                             updated_at = CURRENT_TIMESTAMP
                                       WHERE chat_id = ? AND user_id = ?`,
                                args: [sequence, chatId, text(successor.user_id)],
                            });
                            eventKind = "member.deletedAndOwnershipTransferred";
                        } else {
                            eventKind = "chat.deletedWithLastMember";
                        }
                    }
                    if (replacementOwnerId)
                        await tx.execute({
                            sql: `UPDATE chats SET owner_user_id = ?
                                   WHERE id = ? AND owner_user_id = ?`,
                            args: [replacementOwnerId, chatId, input.userId],
                        });
                }
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    eventKind,
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
                if (eventKind === "chat.deletedWithLastMember")
                    await tx.execute({
                        sql: `UPDATE chats SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [chatId],
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
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "user.deleted",
                targetType: "user",
                targetId: input.userId,
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
        botId?: string;
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
            senderBotId: input.botId,
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

    private async getCallProjection(
        executor: Executor,
        viewerUserId: string,
        callId: string,
    ): Promise<CallSummary | undefined> {
        const row = await one(
            executor,
            `SELECT id, chat_id, created_by_user_id, kind, status, started_at, ended_at,
                    end_reason, created_at, updated_at
               FROM calls WHERE id = ?`,
            [callId],
        );
        if (!row) return undefined;
        if (!(await this.chatAccess(executor, viewerUserId, text(row.chat_id), false)))
            return undefined;
        const visibleParticipant = await one(
            executor,
            `SELECT 1 AS found FROM call_participants WHERE call_id = ? AND user_id = ?`,
            [callId, viewerUserId],
        );
        if (!visibleParticipant) return undefined;
        const participants = await executor.execute({
            sql: `SELECT user_id, status, joined_at, left_at
                    FROM call_participants WHERE call_id = ? ORDER BY invited_at, user_id`,
            args: [callId],
        });
        return {
            id: text(row.id),
            chatId: text(row.chat_id),
            createdByUserId: optionalText(row.created_by_user_id),
            kind: text(row.kind) as CallSummary["kind"],
            status: text(row.status) as CallSummary["status"],
            participants: participants.rows.map((participant) => ({
                userId: text(participant.user_id),
                status: text(participant.status) as CallSummary["participants"][number]["status"],
                joinedAt: optionalText(participant.joined_at),
                leftAt: optionalText(participant.left_at),
            })),
            startedAt: optionalText(row.started_at),
            endedAt: optionalText(row.ended_at),
            endReason: optionalText(row.end_reason),
            createdAt: text(row.created_at),
            updatedAt: text(row.updated_at),
        };
    }

    private async listPresenceSettingsWith(
        executor: Executor,
        userIds: string[],
    ): Promise<PresenceSettingsSummary[]> {
        if (userIds.length === 0) return [];
        const result = await executor.execute({
            sql: `SELECT user_id, availability, custom_status_text, custom_status_emoji,
                         status_expires_at, dnd_until, updated_at
                    FROM user_presence_settings
                   WHERE user_id IN (${userIds.map(() => "?").join(", ")})`,
            args: userIds,
        });
        return result.rows.map((row) => {
            const statusActive =
                !optionalText(row.status_expires_at) ||
                !isPast(optionalText(row.status_expires_at));
            const dndActive =
                optionalText(row.dnd_until) !== undefined && !isPast(optionalText(row.dnd_until));
            return {
                userId: text(row.user_id),
                availability: dndActive
                    ? "dnd"
                    : (text(row.availability) as PresenceSettingsSummary["availability"]),
                customStatusText: statusActive ? optionalText(row.custom_status_text) : undefined,
                customStatusEmoji: statusActive ? optionalText(row.custom_status_emoji) : undefined,
                statusExpiresAt: statusActive ? optionalText(row.status_expires_at) : undefined,
                dndUntil: dndActive ? optionalText(row.dnd_until) : undefined,
                updatedAt: text(row.updated_at),
            };
        });
    }

    private async requireChatManager(
        executor: Executor,
        userId: string,
        chatId: string,
    ): Promise<ChatAccess> {
        let access = await this.chatAccess(executor, userId, chatId, true);
        if (!access) {
            const admin = await one(
                executor,
                `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
                  WHERE u.id = ? AND u.role = 'admin' AND u.deleted_at IS NULL
                    AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
                [userId],
            );
            if (admin) {
                const row = await one(
                    executor,
                    `${CHAT_SELECT} WHERE c.id = ? AND c.deleted_at IS NULL`,
                    [userId, userId, chatId],
                );
                if (row) access = { ...asChat(row), isServerAdmin: true };
            }
        }
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

    private async isPostingRestricted(
        executor: Executor,
        userId: string,
        chatId: string,
    ): Promise<boolean> {
        return Boolean(
            await one(
                executor,
                `SELECT 1 AS found FROM moderation_actions
                  WHERE action = 'restrict' AND target_user_id = ? AND revoked_at IS NULL
                    AND (chat_id IS NULL OR chat_id = ?)
                    AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
                  LIMIT 1`,
                [userId, chatId],
            ),
        );
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

    private async appendAudit(
        tx: Transaction,
        input: {
            actorUserId: string;
            action: string;
            targetType: string;
            targetId?: string;
            chatId?: string;
            after?: Record<string, unknown>;
        },
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO audit_log_entries
                    (id, actor_user_id, action, target_type, target_id, chat_id, after_json)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                createId(),
                input.actorUserId,
                input.action,
                input.targetType,
                input.targetId ?? null,
                input.chatId ?? null,
                input.after ? JSON.stringify(input.after) : null,
            ],
        });
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
        });
        if (input.targetUserId)
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

    private async recomputeThreadProjection(
        tx: Transaction,
        threadRootMessageId: string,
        pts: number,
    ): Promise<void> {
        await tx.execute({
            sql: `DELETE FROM thread_participants WHERE thread_root_message_id = ?`,
            args: [threadRootMessageId],
        });
        await tx.execute({
            sql: `INSERT INTO thread_participants
                    (thread_root_message_id, user_id, reply_count, first_participated_at,
                     last_participated_at)
                  SELECT ?, sender_user_id, count(*), MIN(created_at), MAX(created_at)
                    FROM messages
                   WHERE thread_root_message_id = ? AND sender_user_id IS NOT NULL
                     AND deleted_at IS NULL
                     AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
                   GROUP BY sender_user_id`,
            args: [threadRootMessageId, threadRootMessageId],
        });
        const lastReply = await one(
            tx,
            `SELECT id, sequence FROM messages
              WHERE thread_root_message_id = ? AND deleted_at IS NULL
                AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)
              ORDER BY sequence DESC LIMIT 1`,
            [threadRootMessageId],
        );
        const replyCount = await one(
            tx,
            `SELECT count(*) AS count FROM messages
              WHERE thread_root_message_id = ? AND deleted_at IS NULL
                AND (expires_at IS NULL OR datetime(expires_at) > CURRENT_TIMESTAMP)`,
            [threadRootMessageId],
        );
        await tx.execute({
            sql: `UPDATE threads
                     SET reply_count = ?, participant_count = (
                           SELECT count(*) FROM thread_participants
                            WHERE thread_root_message_id = ?
                         ),
                         last_reply_message_id = ?, last_reply_sequence = ?, last_pts = ?,
                         updated_at = CURRENT_TIMESTAMP
                   WHERE root_message_id = ?`,
            args: [
                number(replyCount?.count, 0),
                threadRootMessageId,
                lastReply ? text(lastReply.id) : null,
                lastReply ? number(lastReply.sequence) : 0,
                pts,
                threadRootMessageId,
            ],
        });
        await tx.execute({
            sql: `UPDATE thread_user_states
                     SET unread_count = (
                           SELECT count(*) FROM messages m
                            WHERE m.thread_root_message_id = ? AND m.deleted_at IS NULL
                              AND (m.expires_at IS NULL
                                   OR datetime(m.expires_at) > CURRENT_TIMESTAMP)
                              AND m.sequence > thread_user_states.last_read_sequence
                              AND (m.sender_user_id IS NULL
                                   OR m.sender_user_id != thread_user_states.user_id)
                         ),
                         mention_count = (
                           SELECT count(*) FROM message_mentions mm
                           JOIN messages m ON m.id = mm.message_id
                            WHERE m.thread_root_message_id = ? AND m.deleted_at IS NULL
                              AND m.sequence > thread_user_states.last_read_sequence
                              AND mm.mentioned_user_id = thread_user_states.user_id
                         ),
                         updated_at = CURRENT_TIMESTAMP
                   WHERE thread_root_message_id = ?`,
            args: [threadRootMessageId, threadRootMessageId, threadRootMessageId],
        });
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
                  WHERE f.id = ? AND f.deleted_at IS NULL
                    AND f.upload_status = 'complete' AND f.scan_status != 'infected' AND (
                    f.is_public = 1 OR f.uploaded_by_user_id = ?
                    OR EXISTS (
                      SELECT 1 FROM custom_emojis e
                       WHERE e.file_id = f.id AND e.deleted_at IS NULL
                    )
                    OR EXISTS (
                      SELECT 1 FROM server_settings s WHERE s.photo_file_id = f.id
                    )
                    OR EXISTS (
                      SELECT 1 FROM file_access_grants g
                       WHERE g.file_id = f.id
                         AND (g.expires_at IS NULL
                              OR datetime(g.expires_at) > CURRENT_TIMESTAMP)
                         AND (
                           (g.principal_type = 'user' AND g.principal_id = ?)
                           OR g.principal_type IN ('server', 'custom_emoji')
                           OR (g.principal_type = 'chat' AND EXISTS (
                             SELECT 1 FROM chats grant_chat
                        LEFT JOIN chat_members grant_member
                               ON grant_member.chat_id = grant_chat.id
                              AND grant_member.user_id = ?
                              AND grant_member.left_at IS NULL
                              WHERE grant_chat.id = g.principal_id
                                AND grant_chat.deleted_at IS NULL
                                AND (grant_chat.kind = 'public_channel'
                                     OR grant_member.user_id IS NOT NULL)
                           ))
                         )
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
                [fileId, userId, userId, userId, userId],
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
                    m.expiry_mode, m.self_destruct_seconds, m.first_read_at,
                    m.revision, m.deleted_at, m.created_at,
                    su.id AS sender_id, su.username AS sender_username,
                    su.first_name AS sender_first_name, su.last_name AS sender_last_name,
                    su.title AS sender_title, su.photo_file_id AS sender_photo_file_id,
                    su.role AS sender_role,
                    b.id AS sender_bot_id, b.name AS sender_bot_name,
                    b.username AS sender_bot_username,
                    b.photo_file_id AS sender_bot_photo_file_id,
                    qm.sender_user_id AS quoted_sender_user_id,
                    qm.text AS quoted_text, qm.deleted_at AS quoted_deleted_at,
                    qm.expires_at AS quoted_expires_at,
                    fm.chat_id AS forwarded_from_chat_id,
                    COALESCE(t.reply_count, 0) AS thread_reply_count
               FROM messages m
          LEFT JOIN users su ON su.id = m.sender_user_id
          LEFT JOIN bot_identities b ON b.id = m.sender_bot_id
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
                       WHERE deleted_at IS NULL AND upload_status = 'complete'
                         AND scan_status != 'infected' AND id IN (
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
        const mentionRows = deleted
            ? ({ rows: [] } as unknown as ResultSet)
            : await executor.execute({
                  sql: `SELECT kind, mentioned_user_id, start_offset, length, raw_text
                          FROM message_mentions WHERE message_id = ? ORDER BY start_offset`,
                  args: [messageId],
              });
        const receiptRows = await executor.execute({
            sql: `SELECT user_id, delivered_at, read_at
                    FROM message_receipts WHERE message_id = ?
                   ORDER BY user_id`,
            args: [messageId],
        });
        const sender = row.sender_id
            ? asUser({
                  id: row.sender_id,
                  username: row.sender_username,
                  first_name: row.sender_first_name,
                  last_name: row.sender_last_name,
                  title: row.sender_title,
                  photo_file_id: row.sender_photo_file_id,
                  role: row.sender_role,
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
            senderBot: row.sender_bot_id
                ? {
                      id: text(row.sender_bot_id),
                      name: text(row.sender_bot_name),
                      username: text(row.sender_bot_username),
                      photoFileId: optionalText(row.sender_bot_photo_file_id),
                  }
                : undefined,
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
            revision: number(row.revision, 1),
            mentions: mentionRows.rows.map((mention) => ({
                kind: text(mention.kind) as MessageSummary["mentions"][number]["kind"],
                userId: optionalText(mention.mentioned_user_id),
                offset: number(mention.start_offset),
                length: number(mention.length),
                rawText: text(mention.raw_text),
            })),
            forwardedFrom,
            attachments,
            reactions: [...reactionMap.values()],
            receipts: receiptRows.rows.map((receipt) => ({
                userId: text(receipt.user_id),
                deliveredAt: optionalText(receipt.delivered_at),
                readAt: optionalText(receipt.read_at),
            })),
            expiresAt: optionalText(row.expires_at),
            expiryMode: text(row.expiry_mode, "none") as MessageSummary["expiryMode"],
            selfDestructSeconds: number(row.self_destruct_seconds, 0) || undefined,
            firstReadAt: optionalText(row.first_read_at),
            editedAt: optionalText(row.edited_at),
            deletedAt: deleted
                ? (optionalText(row.deleted_at) ?? optionalText(row.expires_at))
                : undefined,
            createdAt: text(row.created_at),
        };
    }

    private async replaceMessageMentions(
        tx: Transaction,
        messageId: string,
        messageText: string,
    ): Promise<{ userIds: string[]; notifyAll: boolean }> {
        await tx.execute({
            sql: `DELETE FROM message_mentions WHERE message_id = ?`,
            args: [messageId],
        });
        const mentionedUsers = new Set<string>();
        let notifyAll = false;
        const seenRanges = new Set<string>();
        for (const match of messageText.matchAll(
            /(^|[^\p{L}\p{N}_])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63})/gu,
        )) {
            const rawText = `@${match[2]}`;
            const startOffset = (match.index ?? 0) + match[1].length;
            const range = `${startOffset}:${rawText.length}`;
            if (seenRanges.has(range)) continue;
            seenRanges.add(range);
            const special = match[2].toLowerCase();
            if (special === "channel" || special === "here" || special === "everyone") {
                await tx.execute({
                    sql: `INSERT INTO message_mentions
                            (id, message_id, kind, start_offset, length, raw_text)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [createId(), messageId, special, startOffset, rawText.length, rawText],
                });
                notifyAll = true;
                continue;
            }
            const user = await one(
                tx,
                `SELECT u.id FROM users u JOIN accounts a ON a.id = u.account_id
                  WHERE lower(u.username) = lower(?) AND u.deleted_at IS NULL
                    AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
                [match[2]],
            );
            if (!user) continue;
            const userId = text(user.id);
            await tx.execute({
                sql: `INSERT INTO message_mentions
                        (id, message_id, kind, mentioned_user_id, start_offset, length, raw_text)
                      VALUES (?, ?, 'user', ?, ?, ?, ?)`,
                args: [createId(), messageId, userId, startOffset, rawText.length, rawText],
            });
            mentionedUsers.add(userId);
        }
        return { userIds: [...mentionedUsers], notifyAll };
    }

    private async indexMessageForSearch(
        tx: Transaction,
        messageId: string,
        chatId: string,
        messageText: string,
        revision: number,
    ): Promise<void> {
        await tx.execute({
            sql: `DELETE FROM message_search_documents WHERE message_id = ?`,
            args: [messageId],
        });
        const normalized = normalizeSearch(messageText);
        if (!normalized) return;
        const grams = searchGrams(normalized);
        const created = await one(tx, `SELECT created_at FROM messages WHERE id = ?`, [messageId]);
        if (!created) throw new Error("Search source message is missing");
        await tx.execute({
            sql: `INSERT INTO message_search_documents
                    (message_id, chat_id, normalized_text, normalized_length, gram_count,
                     indexed_revision, message_created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                messageId,
                chatId,
                normalized,
                normalized.length,
                grams.size,
                revision,
                text(created.created_at),
            ],
        });
        for (const [gram, occurrences] of grams)
            await tx.execute({
                sql: `INSERT INTO message_search_ngrams (gram, message_id, occurrences)
                      VALUES (?, ?, ?)`,
                args: [gram, messageId, occurrences],
            });
    }

    private async recordMessageDelivery(
        tx: Transaction,
        input: {
            actorUserId: string;
            chat: ChatSummary;
            messageId: string;
            messageSequence: number;
            threadRootMessageId?: string;
            mentionedUserIds: string[];
            mentionAll?: boolean;
            syncSequence: number;
        },
    ): Promise<void> {
        const mentioned = new Set(input.mentionedUserIds);
        const recipients = await tx.execute({
            sql: `SELECT cm.user_id, COALESCE(p.notification_level, 'all') AS notification_level,
                         p.muted_until,
                         COALESCE(p.notify_thread_replies, 1) AS notify_thread_replies,
                         COALESCE(unp.direct_messages, 'all') AS direct_messages,
                         COALESCE(unp.mentions, 'all') AS mention_notifications,
                         COALESCE(unp.thread_replies, 'all') AS thread_replies
                    FROM chat_members cm
               LEFT JOIN user_chat_preferences p
                      ON p.chat_id = cm.chat_id AND p.user_id = cm.user_id
               LEFT JOIN user_notification_preferences unp ON unp.user_id = cm.user_id
                   WHERE cm.chat_id = ? AND cm.left_at IS NULL AND cm.user_id != ?`,
            args: [input.chat.id, input.actorUserId],
        });
        let rootSenderUserId: string | undefined;
        if (input.threadRootMessageId) {
            rootSenderUserId = optionalText(
                (
                    await one(tx, `SELECT sender_user_id FROM messages WHERE id = ?`, [
                        input.threadRootMessageId,
                    ])
                )?.sender_user_id,
            );
            for (const userId of new Set(
                [input.actorUserId, rootSenderUserId].filter(Boolean) as string[],
            ))
                await tx.execute({
                    sql: `INSERT INTO thread_user_states
                            (thread_root_message_id, user_id, subscribed, last_read_message_id,
                             last_read_sequence, last_participated_at)
                          VALUES (?, ?, 1, ?, ?, CURRENT_TIMESTAMP)
                          ON CONFLICT(thread_root_message_id, user_id) DO UPDATE SET
                            subscribed = 1,
                            last_read_message_id = CASE WHEN excluded.user_id = ?
                                THEN excluded.last_read_message_id ELSE last_read_message_id END,
                            last_read_sequence = CASE WHEN excluded.user_id = ?
                                THEN excluded.last_read_sequence ELSE last_read_sequence END,
                            last_participated_at = CASE WHEN excluded.user_id = ?
                                THEN CURRENT_TIMESTAMP ELSE last_participated_at END,
                            updated_at = CURRENT_TIMESTAMP`,
                    args: [
                        input.threadRootMessageId,
                        userId,
                        input.messageId,
                        input.messageSequence,
                        input.actorUserId,
                        input.actorUserId,
                        input.actorUserId,
                    ],
                });
        }
        for (const recipient of recipients.rows) {
            const userId = text(recipient.user_id);
            const isMentioned = input.mentionAll === true || mentioned.has(userId);
            await tx.execute({
                sql: `UPDATE chat_members
                         SET unread_count = unread_count + 1,
                             mention_count = mention_count + ?,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                args: [isMentioned ? 1 : 0, input.chat.id, userId],
            });
            await tx.execute({
                sql: `INSERT INTO message_receipts (message_id, user_id, delivered_at)
                      VALUES (?, ?, CURRENT_TIMESTAMP)
                      ON CONFLICT(message_id, user_id) DO UPDATE SET
                        delivered_at = COALESCE(message_receipts.delivered_at, CURRENT_TIMESTAMP),
                        updated_at = CURRENT_TIMESTAMP`,
                args: [input.messageId, userId],
            });

            let threadSubscribed = false;
            let threadNotificationLevel: NotificationLevel = "all";
            if (input.threadRootMessageId) {
                const state = await one(
                    tx,
                    `SELECT subscribed, notification_level FROM thread_user_states
                      WHERE thread_root_message_id = ? AND user_id = ?`,
                    [input.threadRootMessageId, userId],
                );
                threadSubscribed =
                    number(state?.subscribed, 0) === 1 || userId === rootSenderUserId;
                threadNotificationLevel = text(
                    state?.notification_level,
                    "all",
                ) as NotificationLevel;
                if (threadSubscribed || isMentioned)
                    await tx.execute({
                        sql: `INSERT INTO thread_user_states
                                (thread_root_message_id, user_id, subscribed, unread_count,
                                 mention_count)
                              VALUES (?, ?, ?, 1, ?)
                              ON CONFLICT(thread_root_message_id, user_id) DO UPDATE SET
                                unread_count = unread_count + 1,
                                mention_count = mention_count + excluded.mention_count,
                                updated_at = CURRENT_TIMESTAMP`,
                        args: [
                            input.threadRootMessageId,
                            userId,
                            threadSubscribed || isMentioned ? 1 : 0,
                            isMentioned ? 1 : 0,
                        ],
                    });
            }

            const muted =
                optionalText(recipient.muted_until) !== undefined &&
                !isPast(optionalText(recipient.muted_until));
            const level = text(recipient.notification_level, "all");
            const kind = isMentioned
                ? "mention"
                : input.threadRootMessageId && threadSubscribed
                  ? "thread_reply"
                  : input.chat.kind === "dm"
                    ? "direct_message"
                    : undefined;
            const globallyAllowed =
                kind === "mention"
                    ? recipient.mention_notifications !== "none"
                    : kind === "thread_reply"
                      ? number(recipient.notify_thread_replies, 1) === 1 &&
                        recipient.thread_replies !== "none" &&
                        (recipient.thread_replies !== "mentions" || isMentioned) &&
                        threadNotificationLevel !== "none" &&
                        (threadNotificationLevel !== "mentions" || isMentioned)
                      : kind === "direct_message"
                        ? recipient.direct_messages !== "none"
                        : true;
            if (
                !kind ||
                !globallyAllowed ||
                muted ||
                level === "none" ||
                (level === "mentions" && !isMentioned)
            )
                continue;
            const notificationId = createId();
            await tx.execute({
                sql: `INSERT INTO notifications
                        (id, user_id, kind, chat_id, message_id, thread_root_message_id,
                         actor_user_id, sync_sequence)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    notificationId,
                    userId,
                    kind,
                    input.chat.id,
                    input.messageId,
                    input.threadRootMessageId ?? null,
                    input.actorUserId,
                    input.syncSequence,
                ],
            });
            await this.insertSyncEvent(tx, {
                sequence: input.syncSequence,
                kind: "notification.created",
                entityId: notificationId,
                actorUserId: input.actorUserId,
                targetUserId: userId,
            });
        }
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
        await executor.execute({
            sql: `UPDATE client_mutations SET last_accessed_at = CURRENT_TIMESTAMP
                   WHERE actor_user_id = ? AND scope = ? AND client_mutation_id = ?`,
            args: [actorUserId, scope, clientMutationId],
        });
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
                    (actor_user_id, scope, client_mutation_id, result_json, expires_at,
                     last_accessed_at)
                  VALUES (?, ?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' ||
                    COALESCE((SELECT idempotency_retention_seconds FROM server_settings WHERE id = 1),
                             604800) || ' seconds'), CURRENT_TIMESTAMP)`,
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
        dmType: optionalText(row.dm_type) as ChatSummary["dmType"],
        ownerUserId: optionalText(row.owner_user_id),
        photoFileId: optionalText(row.photo_file_id),
        isListed: number(row.is_listed, 1) === 1,
        archivedAt: optionalText(row.archived_at),
        retentionMode: text(row.retention_mode, "forever") as ChatSummary["retentionMode"],
        retentionSeconds: number(row.retention_seconds, 0) || undefined,
        defaultExpiryMode: text(
            row.default_expiry_mode,
            "none",
        ) as ChatSummary["defaultExpiryMode"],
        defaultSelfDestructSeconds: number(row.default_self_destruct_seconds, 0) || undefined,
        defaultAfterReadScope: text(
            row.default_after_read_scope,
            "any_reader",
        ) as ChatSummary["defaultAfterReadScope"],
        lifecycleVersion: text(row.lifecycle_version, "1"),
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
        lastReadSequence: text(row.last_read_sequence, "0"),
        unreadCount: number(row.unread_count, 0),
        mentionCount: number(row.mention_count, 0),
        notificationLevel: text(row.notification_level, "all") as ChatSummary["notificationLevel"],
        mutedUntil: optionalText(row.muted_until),
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

function asNotification(row: Row): NotificationSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as NotificationSummary["kind"],
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        threadRootMessageId: optionalText(row.thread_root_message_id),
        actorUserId: optionalText(row.actor_user_id),
        readAt: optionalText(row.read_at),
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

function earliestDate(left: string | null, right: string | null): string | null {
    if (!left) return right;
    if (!right) return left;
    return Date.parse(left) <= Date.parse(right) ? left : right;
}

function normalizeSearch(value: string): string {
    return value.normalize("NFKC").trim().toLocaleLowerCase();
}

function searchGrams(value: string): Map<string, number> {
    const points = [...value];
    const width = Math.min(3, points.length);
    const grams = new Map<string, number>();
    for (let index = 0; index <= points.length - width; index += 1) {
        const gram = points.slice(index, index + width).join("");
        grams.set(gram, (grams.get(gram) ?? 0) + 1);
    }
    return grams;
}

function encodeSearchCursor(query: string, offset: number): string {
    return Buffer.from(JSON.stringify({ query, offset }), "utf8").toString("base64url");
}

function decodeSearchCursor(cursor: string | undefined, query: string): number {
    if (!cursor) return 0;
    if (cursor.length > 1_024) throw new CollaborationError("invalid", "Search cursor is invalid");
    try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
            query?: unknown;
            offset?: unknown;
        };
        if (
            decoded.query !== query ||
            !Number.isSafeInteger(decoded.offset) ||
            (decoded.offset as number) < 0
        )
            throw new Error("cursor mismatch");
        return decoded.offset as number;
    } catch {
        throw new CollaborationError("invalid", "Search cursor is invalid");
    }
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
