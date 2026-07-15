import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client } from "@libsql/client";
import {
    and,
    asc,
    desc,
    eq,
    gt,
    inArray,
    isNull,
    lt,
    lte,
    ne,
    or,
    sql,
    type SQL,
} from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import type { FileKind } from "../database.js";
import {
    createDatabase,
    retrySqliteBusy,
    type DrizzleExecutor,
    type DrizzleTransaction,
} from "../drizzle.js";
import {
    accountBans,
    accounts,
    agentImages,
    agentImageSettings,
    agentRigBindings,
    agentTurns,
    auditLogEntries,
    authSessions,
    botIdentities,
    callEvents,
    callParticipants,
    calls,
    chatBookmarks,
    chatMembers,
    chatPins,
    chatSyncCompactions,
    chatUpdates,
    chats,
    clientMutations,
    customEmojiRevisions,
    customEmojis,
    files,
    idempotencyKeys,
    messageAttachments,
    messageForwardMetadata,
    messageMentions,
    messageReceipts,
    messageRevisions,
    messageSearchDocuments,
    messageSearchNgrams,
    messages,
    moderationActions,
    notifications,
    reactions,
    rigEventSyncState,
    serverSettings,
    serverSyncState,
    syncCompactions,
    syncConsumers,
    syncEvents,
    threadParticipants,
    threadUserStates,
    threads,
    userChatPreferences,
    userNotificationPreferences,
    userPresenceSettings,
    users,
} from "../schema.js";
import {
    CollaborationError,
    type ChatKind,
    type ChatBookmarkSummary,
    type ChatPinSummary,
    type ChatRole,
    type ChatSummary,
    type CallSummary,
    type AdminUserSummary,
    type AgentImageDetails,
    type AgentImageSummary,
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

type ChatAccess = ChatSummary & { isServerAdmin: boolean };

interface SendMessageRepositoryInput {
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
    agentSessionId?: string;
    agentTurn?: { agentUserId: string; sessionId: string };
}

interface SendMessageDbInput extends SendMessageRepositoryInput {
    deferPublication?: boolean;
}

export interface RigEventCheckpoint {
    cursor?: number;
    eventsSinceTrim: number;
    lastTrimmedAt: string;
    trimmedThrough?: number;
}

export interface AgentChatContext {
    agentUserId: string;
    chatId: string;
    image: AgentExecutionImage;
    privateUserId: string;
    binding?: { containerName: string; cwd: string; sessionId: string };
}

export interface AgentExecutionImage {
    id: string;
    dockerImageId: string;
    dockerTag: string;
}

export interface AgentImageBuild {
    buildContext?: string;
    dockerfile: string;
    id: string;
    dockerTag: string;
}

const MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS = 2_000_000;

interface ChatMutation {
    sequence: number;
    pts: number;
    chatId: string;
}

const chatSelection = {
    id: chats.id,
    kind: chats.kind,
    name: chats.name,
    slug: chats.slug,
    topic: chats.topic,
    created_by_user_id: chats.createdByUserId,
    dm_type: chats.dmType,
    owner_user_id: chats.ownerUserId,
    photo_file_id: chats.photoFileId,
    is_listed: chats.isListed,
    archived_at: chats.archivedAt,
    retention_mode: chats.retentionMode,
    retention_seconds: chats.retentionSeconds,
    default_expiry_mode: chats.defaultExpiryMode,
    default_self_destruct_seconds: chats.defaultSelfDestructSeconds,
    default_after_read_scope: chats.defaultAfterReadScope,
    lifecycle_version: chats.lifecycleVersion,
    pts: chats.pts,
    last_message_sequence: chats.lastMessageSequence,
    created_at: chats.createdAt,
    updated_at: chats.updatedAt,
    membership_role: chatMembers.role,
    membership_epoch: chatMembers.membershipEpoch,
    last_read_sequence: sql<number>`coalesce(${chatMembers.lastReadSequence}, 0)`,
    unread_count: sql<number>`coalesce(${chatMembers.unreadCount}, 0)`,
    mention_count: sql<number>`coalesce(${chatMembers.mentionCount}, 0)`,
    starred: sql<number>`coalesce(${userChatPreferences.starred}, 0)`,
    sort_order: userChatPreferences.sortOrder,
    notification_level: sql<string>`coalesce(${userChatPreferences.notificationLevel}, 'all')`,
    muted_until: userChatPreferences.mutedUntil,
};

const userSelection = {
    id: users.id,
    username: users.username,
    first_name: users.firstName,
    last_name: users.lastName,
    title: users.title,
    photo_file_id: users.photoFileId,
    role: users.role,
    user_kind: users.kind,
    agent_image_id: users.agentImageId,
    created_by_user_id: users.createdByUserId,
};

const agentImageSelection = {
    id: agentImages.id,
    name: agentImages.name,
    definition_hash: agentImages.definitionHash,
    docker_tag: agentImages.dockerTag,
    builtin_key: agentImages.builtinKey,
    status: agentImages.status,
    build_attempt: agentImages.buildAttempt,
    build_progress: agentImages.buildProgress,
    last_build_log_line: agentImages.lastBuildLogLine,
    build_log_updated_at: agentImages.buildLogUpdatedAt,
    docker_image_id: agentImages.dockerImageId,
    last_error: agentImages.lastError,
    build_requested_at: agentImages.buildRequestedAt,
    build_started_at: agentImages.buildStartedAt,
    ready_at: agentImages.readyAt,
    created_by_user_id: agentImages.createdByUserId,
    created_at: agentImages.createdAt,
    updated_at: agentImages.updatedAt,
};

const agentImageDetailsSelection = {
    ...agentImageSelection,
    dockerfile: agentImages.dockerfile,
    build_log: agentImages.buildLog,
    build_log_truncated: agentImages.buildLogTruncated,
};

const fileSelection = {
    id: files.id,
    kind: files.kind,
    original_name: files.originalName,
    content_type: files.contentType,
    size: files.size,
    width: files.width,
    height: files.height,
    duration_ms: files.durationMs,
    thumbhash: files.thumbhash,
    uploaded_by_user_id: files.uploadedByUserId,
    created_at: files.createdAt,
};

const agentTurnWorkSelection = {
    agentUserId: agentTurns.agentUserId,
    actorUserId: messages.senderUserId,
    baselineMessageCount: agentTurns.baselineMessageCount,
    chatId: agentTurns.chatId,
    lastSessionEventId: agentTurns.lastSessionEventId,
    runId: agentTurns.runId,
    sessionId: agentTurns.sessionId,
    leaseExpiresAt: agentTurns.leaseExpiresAt,
    workerId: agentTurns.workerId,
    text: messages.text,
    streamCommittedText: agentTurns.streamCommittedText,
    userMessageId: agentTurns.userMessageId,
};

export class CollaborationRepository {
    private readonly client: Client;
    private readonly db;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
        this.db = createDatabase(this.client);
    }

    async initialize(): Promise<void> {
        await this.db
            .insert(serverSyncState)
            .values({ id: 1, generation: createId(), sequence: 0 })
            .onConflictDoNothing();
        await this.db.insert(rigEventSyncState).values({ id: 1 }).onConflictDoNothing();
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    /** Package-internal shared connection for transactional backend extensions. */
    extensionClient(): Client {
        return this.client;
    }

    async getState(): Promise<SyncState> {
        const [state] = await this.db
            .select({ generation: serverSyncState.generation, sequence: serverSyncState.sequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        if (!state) throw new Error("Sync state has not been initialized");
        return syncState(state);
    }

    async acknowledgeSyncConsumer(input: {
        userId: string;
        deviceId: string;
        generation: string;
        sequence: number;
    }): Promise<void> {
        await this.requireActiveUserDb(this.db, input.userId);
        const [state] = await this.db
            .select({
                generation: serverSyncState.generation,
                sequence: serverSyncState.sequence,
                min_recoverable_sequence: serverSyncState.minRecoverableSequence,
            })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        if (!state) throw new Error("Sync state has not been initialized");
        if (input.generation !== state.generation)
            throw new CollaborationError("generation_mismatch", "Sync generation has changed");
        if (input.sequence > number(state.sequence))
            throw new CollaborationError("future_state", "Sync cursor is ahead of the server");
        if (input.sequence < number(state.min_recoverable_sequence, 0))
            throw new CollaborationError("conflict", "Sync cursor is no longer recoverable");
        await this.db
            .insert(syncConsumers)
            .values({
                id: createId(),
                userId: input.userId,
                deviceId: input.deviceId,
                generation: input.generation,
                sequence: input.sequence,
            })
            .onConflictDoUpdate({
                target: [syncConsumers.userId, syncConsumers.deviceId],
                set: {
                    generation: input.generation,
                    sequence: sql`max(${syncConsumers.sequence}, excluded.sequence)`,
                    lastSeenAt: sql`CURRENT_TIMESTAMP`,
                    revokedAt: null,
                },
            });
    }

    async compactSync(): Promise<{
        minRecoverableSequence: string;
        eventsDeleted: number;
        mutationsDeleted: number;
        chatUpdatesDeleted: number;
    }> {
        return this.writeDb(async (tx) => {
            const [state] = await tx
                .select({
                    generation: serverSyncState.generation,
                    sequence: serverSyncState.sequence,
                    minRecoverableSequence: serverSyncState.minRecoverableSequence,
                })
                .from(serverSyncState)
                .where(eq(serverSyncState.id, 1));
            const [settings] = await tx
                .select({
                    syncEventRetentionSeconds: serverSettings.syncEventRetentionSeconds,
                    chatUpdateRetentionSeconds: serverSettings.chatUpdateRetentionSeconds,
                    idempotencyRetentionSeconds: serverSettings.idempotencyRetentionSeconds,
                })
                .from(serverSettings)
                .where(eq(serverSettings.id, 1));
            if (!state || !settings) throw new Error("Sync retention settings are missing");
            const retentionSeconds = settings.syncEventRetentionSeconds;
            const [candidate] = await tx
                .select({ sequence: sql<number>`coalesce(max(${syncEvents.sequence}), 0)` })
                .from(syncEvents)
                .where(
                    sql`datetime(${syncEvents.createdAt}) < datetime('now', '-' || ${retentionSeconds} || ' seconds')`,
                );
            const [activeFloor] = await tx
                .select({ sequence: sql<number | null>`min(${syncConsumers.sequence})` })
                .from(syncConsumers)
                .where(
                    and(
                        isNull(syncConsumers.revokedAt),
                        eq(syncConsumers.generation, state.generation),
                        sql`datetime(${syncConsumers.lastSeenAt}) >= datetime('now', '-90 days')`,
                    ),
                );
            const previousMin = state.minRecoverableSequence;
            const candidateSequence = number(candidate?.sequence, 0);
            const consumerSequence =
                activeFloor?.sequence === null || activeFloor?.sequence === undefined
                    ? state.sequence
                    : number(activeFloor.sequence);
            const newMin = Math.max(previousMin, Math.min(candidateSequence, consumerSequence));
            const compactionId = createId();
            await tx.insert(syncCompactions).values({
                id: compactionId,
                generation: state.generation,
                previousMinSequence: previousMin,
                newMinSequence: newMin,
            });
            const deletedEvents =
                newMin > previousMin
                    ? await tx
                          .delete(syncEvents)
                          .where(lte(syncEvents.sequence, newMin))
                          .returning({ id: syncEvents.id })
                    : [];
            const mutationRetention = settings.idempotencyRetentionSeconds;
            const deletedMutations = await tx
                .delete(clientMutations)
                .where(
                    or(
                        and(
                            sql`${clientMutations.expiresAt} IS NOT NULL`,
                            sql`datetime(${clientMutations.expiresAt}) <= CURRENT_TIMESTAMP`,
                        ),
                        sql`datetime(${clientMutations.createdAt}) < datetime('now', '-' || ${mutationRetention} || ' seconds')`,
                    ),
                )
                .returning({ actorUserId: clientMutations.actorUserId });
            await tx
                .delete(idempotencyKeys)
                .where(sql`datetime(${idempotencyKeys.expiresAt}) <= CURRENT_TIMESTAMP`);
            const chatRetention = settings.chatUpdateRetentionSeconds;
            const compactedChats = await tx
                .select({
                    chatId: chatUpdates.chatId,
                    newMinPts: sql<number>`max(${chatUpdates.pts})`,
                })
                .from(chatUpdates)
                .where(
                    sql`datetime(${chatUpdates.createdAt}) < datetime('now', '-' || ${chatRetention} || ' seconds')`,
                )
                .groupBy(chatUpdates.chatId);
            let chatUpdatesDeleted = 0;
            for (const chat of compactedChats) {
                const chatId = chat.chatId;
                const newMinPts = chat.newMinPts;
                const [current] = await tx
                    .select({ minRecoverablePts: chats.minRecoverablePts })
                    .from(chats)
                    .where(eq(chats.id, chatId));
                const previousMinPts = current?.minRecoverablePts ?? 0;
                if (newMinPts <= previousMinPts) continue;
                const deleted = await tx
                    .delete(chatUpdates)
                    .where(and(eq(chatUpdates.chatId, chatId), lte(chatUpdates.pts, newMinPts)))
                    .returning({ pts: chatUpdates.pts });
                chatUpdatesDeleted += deleted.length;
                await tx
                    .update(chats)
                    .set({ minRecoverablePts: newMinPts })
                    .where(eq(chats.id, chatId));
                await tx.insert(chatSyncCompactions).values({
                    id: createId(),
                    chatId,
                    previousMinPts,
                    newMinPts,
                    updatesDeleted: deleted.length,
                });
            }
            await tx
                .update(serverSyncState)
                .set({
                    minRecoverableSequence: newMin,
                    lastCompactedAt: sql`CURRENT_TIMESTAMP`,
                    compactionVersion: sql`${serverSyncState.compactionVersion} + 1`,
                })
                .where(eq(serverSyncState.id, 1));
            await tx
                .update(syncCompactions)
                .set({
                    eventsDeleted: deletedEvents.length,
                    mutationsDeleted: deletedMutations.length,
                    completedAt: sql`CURRENT_TIMESTAMP`,
                    detailsJson: JSON.stringify({ chatUpdatesDeleted }),
                })
                .where(eq(syncCompactions.id, compactionId));
            return {
                minRecoverableSequence: String(newMin),
                eventsDeleted: deletedEvents.length,
                mutationsDeleted: deletedMutations.length,
                chatUpdatesDeleted,
            };
        });
    }

    async canAccessChat(userId: string, chatId: string): Promise<boolean> {
        return Boolean(await this.chatAccessDb(this.db, userId, chatId, false));
    }

    async canPostToChat(userId: string, chatId: string): Promise<boolean> {
        const chat = await this.chatAccessDb(this.db, userId, chatId, true);
        return Boolean(
            chat &&
            !chat.archivedAt &&
            !(await this.isPostingRestrictedDb(this.db, userId, chatId)),
        );
    }

    async listChats(userId: string): Promise<ChatSummary[]> {
        const rows = await this.db
            .select(chatSelection)
            .from(chats)
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .leftJoin(
                userChatPreferences,
                and(
                    eq(userChatPreferences.chatId, chats.id),
                    eq(userChatPreferences.userId, userId),
                ),
            )
            .where(
                and(
                    isNull(chats.deletedAt),
                    or(
                        and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
                        sql`${chatMembers.userId} IS NOT NULL`,
                    ),
                ),
            )
            .orderBy(
                desc(sql`coalesce(${userChatPreferences.starred}, 0)`),
                asc(
                    sql`case when ${userChatPreferences.starred} = 1 then ${userChatPreferences.sortOrder} end`,
                ),
                desc(chats.updatedAt),
                asc(chats.id),
            );
        return rows.map(asChat);
    }

    async getChat(userId: string, chatId: string): Promise<ChatSummary> {
        const chat = await this.chatAccessDb(this.db, userId, chatId, false);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        return chat;
    }

    async listChatMembers(userId: string, chatId: string): Promise<UserSummary[]> {
        let access = await this.chatAccessDb(this.db, userId, chatId, false);
        if (!access) {
            try {
                access = await this.requireChatManagerDb(this.db, userId, chatId);
            } catch (error) {
                if (!(error instanceof CollaborationError)) throw error;
                // Preserve private-channel non-disclosure for ordinary users.
            }
        }
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const rows = await this.db
            .select(userSelection)
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .leftJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    isNull(chatMembers.leftAt),
                    isNull(users.deletedAt),
                    or(
                        eq(users.kind, "agent"),
                        and(
                            eq(users.kind, "human"),
                            eq(accounts.active, 1),
                            isNull(accounts.bannedAt),
                            isNull(accounts.deletedAt),
                        ),
                    ),
                ),
            )
            .orderBy(sql`lower(${users.firstName})`, sql`lower(${users.lastName})`, users.id);
        return rows.map(asUser);
    }

    async listChatMemberships(
        userId: string,
        chatId: string,
    ): Promise<Array<{ user: UserSummary; role: ChatRole; joinedAt: string }>> {
        await this.listChatMembers(userId, chatId);
        const rows = await this.db
            .select({
                ...userSelection,
                chat_role: chatMembers.role,
                joined_at: chatMembers.joinedAt,
            })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .leftJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    isNull(chatMembers.leftAt),
                    isNull(users.deletedAt),
                    or(
                        eq(users.kind, "agent"),
                        and(
                            eq(users.kind, "human"),
                            eq(accounts.active, 1),
                            isNull(accounts.bannedAt),
                            isNull(accounts.deletedAt),
                        ),
                    ),
                ),
            )
            .orderBy(chatMembers.joinedAt, chatMembers.userId);
        return rows.map((row) => ({
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
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            const id = createId();
            const membershipEpoch = createId();
            const sequence = await this.nextSequence(tx);
            try {
                await tx.insert(chats).values({
                    id,
                    kind: input.kind,
                    name: input.name,
                    slug: input.slug,
                    topic: input.topic,
                    createdByUserId: input.actorUserId,
                    pts: 1,
                    ownerUserId: input.actorUserId,
                    visibility: input.kind === "public_channel" ? "public" : "private",
                    lastChangeSequence: sequence,
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError("conflict", "Channel slug is already in use");
                throw error;
            }
            await tx.insert(chatMembers).values({
                chatId: id,
                userId: input.actorUserId,
                role: "owner",
                membershipEpoch,
                syncSequence: sequence,
            });
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.created",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            const chat = await this.chatAccessDb(tx, input.actorUserId, id, false);
            if (!chat) throw new Error("Created channel is not readable");
            return { chat, hint: chatHint(sequence, id, 1) };
        });
    }

    async ensureAgentImageDefinitions(
        definitions: ReadonlyArray<{
            buildContext: string;
            builtinKey: "daycare-full" | "daycare-minimal";
            definitionHash: string;
            dockerTag: string;
            dockerfile: string;
            name: string;
        }>,
    ): Promise<void> {
        await this.writeDb(async (tx) => {
            for (const definition of definitions)
                await tx
                    .insert(agentImages)
                    .values({
                        id: createId(),
                        name: definition.name,
                        dockerfile: definition.dockerfile,
                        definitionHash: definition.definitionHash,
                        dockerTag: definition.dockerTag,
                        buildContext: definition.buildContext,
                        builtinKey: definition.builtinKey,
                    })
                    .onConflictDoNothing();
        });
    }

    async listAgentImages(actorUserId: string): Promise<{
        defaultImageId?: string;
        images: AgentImageSummary[];
    }> {
        await this.requireServerAdminDb(this.db, actorUserId);
        const [settings, images] = await Promise.all([
            this.db
                .select({ defaultImageId: agentImageSettings.defaultImageId })
                .from(agentImageSettings)
                .where(eq(agentImageSettings.id, 1))
                .then((rows) => rows[0]),
            this.db
                .select(agentImageSelection)
                .from(agentImages)
                .orderBy(agentImages.createdAt, agentImages.id),
        ]);
        return {
            ...(settings?.defaultImageId ? { defaultImageId: settings.defaultImageId } : {}),
            images: images.map(asAgentImage),
        };
    }

    async getAgentImage(actorUserId: string, imageId: string): Promise<AgentImageDetails> {
        await this.requireServerAdminDb(this.db, actorUserId);
        const [image] = await this.db
            .select(agentImageDetailsSelection)
            .from(agentImages)
            .where(eq(agentImages.id, imageId))
            .limit(1);
        if (!image) throw new CollaborationError("not_found", "Agent image was not found");
        return asAgentImageDetails(image);
    }

    async createAgentImage(input: {
        actorUserId: string;
        definitionHash: string;
        dockerTag: string;
        dockerfile: string;
        name: string;
    }): Promise<{ hint: MutationHint; image: AgentImageSummary }> {
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            let created: Record<string, unknown>;
            try {
                [created] = await tx
                    .insert(agentImages)
                    .values({
                        id: createId(),
                        name: input.name,
                        dockerfile: input.dockerfile,
                        definitionHash: input.definitionHash,
                        dockerTag: input.dockerTag,
                        status: "pending",
                        buildRequestedAt: sql`CURRENT_TIMESTAMP`,
                        createdByUserId: input.actorUserId,
                    })
                    .returning(agentImageSelection);
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError(
                        "conflict",
                        "An agent image with this immutable definition already exists",
                    );
                throw error;
            }
            if (!created) throw new Error("Agent image was not created");
            await this.appendAuditDb(tx, {
                actorUserId: input.actorUserId,
                action: "agent_image.created",
                targetType: "agent_image",
                targetId: text(created.id),
                after: { definitionHash: input.definitionHash, name: input.name },
            });
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.created",
                entityId: text(created.id),
                actorUserId: input.actorUserId,
            });
            return {
                hint: areaHint(sequence, "agent-images"),
                image: asAgentImage(created),
            };
        });
    }

    async requestAgentImageBuild(input: {
        actorUserId: string;
        imageId: string;
    }): Promise<{ hint: MutationHint; image: AgentImageSummary }> {
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            const [current] = await tx
                .select({ status: agentImages.status })
                .from(agentImages)
                .where(eq(agentImages.id, input.imageId))
                .limit(1);
            if (!current) throw new CollaborationError("not_found", "Agent image was not found");
            if (current.status === "ready")
                throw new CollaborationError("conflict", "Agent image is already ready");
            if (current.status === "building")
                throw new CollaborationError("conflict", "Agent image is already building");
            const [image] = await tx
                .update(agentImages)
                .set({
                    status: "pending",
                    buildProgress: 0,
                    buildLog: "",
                    buildLogTruncated: 0,
                    lastBuildLogLine: null,
                    buildLogUpdatedAt: null,
                    buildRequestedAt: sql`CURRENT_TIMESTAMP`,
                    buildStartedAt: null,
                    dockerImageId: null,
                    lastError: null,
                    readyAt: null,
                    workerId: null,
                    leaseExpiresAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(agentImages.id, input.imageId))
                .returning(agentImageSelection);
            if (!image) throw new Error("Agent image build was not requested");
            await this.appendAuditDb(tx, {
                actorUserId: input.actorUserId,
                action: "agent_image.build_requested",
                targetType: "agent_image",
                targetId: input.imageId,
            });
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.buildRequested",
                entityId: input.imageId,
                actorUserId: input.actorUserId,
            });
            return {
                hint: areaHint(sequence, "agent-images"),
                image: asAgentImage(image),
            };
        });
    }

    async setDefaultAgentImage(input: {
        actorUserId: string;
        imageId: string;
    }): Promise<{ hint: MutationHint; image: AgentImageSummary }> {
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            const [image] = await tx
                .select(agentImageSelection)
                .from(agentImages)
                .where(eq(agentImages.id, input.imageId))
                .limit(1);
            if (!image) throw new CollaborationError("not_found", "Agent image was not found");
            if (image.status !== "ready" || !image.docker_image_id)
                throw new CollaborationError(
                    "conflict",
                    "Only a ready agent image can be the default",
                );
            await tx
                .update(agentImageSettings)
                .set({
                    defaultImageId: input.imageId,
                    updatedByUserId: input.actorUserId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(agentImageSettings.id, 1));
            await this.appendAuditDb(tx, {
                actorUserId: input.actorUserId,
                action: "agent_image.default_selected",
                targetType: "agent_image",
                targetId: input.imageId,
            });
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.defaultSelected",
                entityId: input.imageId,
                actorUserId: input.actorUserId,
            });
            return {
                hint: areaHint(sequence, "agent-images"),
                image: asAgentImage(image),
            };
        });
    }

    async getReadyDefaultAgentImage(): Promise<AgentExecutionImage | undefined> {
        const [image] = await this.db
            .select({
                id: agentImages.id,
                dockerTag: agentImages.dockerTag,
                dockerImageId: agentImages.dockerImageId,
            })
            .from(agentImageSettings)
            .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
            .where(
                and(
                    eq(agentImageSettings.id, 1),
                    eq(agentImages.status, "ready"),
                    sql`${agentImages.dockerImageId} IS NOT NULL`,
                ),
            )
            .limit(1);
        return image?.dockerImageId
            ? { id: image.id, dockerTag: image.dockerTag, dockerImageId: image.dockerImageId }
            : undefined;
    }

    async listRequestedAgentImageBuildIds(): Promise<string[]> {
        const rows = await this.db
            .select({ id: agentImages.id })
            .from(agentImages)
            .where(
                or(
                    and(
                        eq(agentImages.status, "pending"),
                        sql`${agentImages.buildRequestedAt} IS NOT NULL`,
                    ),
                    and(
                        eq(agentImages.status, "building"),
                        or(
                            isNull(agentImages.leaseExpiresAt),
                            lte(agentImages.leaseExpiresAt, new Date().toISOString()),
                        ),
                    ),
                ),
            )
            .orderBy(agentImages.buildRequestedAt, agentImages.createdAt, agentImages.id);
        return rows.map((row) => row.id);
    }

    async takeAgentImageBuild(
        imageId: string,
        workerId: string,
    ): Promise<{ build: AgentImageBuild; hint: MutationHint } | undefined> {
        return this.writeDb(async (tx) => {
            const now = new Date().toISOString();
            const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
            const claimable = or(
                and(
                    eq(agentImages.status, "pending"),
                    sql`${agentImages.buildRequestedAt} IS NOT NULL`,
                ),
                and(
                    eq(agentImages.status, "building"),
                    or(isNull(agentImages.leaseExpiresAt), lte(agentImages.leaseExpiresAt, now)),
                ),
            );
            const [claimed] = await tx
                .update(agentImages)
                .set({
                    status: "building",
                    buildAttempt: sql`${agentImages.buildAttempt} + 1`,
                    buildProgress: 1,
                    buildLog: "",
                    buildLogTruncated: 0,
                    lastBuildLogLine: null,
                    buildLogUpdatedAt: sql`CURRENT_TIMESTAMP`,
                    buildStartedAt: sql`CURRENT_TIMESTAMP`,
                    lastError: null,
                    workerId,
                    leaseExpiresAt,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(agentImages.id, imageId), claimable))
                .returning({
                    id: agentImages.id,
                    buildContext: agentImages.buildContext,
                    dockerfile: agentImages.dockerfile,
                    dockerTag: agentImages.dockerTag,
                });
            if (!claimed) return undefined;
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.building",
                entityId: imageId,
            });
            return {
                build: {
                    id: claimed.id,
                    dockerfile: claimed.dockerfile,
                    dockerTag: claimed.dockerTag,
                    ...(claimed.buildContext ? { buildContext: claimed.buildContext } : {}),
                },
                hint: areaHint(sequence, "agent-images"),
            };
        });
    }

    async recordAgentImageBuildOutput(input: {
        imageId: string;
        lastBuildLogLine?: string;
        logChunk: string;
        progress: number;
        workerId: string;
    }): Promise<MutationHint | undefined> {
        const progress = Math.max(1, Math.min(99, Math.trunc(input.progress)));
        return this.writeDb(async (tx) => {
            const changed = await tx
                .update(agentImages)
                .set({
                    buildLog: sql`substr(${agentImages.buildLog} || ${input.logChunk}, -${MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS})`,
                    buildLogTruncated: sql`CASE WHEN ${agentImages.buildLogTruncated} = 1 OR length(${agentImages.buildLog}) + length(${input.logChunk}) > ${MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS} THEN 1 ELSE 0 END`,
                    buildProgress: sql`max(${agentImages.buildProgress}, ${progress})`,
                    ...(input.lastBuildLogLine === undefined
                        ? {}
                        : { lastBuildLogLine: input.lastBuildLogLine }),
                    buildLogUpdatedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentImages.id, input.imageId),
                        eq(agentImages.status, "building"),
                        eq(agentImages.workerId, input.workerId),
                    ),
                )
                .returning({ id: agentImages.id });
            if (changed.length !== 1) return undefined;
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.buildProgress",
                entityId: input.imageId,
            });
            return areaHint(sequence, "agent-images");
        });
    }

    async renewAgentImageBuildLease(imageId: string, workerId: string): Promise<boolean> {
        const changed = await retrySqliteBusy(() =>
            this.db
                .update(agentImages)
                .set({
                    leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentImages.id, imageId),
                        eq(agentImages.status, "building"),
                        eq(agentImages.workerId, workerId),
                    ),
                )
                .returning({ id: agentImages.id }),
        );
        return changed.length === 1;
    }

    async completeAgentImageBuild(input: {
        dockerImageId: string;
        imageId: string;
        workerId: string;
    }): Promise<MutationHint | undefined> {
        return this.writeDb(async (tx) => {
            const changed = await tx
                .update(agentImages)
                .set({
                    status: "ready",
                    buildProgress: 100,
                    dockerImageId: input.dockerImageId,
                    lastError: null,
                    readyAt: sql`CURRENT_TIMESTAMP`,
                    workerId: null,
                    leaseExpiresAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentImages.id, input.imageId),
                        eq(agentImages.status, "building"),
                        eq(agentImages.workerId, input.workerId),
                    ),
                )
                .returning({ id: agentImages.id });
            if (changed.length !== 1) return undefined;
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.ready",
                entityId: input.imageId,
            });
            return areaHint(sequence, "agent-images");
        });
    }

    async failAgentImageBuild(input: {
        error: string;
        imageId: string;
        workerId: string;
    }): Promise<MutationHint | undefined> {
        return this.writeDb(async (tx) => {
            const changed = await tx
                .update(agentImages)
                .set({
                    status: "failed",
                    dockerImageId: null,
                    lastError: input.error,
                    readyAt: null,
                    workerId: null,
                    leaseExpiresAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentImages.id, input.imageId),
                        eq(agentImages.status, "building"),
                        eq(agentImages.workerId, input.workerId),
                    ),
                )
                .returning({ id: agentImages.id });
            if (changed.length !== 1) return undefined;
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.failed",
                entityId: input.imageId,
            });
            return areaHint(sequence, "agent-images");
        });
    }

    async releaseAgentImageBuildLeases(workerId: string): Promise<void> {
        await this.writeDb(async (tx) => {
            const changed = await tx
                .update(agentImages)
                .set({
                    status: "pending",
                    workerId: null,
                    leaseExpiresAt: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(agentImages.workerId, workerId), eq(agentImages.status, "building")))
                .returning({ id: agentImages.id });
            if (!changed.length) return;
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "agentImage.buildReleased",
                entityId: changed[0]!.id,
            });
        });
    }

    async createAgent(input: {
        agentUserId: string;
        actorUserId: string;
        containerName: string;
        imageId: string;
        name: string;
        username: string;
        sessionId: string;
        cwd: string;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            const [existing] = await tx
                .select({ id: users.id })
                .from(users)
                .where(sql`lower(${users.username}) = lower(${input.username})`)
                .limit(1);
            if (existing)
                throw new CollaborationError("conflict", "Agent username is already taken");
            const [configuredImage] = await tx
                .select({
                    id: agentImages.id,
                    status: agentImages.status,
                    dockerImageId: agentImages.dockerImageId,
                })
                .from(agentImageSettings)
                .innerJoin(agentImages, eq(agentImages.id, agentImageSettings.defaultImageId))
                .where(and(eq(agentImageSettings.id, 1), eq(agentImages.id, input.imageId)))
                .limit(1);
            if (configuredImage?.status !== "ready" || !configuredImage.dockerImageId)
                throw new CollaborationError(
                    "conflict",
                    "A ready default agent image must be configured before creating agents",
                );
            const chatId = createId();
            const agentUserId = input.agentUserId;
            const sequence = await this.nextSequence(tx);
            await tx.insert(users).values({
                id: agentUserId,
                accountId: null,
                createdByUserId: input.actorUserId,
                firstName: input.name,
                username: input.username,
                kind: "agent",
                agentImageId: input.imageId,
            });
            await tx.insert(chats).values({
                id: chatId,
                kind: "dm",
                dmType: "direct",
                createdByUserId: input.actorUserId,
                ownerUserId: input.actorUserId,
                dmKey: [input.actorUserId, agentUserId].sort().join(":"),
                visibility: "direct",
                isListed: 0,
                pts: 1,
                lastChangeSequence: sequence,
            });
            await tx.insert(agentRigBindings).values({
                userId: agentUserId,
                chatId,
                imageId: input.imageId,
                sessionId: input.sessionId,
                containerName: input.containerName,
                cwd: input.cwd,
            });
            await tx.insert(chatMembers).values(
                [input.actorUserId, agentUserId].map((userId) => ({
                    chatId,
                    userId,
                    role: userId === input.actorUserId ? ("owner" as const) : ("member" as const),
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })),
            );
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId,
                kind: "chat.created",
                entityId: chatId,
                actorUserId: input.actorUserId,
            });
            const chat = await this.chatAccessDb(tx, input.actorUserId, chatId, false);
            if (!chat) throw new Error("Created agent DM is not readable");
            return { chat, hint: chatHint(sequence, chatId, 1) };
        });
    }

    async agentUsernameAvailable(username: string): Promise<boolean> {
        const [existing] = await this.db
            .select({ id: users.id })
            .from(users)
            .where(sql`lower(${users.username}) = lower(${username})`)
            .limit(1);
        return !existing;
    }

    async getDirectAgentChatContext(
        userId: string,
        chatId: string,
    ): Promise<AgentChatContext | undefined> {
        const access = await this.chatAccessDb(this.db, userId, chatId, true);
        if (!access || access.kind !== "dm" || access.dmType !== "direct") return undefined;
        const [agent, human] = await Promise.all([
            this.db
                .select({
                    userId: users.id,
                    imageId: agentImages.id,
                    dockerTag: agentImages.dockerTag,
                    dockerImageId: agentImages.dockerImageId,
                    imageStatus: agentImages.status,
                })
                .from(chatMembers)
                .innerJoin(users, eq(users.id, chatMembers.userId))
                .innerJoin(agentImages, eq(agentImages.id, users.agentImageId))
                .where(
                    and(
                        eq(chatMembers.chatId, chatId),
                        isNull(chatMembers.leftAt),
                        isNull(users.deletedAt),
                        eq(users.kind, "agent"),
                    ),
                )
                .orderBy(users.id)
                .limit(1)
                .then((rows) => rows[0]),
            this.db
                .select({ userId: users.id })
                .from(chatMembers)
                .innerJoin(users, eq(users.id, chatMembers.userId))
                .where(
                    and(
                        eq(chatMembers.chatId, chatId),
                        isNull(chatMembers.leftAt),
                        isNull(users.deletedAt),
                        eq(users.kind, "human"),
                    ),
                )
                .orderBy(users.id)
                .limit(1)
                .then((rows) => rows[0]),
        ]);
        if (!agent || !human || agent.imageStatus !== "ready" || !agent.dockerImageId)
            return undefined;
        const [bound] = await this.db
            .select({
                containerName: agentRigBindings.containerName,
                cwd: agentRigBindings.cwd,
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(
                and(eq(agentRigBindings.userId, agent.userId), eq(agentRigBindings.chatId, chatId)),
            )
            .limit(1);
        return {
            agentUserId: agent.userId,
            chatId,
            image: {
                id: agent.imageId,
                dockerImageId: agent.dockerImageId,
                dockerTag: agent.dockerTag,
            },
            privateUserId: human.userId,
            ...(bound
                ? {
                      binding: {
                          containerName: bound.containerName,
                          cwd: bound.cwd,
                          sessionId: bound.sessionId,
                      },
                  }
                : {}),
        };
    }

    async bindAgentChat(input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        containerName: string;
        cwd: string;
        imageId: string;
        sessionId: string;
    }): Promise<{ containerName: string; cwd: string; sessionId: string }> {
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access || access.kind !== "dm" || access.dmType !== "direct")
                throw new CollaborationError("not_found", "Agent direct message was not found");
            const [agent] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.userId, users.id),
                        eq(chatMembers.chatId, input.chatId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .where(
                    and(
                        eq(users.id, input.agentUserId),
                        eq(users.kind, "agent"),
                        eq(users.agentImageId, input.imageId),
                        isNull(users.deletedAt),
                    ),
                )
                .limit(1);
            if (!agent)
                throw new CollaborationError("not_found", "Agent direct message was not found");
            await tx
                .insert(agentRigBindings)
                .values({
                    userId: input.agentUserId,
                    chatId: input.chatId,
                    imageId: input.imageId,
                    sessionId: input.sessionId,
                    containerName: input.containerName,
                    cwd: input.cwd,
                })
                .onConflictDoNothing();
            const [binding] = await tx
                .select({
                    agentUserId: agentRigBindings.userId,
                    containerName: agentRigBindings.containerName,
                    cwd: agentRigBindings.cwd,
                    imageId: agentRigBindings.imageId,
                    sessionId: agentRigBindings.sessionId,
                })
                .from(agentRigBindings)
                .where(
                    and(
                        eq(agentRigBindings.userId, input.agentUserId),
                        eq(agentRigBindings.chatId, input.chatId),
                    ),
                )
                .limit(1);
            if (!binding) throw new Error("Agent chat binding was not created");
            if (binding.imageId !== input.imageId)
                throw new Error("Agent chat binding uses a different image");
            return {
                containerName: binding.containerName,
                cwd: binding.cwd,
                sessionId: binding.sessionId,
            };
        });
    }

    async listUnfinishedAgentChatIds(): Promise<string[]> {
        const rows = await this.db
            .selectDistinct({ chatId: agentTurns.chatId })
            .from(agentTurns)
            .where(inArray(agentTurns.status, ["pending", "running"]));
        return rows.map((row) => row.chatId);
    }

    async hasUnfinishedAgentTurn(chatId: string): Promise<boolean> {
        const [row] = await this.db
            .select({ id: agentTurns.userMessageId })
            .from(agentTurns)
            .where(
                and(
                    eq(agentTurns.chatId, chatId),
                    inArray(agentTurns.status, ["pending", "running"]),
                ),
            )
            .limit(1);
        return Boolean(row);
    }

    async hasRunnableAgentTurn(chatId: string): Promise<boolean> {
        const [running] = await this.db
            .select({ leaseExpiresAt: agentTurns.leaseExpiresAt })
            .from(agentTurns)
            .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "running")))
            .limit(1);
        if (running && running.leaseExpiresAt && Date.parse(running.leaseExpiresAt) > Date.now())
            return false;
        const [pending] = await this.db
            .select({ id: agentTurns.userMessageId })
            .from(agentTurns)
            .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "pending")))
            .limit(1);
        return Boolean(running || pending);
    }

    async takeNextAgentTurn(
        chatId: string,
        workerId: string,
    ): Promise<
        | {
              agentUserId: string;
              actorUserId: string;
              baselineMessageCount?: number;
              chatId: string;
              lastSessionEventId?: string;
              leaseExpiresAt?: string;
              runId?: string;
              sessionId: string;
              streamCommittedText: string;
              text: string;
              userMessageId: string;
              workerId: string;
          }
        | undefined
    > {
        return this.writeDb(async (tx) => {
            const leaseExpiresAt = new Date(Date.now() + 45_000).toISOString();
            const [active] = await tx
                .select(agentTurnWorkSelection)
                .from(agentTurns)
                .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
                .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "running")))
                .limit(1);
            if (active?.actorUserId) {
                if (
                    active.workerId !== workerId &&
                    active.leaseExpiresAt &&
                    Date.parse(active.leaseExpiresAt) > Date.now()
                )
                    return undefined;
                const claimed = await tx
                    .update(agentTurns)
                    .set({ workerId, leaseExpiresAt, updatedAt: sql`CURRENT_TIMESTAMP` })
                    .where(
                        and(
                            eq(agentTurns.userMessageId, active.userMessageId),
                            eq(agentTurns.agentUserId, active.agentUserId),
                            eq(agentTurns.status, "running"),
                        ),
                    )
                    .returning({ id: agentTurns.userMessageId });
                return claimed.length === 1
                    ? agentTurnWork({ ...active, workerId, leaseExpiresAt })
                    : undefined;
            }
            const [next] = await tx
                .select(agentTurnWorkSelection)
                .from(agentTurns)
                .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
                .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "pending")))
                .orderBy(agentTurns.createdAt, agentTurns.userMessageId)
                .limit(1);
            if (!next?.actorUserId) return undefined;
            const claimed = await tx
                .update(agentTurns)
                .set({
                    status: "running",
                    workerId,
                    leaseExpiresAt,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    lastError: null,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, next.userMessageId),
                        eq(agentTurns.agentUserId, next.agentUserId),
                        eq(agentTurns.status, "pending"),
                    ),
                )
                .returning({ id: agentTurns.userMessageId });
            return claimed.length === 1
                ? agentTurnWork({ ...next, workerId, leaseExpiresAt })
                : undefined;
        });
    }

    async renewAgentTurnLease(input: {
        agentUserId: string;
        userMessageId: string;
        workerId: string;
    }): Promise<boolean> {
        const changed = await retrySqliteBusy(() =>
            this.db
                .update(agentTurns)
                .set({
                    leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                    ),
                )
                .returning({ id: agentTurns.userMessageId }),
        );
        return changed.length === 1;
    }

    async releaseAgentTurnLeases(workerId: string): Promise<void> {
        await retrySqliteBusy(() =>
            this.db
                .update(agentTurns)
                .set({ workerId: null, leaseExpiresAt: null, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(and(eq(agentTurns.workerId, workerId), eq(agentTurns.status, "running"))),
        );
    }

    async checkpointAgentTurn(input: {
        agentUserId: string;
        baselineMessageCount: number;
        lastSessionEventId?: string;
        runId?: string;
        userMessageId: string;
        workerId: string;
    }): Promise<boolean> {
        const changed = await retrySqliteBusy(() =>
            this.db
                .update(agentTurns)
                .set({
                    baselineMessageCount: input.baselineMessageCount,
                    ...(input.lastSessionEventId === undefined
                        ? {}
                        : { lastSessionEventId: input.lastSessionEventId }),
                    ...(input.runId === undefined ? {} : { runId: input.runId }),
                    leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    lastError: null,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                    ),
                )
                .returning({ id: agentTurns.userMessageId }),
        );
        return changed.length === 1;
    }

    async attachAgentRun(input: { runId: string; sessionId: string; text: string }): Promise<void> {
        const [turn] = await this.db
            .select({ userMessageId: agentTurns.userMessageId })
            .from(agentTurns)
            .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
            .where(
                and(
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.status, "running"),
                    isNull(agentTurns.runId),
                    eq(messages.text, input.text),
                ),
            )
            .orderBy(agentTurns.createdAt, agentTurns.userMessageId)
            .limit(1);
        if (!turn) return;
        await retrySqliteBusy(() =>
            this.db
                .update(agentTurns)
                .set({
                    runId: input.runId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                    lastError: null,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, turn.userMessageId),
                        eq(agentTurns.status, "running"),
                        isNull(agentTurns.runId),
                    ),
                ),
        );
    }

    async getRunningAgentTurn(sessionId: string, runId: string) {
        const [turn] = await this.db
            .select(agentTurnWorkSelection)
            .from(agentTurns)
            .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
            .where(and(eq(agentTurns.sessionId, sessionId), eq(agentTurns.status, "running")))
            .limit(1);
        if (turn?.runId && turn.runId !== runId) return undefined;
        return turn?.actorUserId ? agentTurnWork(turn) : undefined;
    }

    async getRigEventCheckpoint(): Promise<RigEventCheckpoint> {
        await this.db.insert(rigEventSyncState).values({ id: 1 }).onConflictDoNothing();
        const [state] = await this.db
            .select()
            .from(rigEventSyncState)
            .where(eq(rigEventSyncState.id, 1))
            .limit(1);
        if (!state) throw new Error("Rig event checkpoint is missing");
        return asRigEventCheckpoint(state);
    }

    async checkpointRigEvent(cursor: number, eventCount = 1): Promise<RigEventCheckpoint> {
        if (!Number.isSafeInteger(eventCount) || eventCount < 1)
            throw new Error("Rig event checkpoint count must be a positive integer");
        const [updated] = await retrySqliteBusy(() =>
            this.db
                .update(rigEventSyncState)
                .set({
                    cursor,
                    eventsSinceTrim: sql`${rigEventSyncState.eventsSinceTrim} + ${eventCount}`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(rigEventSyncState.id, 1),
                        or(isNull(rigEventSyncState.cursor), lt(rigEventSyncState.cursor, cursor)),
                    ),
                )
                .returning(),
        );
        return updated ? asRigEventCheckpoint(updated) : this.getRigEventCheckpoint();
    }

    async markRigEventsTrimmed(through: number): Promise<RigEventCheckpoint> {
        const [updated] = await this.db
            .update(rigEventSyncState)
            .set({
                trimmedThrough: through,
                eventsSinceTrim: 0,
                lastTrimmedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(rigEventSyncState.id, 1), sql`${rigEventSyncState.cursor} >= ${through}`))
            .returning();
        return updated ? asRigEventCheckpoint(updated) : this.getRigEventCheckpoint();
    }

    async streamAgentTurnReply(input: {
        agentUserId: string;
        actorUserId: string;
        eventId: string;
        expectedEventId?: string;
        sessionId: string;
        streamCommittedText: string;
        userMessageId: string;
        text: string;
        workerId: string;
    }): Promise<{
        applied: boolean;
        message?: MessageSummary;
        hint?: MutationHint;
    }> {
        return this.writeDb(async (tx) => {
            const [turn] = await tx
                .update(agentTurns)
                .set({
                    lastSessionEventId: input.eventId,
                    streamCommittedText: input.streamCommittedText,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.sessionId, input.sessionId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                        input.expectedEventId === undefined
                            ? isNull(agentTurns.lastSessionEventId)
                            : eq(agentTurns.lastSessionEventId, input.expectedEventId),
                    ),
                )
                .returning({
                    assistantMessageId: agentTurns.assistantMessageId,
                    chatId: agentTurns.chatId,
                });
            if (!turn) return { applied: false };

            let created: { message: MessageSummary; hint: MutationHint } | undefined;
            let messageId = turn.assistantMessageId ?? undefined;
            if (!messageId && input.text.length > 0) {
                created = await this.sendMessageDb(tx, {
                    actorUserId: input.actorUserId,
                    agentSessionId: input.sessionId,
                    chatId: turn.chatId,
                    clientMutationId: agentReplyMutationId(input.sessionId, input.userMessageId),
                    deferPublication: true,
                    kind: "automated",
                    text: input.text,
                });
                messageId = created.message.id;
                const linked = await tx
                    .update(agentTurns)
                    .set({ assistantMessageId: messageId })
                    .where(
                        and(
                            eq(agentTurns.userMessageId, input.userMessageId),
                            eq(agentTurns.agentUserId, input.agentUserId),
                            eq(agentTurns.sessionId, input.sessionId),
                            eq(agentTurns.workerId, input.workerId),
                            eq(agentTurns.status, "running"),
                            eq(agentTurns.lastSessionEventId, input.eventId),
                        ),
                    )
                    .returning({ id: agentTurns.assistantMessageId });
                if (linked.length !== 1) throw new Error("Agent turn reply could not be linked");
            }
            if (!messageId) return { applied: true };
            const [messageRow] = await tx
                .select({ text: messages.text })
                .from(messages)
                .where(eq(messages.id, messageId))
                .limit(1);
            if (!messageRow) throw new Error("Agent turn reply is missing");
            if (messageRow.text === input.text) {
                if (!created) return { applied: true };
                const message = await this.getMessageProjectionDb(tx, input.actorUserId, messageId);
                if (!message) throw new Error("Agent turn reply is not readable");
                return { applied: true, message, hint: created.hint };
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.agentUserId,
                turn.chatId,
                "message.streaming",
                messageId,
            );
            await tx
                .update(messages)
                .set({
                    text: input.text,
                    changePts: mutation.pts,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(messages.id, messageId));
            const message = await this.getMessageProjectionDb(tx, input.actorUserId, messageId);
            if (!message) throw new Error("Streamed agent turn reply is not readable");
            return {
                applied: true,
                message,
                hint: chatHint(sequence, turn.chatId, mutation.pts),
            };
        });
    }

    async completeAgentTurn(input: {
        agentUserId: string;
        actorUserId: string;
        sessionId: string;
        userMessageId: string;
        text: string;
        workerId: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint } | undefined> {
        return this.finishAgentTurn({
            ...input,
            eventKind: "message.completed",
            status: "complete",
        });
    }

    async failAgentTurn(input: {
        agentUserId: string;
        actorUserId: string;
        error: string;
        sessionId: string;
        userMessageId: string;
        workerId: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint } | undefined> {
        return this.finishAgentTurn({
            agentUserId: input.agentUserId,
            actorUserId: input.actorUserId,
            eventKind: "message.failed",
            lastError: input.error,
            sessionId: input.sessionId,
            status: "failed",
            text: "I couldn't complete this request.",
            userMessageId: input.userMessageId,
            workerId: input.workerId,
        });
    }

    private async finishAgentTurn(input: {
        agentUserId: string;
        actorUserId: string;
        eventKind: "message.completed" | "message.failed";
        lastError?: string;
        sessionId: string;
        status: "complete" | "failed";
        text: string;
        userMessageId: string;
        workerId: string;
    }): Promise<{ message: MessageSummary; hint: MutationHint } | undefined> {
        return this.writeDb(async (tx) => {
            const [turn] = await tx
                .update(agentTurns)
                .set({
                    status: input.status,
                    lastError: input.lastError ?? null,
                    workerId: null,
                    leaseExpiresAt: null,
                    completedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, input.userMessageId),
                        eq(agentTurns.agentUserId, input.agentUserId),
                        eq(agentTurns.sessionId, input.sessionId),
                        eq(agentTurns.workerId, input.workerId),
                        eq(agentTurns.status, "running"),
                    ),
                )
                .returning({
                    assistantMessageId: agentTurns.assistantMessageId,
                    chatId: agentTurns.chatId,
                });
            if (!turn) return undefined;

            let created: { message: MessageSummary; hint: MutationHint } | undefined;
            let messageId = turn.assistantMessageId ?? undefined;
            if (!messageId) {
                created = await this.sendMessageDb(tx, {
                    actorUserId: input.actorUserId,
                    agentSessionId: input.sessionId,
                    chatId: turn.chatId,
                    clientMutationId: agentReplyMutationId(input.sessionId, input.userMessageId),
                    kind: "automated",
                    text: input.text,
                });
                messageId = created.message.id;
                const linked = await tx
                    .update(agentTurns)
                    .set({ assistantMessageId: messageId })
                    .where(
                        and(
                            eq(agentTurns.userMessageId, input.userMessageId),
                            eq(agentTurns.agentUserId, input.agentUserId),
                            eq(agentTurns.sessionId, input.sessionId),
                            eq(agentTurns.status, input.status),
                        ),
                    )
                    .returning({ id: agentTurns.assistantMessageId });
                if (linked.length !== 1) throw new Error("Agent turn reply could not be linked");
            }
            const [messageRow] = await tx
                .select({
                    publishedAt: messages.publishedAt,
                    sequence: messages.sequence,
                    text: messages.text,
                })
                .from(messages)
                .where(eq(messages.id, messageId))
                .limit(1);
            if (!messageRow) throw new Error("Agent turn reply is missing");
            if (created && messageRow.text === input.text) {
                const message = await this.getMessageProjectionDb(tx, input.actorUserId, messageId);
                if (!message) throw new Error("Agent turn reply is not readable");
                return { message, hint: created.hint };
            }
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.agentUserId,
                turn.chatId,
                input.eventKind,
                messageId,
            );
            await tx
                .update(messages)
                .set({
                    text: input.text,
                    changePts: mutation.pts,
                    publishedAt: sql`coalesce(${messages.publishedAt}, CURRENT_TIMESTAMP)`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(messages.id, messageId));
            let mentions: { notifyAll: boolean; userIds: string[] } | undefined;
            if (messageRow.text !== input.text || messageRow.publishedAt === null) {
                mentions = await this.replaceMessageMentionsDb(tx, messageId, input.text);
                await this.indexMessageForSearchDb(tx, messageId, turn.chatId, input.text, 1);
            }
            if (messageRow.publishedAt === null) {
                const chat = await this.chatAccessDb(tx, input.actorUserId, turn.chatId, true);
                if (!chat) throw new Error("Agent turn chat is inaccessible");
                await this.recordMessageDeliveryDb(tx, {
                    actorUserId: input.actorUserId,
                    chat,
                    messageId,
                    messageSequence: messageRow.sequence,
                    mentionedUserIds: mentions?.userIds ?? [],
                    mentionAll: mentions?.notifyAll,
                    respectCurrentReadState: true,
                    senderUserId: input.agentUserId,
                    syncSequence: sequence,
                });
            }
            const message = await this.getMessageProjectionDb(tx, input.actorUserId, messageId);
            if (!message) throw new Error("Finished agent turn reply is not readable");
            return { message, hint: chatHint(sequence, turn.chatId, mutation.pts) };
        });
    }

    async createDirectMessage(
        actorUserId: string,
        otherUserId: string,
    ): Promise<{ chat: ChatSummary; hint?: MutationHint }> {
        if (actorUserId === otherUserId)
            throw new CollaborationError("invalid", "A direct message requires another user");
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, actorUserId);
            await this.requireActiveIdentityDb(tx, otherUserId);
            const dmKey = [actorUserId, otherUserId].sort().join(":");
            const [existing] = await tx
                .select({ id: chats.id })
                .from(chats)
                .where(eq(chats.dmKey, dmKey))
                .limit(1);
            if (existing) {
                const chat = await this.chatAccessDb(tx, actorUserId, existing.id, false);
                if (!chat) throw new Error("Existing DM is inaccessible");
                return { chat };
            }
            const id = createId();
            const sequence = await this.nextSequence(tx);
            await tx.insert(chats).values({
                id,
                kind: "dm",
                dmType: "direct",
                createdByUserId: actorUserId,
                ownerUserId: actorUserId,
                dmKey,
                pts: 1,
                isListed: 0,
                visibility: "direct",
                lastChangeSequence: sequence,
            });
            for (const userId of [actorUserId, otherUserId]) {
                await tx.insert(chatMembers).values({
                    chatId: id,
                    userId,
                    role: userId === actorUserId ? "owner" : "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
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
            const chat = await this.chatAccessDb(tx, actorUserId, id, false);
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
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            for (const userId of memberUserIds) {
                await this.requireActiveIdentityDb(tx, userId);
            }
            const dmKey = `group:${memberUserIds.join(":")}`;
            const [existing] = await tx
                .select({ id: chats.id })
                .from(chats)
                .where(and(eq(chats.dmKey, dmKey), isNull(chats.deletedAt)))
                .limit(1);
            if (existing) {
                const chat = await this.chatAccessDb(tx, input.actorUserId, existing.id, false);
                if (!chat) throw new Error("Existing group DM is inaccessible");
                return { chat, memberUserIds };
            }
            const id = createId();
            const sequence = await this.nextSequence(tx);
            await tx.insert(chats).values({
                id,
                kind: "dm",
                dmType: "group",
                name: input.name,
                createdByUserId: input.actorUserId,
                ownerUserId: input.actorUserId,
                dmKey,
                pts: 1,
                isListed: 0,
                visibility: "direct",
                lastChangeSequence: sequence,
            });
            for (const userId of memberUserIds)
                await tx.insert(chatMembers).values({
                    chatId: id,
                    userId,
                    role: userId === input.actorUserId ? "owner" : "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                    invitedByUserId: input.actorUserId,
                });
            await this.insertChatUpdate(tx, {
                sequence,
                pts: 1,
                chatId: id,
                kind: "chat.groupDirectMessageCreated",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            const chat = await this.chatAccessDb(tx, input.actorUserId, id, false);
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
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError(
                    "invalid",
                    "Direct messages cannot use channel settings",
                );
            if (input.photoFileId !== undefined && input.photoFileId !== null) {
                const [file] = await tx
                    .select({ kind: files.kind })
                    .from(files)
                    .where(
                        and(
                            eq(files.id, input.photoFileId),
                            isNull(files.deletedAt),
                            eq(files.uploadStatus, "complete"),
                            ne(files.scanStatus, "infected"),
                            or(
                                eq(files.uploadedByUserId, input.actorUserId),
                                eq(files.isPublic, 1),
                            ),
                        ),
                    )
                    .limit(1);
                if (!file || !["photo", "gif"].includes(file.kind))
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
                await tx
                    .update(chats)
                    .set({
                        ...(input.name === undefined ? {} : { name: input.name }),
                        ...(input.slug === undefined ? {} : { slug: input.slug }),
                        ...(input.topic === undefined ? {} : { topic: input.topic }),
                        ...(input.kind === undefined
                            ? {}
                            : {
                                  kind: input.kind,
                                  visibility:
                                      input.kind === "public_channel" ? "public" : "private",
                              }),
                        ...(input.photoFileId === undefined
                            ? {}
                            : { photoFileId: input.photoFileId }),
                        ...(input.isListed === undefined
                            ? {}
                            : { isListed: input.isListed ? 1 : 0 }),
                        lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)));
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new CollaborationError("conflict", "Channel slug is already in use");
                throw error;
            }
            const chat = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            return { chat, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async setChannelArchived(input: {
        actorUserId: string;
        chatId: string;
        archived: boolean;
        reason?: string;
    }): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
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
            await tx
                .update(chats)
                .set({
                    archivedAt: input.archived ? sql`CURRENT_TIMESTAMP` : null,
                    archivedByUserId: input.archived ? input.actorUserId : null,
                    archiveReason: input.archived ? (input.reason ?? null) : null,
                    lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, input.chatId));
            const chat = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
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
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
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
            await tx
                .update(chats)
                .set({
                    ...(input.retentionMode === undefined
                        ? {}
                        : { retentionMode: input.retentionMode }),
                    ...(input.retentionSeconds === undefined
                        ? {}
                        : { retentionSeconds: input.retentionSeconds }),
                    ...(input.defaultExpiryMode === undefined
                        ? {}
                        : { defaultExpiryMode: input.defaultExpiryMode }),
                    ...(input.defaultSelfDestructSeconds === undefined
                        ? {}
                        : { defaultSelfDestructSeconds: input.defaultSelfDestructSeconds }),
                    ...(input.defaultAfterReadScope === undefined
                        ? {}
                        : { defaultAfterReadScope: input.defaultAfterReadScope }),
                    lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, input.chatId));
            const chat = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            return { chat, hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async deleteChannel(input: {
        actorUserId: string;
        chatId: string;
        reason?: string;
    }): Promise<{ hint: MutationHint; memberUserIds: string[] }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct messages cannot be deleted");
            if (!access.isServerAdmin && access.membershipRole !== "owner")
                throw new CollaborationError("forbidden", "Only an owner can delete a channel");
            const members = await tx
                .select({ userId: chatMembers.userId })
                .from(chatMembers)
                .where(and(eq(chatMembers.chatId, input.chatId), isNull(chatMembers.leftAt)));
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "chat.deleted",
                input.chatId,
            );
            await tx
                .update(chats)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    deletedByUserId: input.actorUserId,
                    deleteReason: input.reason ?? null,
                    lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(chats.id, input.chatId));
            return {
                hint: chatHint(sequence, input.chatId, mutation.pts),
                memberUserIds: members.map((row) => row.userId),
            };
        });
    }

    async setChannelMemberRole(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role: ChatRole;
    }): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message roles are fixed");
            if (
                input.role === "owner" &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner"
            )
                throw new CollaborationError("forbidden", "Only an owner can assign ownership");
            const [member] = await tx
                .select({ role: chatMembers.role })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .limit(1);
            if (!member) throw new CollaborationError("not_found", "Member was not found");
            if (member.role === input.role)
                throw new CollaborationError("conflict", "Member already has this role");
            let replacementOwnerId: string | undefined;
            if (member.role === "owner" && input.role !== "owner") {
                const [another] = await tx
                    .select({ userId: chatMembers.userId })
                    .from(chatMembers)
                    .where(
                        and(
                            eq(chatMembers.chatId, input.chatId),
                            ne(chatMembers.userId, input.userId),
                            isNull(chatMembers.leftAt),
                            eq(chatMembers.role, "owner"),
                        ),
                    )
                    .orderBy(chatMembers.joinedAt, chatMembers.userId)
                    .limit(1);
                if (!another)
                    throw new CollaborationError(
                        "conflict",
                        "Transfer ownership before demoting the only owner",
                    );
                replacementOwnerId = another.userId;
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
            await tx
                .update(chatMembers)
                .set({
                    role: input.role,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            if (input.role === "owner")
                await tx
                    .update(chats)
                    .set({ ownerUserId: input.userId })
                    .where(eq(chats.id, input.chatId));
            else if (replacementOwnerId)
                await tx
                    .update(chats)
                    .set({ ownerUserId: replacementOwnerId })
                    .where(and(eq(chats.id, input.chatId), eq(chats.ownerUserId, input.userId)));
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async updateTopic(
        actorUserId: string,
        chatId: string,
        topic: string | undefined,
    ): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, actorUserId, chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct messages do not have topics");
            const mutation = await this.advanceChat(
                tx,
                actorUserId,
                chatId,
                "chat.topicChanged",
                chatId,
            );
            await tx
                .update(chats)
                .set({ topic: topic ?? null, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(chats.id, chatId));
            const chat = await this.requireChatManagerDb(tx, actorUserId, chatId);
            return { chat, hint: chatHint(mutation.sequence, chatId, mutation.pts) };
        });
    }

    async joinPublicChannel(
        actorUserId: string,
        chatId: string,
    ): Promise<{ chat: ChatSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, actorUserId, chatId, false);
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
            await tx
                .insert(chatMembers)
                .values({
                    chatId,
                    userId: actorUserId,
                    role: "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: "member",
                        membershipEpoch: sql`excluded.membership_epoch`,
                        syncSequence: sql`excluded.sync_sequence`,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                    },
                });
            const chat = await this.chatAccessDb(tx, actorUserId, chatId, false);
            if (!chat) throw new Error("Joined chat is not readable");
            return { chat, hint: chatHint(sequence, chatId, mutation.pts) };
        });
    }

    async leaveChannel(actorUserId: string, chatId: string): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, actorUserId, chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "This chat's membership is fixed");
            if (access.membershipRole === "owner") {
                const [otherOwner] = await tx
                    .select({ userId: chatMembers.userId })
                    .from(chatMembers)
                    .where(
                        and(
                            eq(chatMembers.chatId, chatId),
                            ne(chatMembers.userId, actorUserId),
                            isNull(chatMembers.leftAt),
                            eq(chatMembers.role, "owner"),
                        ),
                    )
                    .orderBy(chatMembers.joinedAt, chatMembers.userId)
                    .limit(1);
                if (!otherOwner)
                    throw new CollaborationError(
                        "conflict",
                        "Transfer channel ownership before leaving",
                    );
                await tx
                    .update(chats)
                    .set({ ownerUserId: otherOwner.userId })
                    .where(and(eq(chats.id, chatId), eq(chats.ownerUserId, actorUserId)));
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
            await tx
                .update(chatMembers)
                .set({ leftAt: sql`CURRENT_TIMESTAMP`, syncSequence: sequence })
                .where(
                    and(
                        eq(chatMembers.chatId, chatId),
                        eq(chatMembers.userId, actorUserId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            return { hint: chatHint(sequence, chatId, mutation.pts) };
        });
    }

    async addChannelMember(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role?: ChatRole;
    }): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message membership is fixed");
            if (
                input.role === "owner" &&
                !access.isServerAdmin &&
                access.membershipRole !== "owner"
            )
                throw new CollaborationError("forbidden", "Only an owner can assign ownership");
            const identityKind = await this.requireActiveIdentityDb(tx, input.userId);
            if (identityKind === "agent") {
                if (input.role && input.role !== "member")
                    throw new CollaborationError("invalid", "Agents cannot have channel roles");
            }
            const [existing] = await tx
                .select({ leftAt: chatMembers.leftAt })
                .from(chatMembers)
                .where(
                    and(eq(chatMembers.chatId, input.chatId), eq(chatMembers.userId, input.userId)),
                )
                .limit(1);
            if (existing && existing.leftAt === null)
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
            await tx
                .insert(chatMembers)
                .values({
                    chatId: input.chatId,
                    userId: input.userId,
                    role: input.role ?? "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        role: sql`excluded.role`,
                        membershipEpoch: sql`excluded.membership_epoch`,
                        syncSequence: sql`excluded.sync_sequence`,
                        joinedAt: sql`CURRENT_TIMESTAMP`,
                        leftAt: null,
                    },
                });
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async removeChannelMember(input: {
        actorUserId: string;
        chatId: string;
        userId: string;
    }): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const access = await this.requireChatManagerDb(tx, input.actorUserId, input.chatId);
            if (access.kind === "dm")
                throw new CollaborationError("invalid", "Direct-message membership is fixed");
            const [member] = await tx
                .select({ role: chatMembers.role })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .limit(1);
            if (!member) throw new CollaborationError("not_found", "Member was not found");
            if (member.role === "owner" && !access.isServerAdmin)
                throw new CollaborationError(
                    "forbidden",
                    "Only a server admin can remove an owner",
                );
            if (member.role === "owner") {
                const [otherOwner] = await tx
                    .select({ userId: chatMembers.userId })
                    .from(chatMembers)
                    .where(
                        and(
                            eq(chatMembers.chatId, input.chatId),
                            ne(chatMembers.userId, input.userId),
                            isNull(chatMembers.leftAt),
                            eq(chatMembers.role, "owner"),
                        ),
                    )
                    .orderBy(chatMembers.joinedAt, chatMembers.userId)
                    .limit(1);
                let replacementOwnerId = otherOwner?.userId;
                if (!replacementOwnerId) {
                    const [successor] = await tx
                        .select({ userId: chatMembers.userId })
                        .from(chatMembers)
                        .where(
                            and(
                                eq(chatMembers.chatId, input.chatId),
                                ne(chatMembers.userId, input.userId),
                                isNull(chatMembers.leftAt),
                            ),
                        )
                        .orderBy(
                            sql`case ${chatMembers.role} when 'admin' then 0 else 1 end`,
                            chatMembers.joinedAt,
                            chatMembers.userId,
                        )
                        .limit(1);
                    if (!successor)
                        throw new CollaborationError(
                            "conflict",
                            "The last channel owner cannot be removed",
                        );
                    await tx
                        .update(chatMembers)
                        .set({ role: "owner", updatedAt: sql`CURRENT_TIMESTAMP` })
                        .where(
                            and(
                                eq(chatMembers.chatId, input.chatId),
                                eq(chatMembers.userId, successor.userId),
                            ),
                        );
                    replacementOwnerId = successor.userId;
                }
                await tx
                    .update(chats)
                    .set({ ownerUserId: replacementOwnerId })
                    .where(and(eq(chats.id, input.chatId), eq(chats.ownerUserId, input.userId)));
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
            await tx
                .update(chatMembers)
                .set({ leftAt: sql`CURRENT_TIMESTAMP`, syncSequence: sequence })
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            await tx
                .delete(agentRigBindings)
                .where(
                    and(
                        eq(agentRigBindings.chatId, input.chatId),
                        eq(agentRigBindings.userId, input.userId),
                    ),
                );
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async setStar(
        actorUserId: string,
        chatId: string,
        starred: boolean,
    ): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            if (!(await this.chatAccessDb(tx, actorUserId, chatId, false)))
                throw new CollaborationError("not_found", "Chat was not found");
            const sequence = await this.nextSequence(tx);
            const [maxOrder] = starred
                ? await tx
                      .select({
                          nextOrder: sql<number>`coalesce(max(${userChatPreferences.sortOrder}), -1) + 1`,
                      })
                      .from(userChatPreferences)
                      .where(
                          and(
                              eq(userChatPreferences.userId, actorUserId),
                              eq(userChatPreferences.starred, 1),
                          ),
                      )
                : [{ nextOrder: 0 }];
            const nextOrder = maxOrder?.nextOrder ?? 0;
            await tx
                .insert(userChatPreferences)
                .values({
                    userId: actorUserId,
                    chatId,
                    starred: starred ? 1 : 0,
                    sortOrder: nextOrder,
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [userChatPreferences.userId, userChatPreferences.chatId],
                    set: {
                        starred: starred ? 1 : 0,
                        sortOrder: nextOrder,
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
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
        return this.writeDb(async (tx) => {
            const starred = await tx
                .select({ chatId: userChatPreferences.chatId })
                .from(userChatPreferences)
                .where(
                    and(
                        eq(userChatPreferences.userId, actorUserId),
                        eq(userChatPreferences.starred, 1),
                    ),
                )
                .orderBy(userChatPreferences.sortOrder, userChatPreferences.chatId);
            const current = starred.map((row) => row.chatId).sort();
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
                await tx
                    .update(userChatPreferences)
                    .set({ sortOrder, syncSequence: sequence, updatedAt: sql`CURRENT_TIMESTAMP` })
                    .where(
                        and(
                            eq(userChatPreferences.userId, actorUserId),
                            eq(userChatPreferences.chatId, chatId),
                            eq(userChatPreferences.starred, 1),
                        ),
                    );
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
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            const targetConditions = and(
                eq(messages.chatId, input.chatId),
                isNull(messages.deletedAt),
                or(
                    isNull(messages.expiresAt),
                    sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                ),
                ...(input.messageId ? [eq(messages.id, input.messageId)] : []),
            );
            const [target] = await tx
                .select({
                    id: messages.id,
                    sequence: messages.sequence,
                    changePts: messages.changePts,
                })
                .from(messages)
                .where(targetConditions)
                .orderBy(desc(messages.sequence))
                .limit(1);
            const targetSequence = target?.sequence ?? 0;
            const targetPts = target?.changePts ?? 0;
            const sequence = await this.nextSequence(tx);
            const receiptMutation = target
                ? await this.advanceChatWithSequence(
                      tx,
                      sequence,
                      input.actorUserId,
                      input.chatId,
                      "receipt.read",
                      target.id,
                  )
                : undefined;
            const receiptMessages = await tx
                .select({ messageId: messages.id })
                .from(messages)
                .where(
                    and(
                        eq(messages.chatId, input.chatId),
                        lte(messages.sequence, targetSequence),
                        isNull(messages.deletedAt),
                        or(
                            isNull(messages.senderUserId),
                            ne(messages.senderUserId, input.actorUserId),
                        ),
                    ),
                );
            if (receiptMessages.length)
                await tx
                    .insert(messageReceipts)
                    .values(
                        receiptMessages.map(({ messageId }) => ({
                            messageId,
                            userId: input.actorUserId,
                            deliveredAt: sql`CURRENT_TIMESTAMP`,
                            readAt: sql`CURRENT_TIMESTAMP`,
                        })),
                    )
                    .onConflictDoUpdate({
                        target: [messageReceipts.messageId, messageReceipts.userId],
                        set: {
                            deliveredAt: sql`coalesce(${messageReceipts.deliveredAt}, CURRENT_TIMESTAMP)`,
                            readAt: sql`coalesce(${messageReceipts.readAt}, CURRENT_TIMESTAMP)`,
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
            await tx
                .update(messages)
                .set({
                    firstReadAt: sql`coalesce(${messages.firstReadAt}, CURRENT_TIMESTAMP)`,
                    expiresAt: sql`case when ${messages.expiresAt} is null or datetime(${messages.expiresAt}) > datetime('now', '+' || ${messages.selfDestructSeconds} || ' seconds') then strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${messages.selfDestructSeconds} || ' seconds') else ${messages.expiresAt} end`,
                })
                .where(
                    and(
                        eq(messages.chatId, input.chatId),
                        lte(messages.sequence, targetSequence),
                        isNull(messages.deletedAt),
                        or(
                            isNull(messages.senderUserId),
                            ne(messages.senderUserId, input.actorUserId),
                        ),
                        eq(messages.expiryMode, "after_read"),
                        sql`${messages.selfDestructSeconds} IS NOT NULL`,
                        or(
                            eq(messages.afterReadScope, "any_reader"),
                            sql`not exists (select 1 from chat_members cm where cm.chat_id = ${messages.chatId} and cm.left_at is null and (${messages.senderUserId} is null or cm.user_id != ${messages.senderUserId}) and not exists (select 1 from message_receipts mr where mr.message_id = ${messages.id} and mr.user_id = cm.user_id and mr.read_at is not null))`,
                        ),
                    ),
                );
            const expiringIds = tx
                .select({ id: messages.id })
                .from(messages)
                .where(
                    and(
                        eq(messages.chatId, input.chatId),
                        lte(messages.sequence, targetSequence),
                        eq(messages.expiryMode, "after_read"),
                        sql`${messages.expiresAt} IS NOT NULL`,
                    ),
                );
            await tx
                .update(messageReceipts)
                .set({
                    expiryTriggeredAt: sql`coalesce(${messageReceipts.expiryTriggeredAt}, CURRENT_TIMESTAMP)`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(messageReceipts.userId, input.actorUserId),
                        sql`${messageReceipts.readAt} IS NOT NULL`,
                        inArray(messageReceipts.messageId, expiringIds),
                    ),
                );
            await tx
                .update(chatMembers)
                .set({
                    lastReadMessageId: target?.id ?? null,
                    lastReadSequence: sql`max(${chatMembers.lastReadSequence}, ${targetSequence})`,
                    lastReadPts: sql`max(${chatMembers.lastReadPts}, ${targetPts})`,
                    lastReadAt: sql`CURRENT_TIMESTAMP`,
                    unreadCount: sql`(select count(*) from messages m where m.chat_id = ${input.chatId} and m.sequence > ${targetSequence} and m.deleted_at is null and (m.sender_user_id is null or m.sender_user_id != ${input.actorUserId}) and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP))`,
                    mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.chat_id = ${input.chatId} and m.sequence > ${targetSequence} and mm.mentioned_user_id = ${input.actorUserId} and m.deleted_at is null)`,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.userId, input.actorUserId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.chatRead",
                entityId: input.chatId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            if (target && receiptMutation)
                await tx
                    .update(messages)
                    .set({ changePts: receiptMutation.pts, updatedAt: sql`CURRENT_TIMESTAMP` })
                    .where(eq(messages.id, target.id));
            const chat = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
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
        return this.writeDb(async (tx) => {
            if (!(await this.chatAccessDb(tx, input.actorUserId, input.chatId, false)))
                throw new CollaborationError("not_found", "Chat was not found");
            const sequence = await this.nextSequence(tx);
            await tx
                .insert(userChatPreferences)
                .values({
                    userId: input.actorUserId,
                    chatId: input.chatId,
                    notificationLevel: input.notificationLevel ?? "all",
                    mutedUntil: input.mutedUntil ?? null,
                    notifyThreadReplies: input.notifyThreadReplies === false ? 0 : 1,
                    showMessagePreviews: input.showMessagePreviews === false ? 0 : 1,
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [userChatPreferences.userId, userChatPreferences.chatId],
                    set: {
                        ...(input.notificationLevel === undefined
                            ? {}
                            : { notificationLevel: input.notificationLevel }),
                        ...(input.mutedUntil === undefined ? {} : { mutedUntil: input.mutedUntil }),
                        ...(input.notifyThreadReplies === undefined
                            ? {}
                            : { notifyThreadReplies: input.notifyThreadReplies ? 1 : 0 }),
                        ...(input.showMessagePreviews === undefined
                            ? {}
                            : { showMessagePreviews: input.showMessagePreviews ? 1 : 0 }),
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "preferences.notificationsChanged",
                entityId: input.chatId,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            const chat = await this.chatAccessDb(tx, input.actorUserId, input.chatId, false);
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
        await this.requireActiveUserDb(this.db, userId);
        const [row] = await this.db
            .select({
                direct_messages: userNotificationPreferences.directMessages,
                mentions: userNotificationPreferences.mentions,
                thread_replies: userNotificationPreferences.threadReplies,
                reactions: userNotificationPreferences.reactions,
                calls: userNotificationPreferences.calls,
                email_notifications: userNotificationPreferences.emailNotifications,
                desktop_notifications: userNotificationPreferences.desktopNotifications,
                dnd_start_minutes: userNotificationPreferences.dndStartMinutes,
                dnd_end_minutes: userNotificationPreferences.dndEndMinutes,
                timezone: userNotificationPreferences.timezone,
            })
            .from(userNotificationPreferences)
            .where(eq(userNotificationPreferences.userId, userId))
            .limit(1);
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
        const sequence = await this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            const syncSequence = await this.nextSequence(tx);
            await tx
                .insert(userNotificationPreferences)
                .values({ userId: input.actorUserId, syncSequence })
                .onConflictDoNothing();
            await tx
                .update(userNotificationPreferences)
                .set({
                    ...(input.directMessages === undefined
                        ? {}
                        : { directMessages: input.directMessages }),
                    ...(input.mentions === undefined ? {} : { mentions: input.mentions }),
                    ...(input.threadReplies === undefined
                        ? {}
                        : { threadReplies: input.threadReplies }),
                    ...(input.reactions === undefined ? {} : { reactions: input.reactions }),
                    ...(input.calls === undefined ? {} : { calls: input.calls }),
                    ...(input.emailNotifications === undefined
                        ? {}
                        : { emailNotifications: input.emailNotifications ? 1 : 0 }),
                    ...(input.desktopNotifications === undefined
                        ? {}
                        : { desktopNotifications: input.desktopNotifications ? 1 : 0 }),
                    ...(input.dndStartMinutes === undefined
                        ? {}
                        : { dndStartMinutes: input.dndStartMinutes }),
                    ...(input.dndEndMinutes === undefined
                        ? {}
                        : { dndEndMinutes: input.dndEndMinutes }),
                    ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
                    syncSequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(userNotificationPreferences.userId, input.actorUserId));
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
        const conditions: SQL[] = [
            eq(notifications.userId, input.userId),
            or(
                isNull(notifications.expiresAt),
                sql`datetime(${notifications.expiresAt}) > CURRENT_TIMESTAMP`,
            )!,
        ];
        if (input.unreadOnly) conditions.push(isNull(notifications.readAt));
        if (input.before) {
            const [cursor] = await this.db
                .select({ createdAt: notifications.createdAt })
                .from(notifications)
                .where(eq(notifications.id, input.before))
                .limit(1);
            if (cursor)
                conditions.push(
                    or(
                        lt(notifications.createdAt, cursor.createdAt),
                        and(
                            eq(notifications.createdAt, cursor.createdAt),
                            lt(notifications.id, input.before),
                        ),
                    )!,
                );
        }
        const result = await this.db
            .select({
                id: notifications.id,
                kind: notifications.kind,
                chat_id: notifications.chatId,
                message_id: notifications.messageId,
                thread_root_message_id: notifications.threadRootMessageId,
                actor_user_id: notifications.actorUserId,
                read_at: notifications.readAt,
                created_at: notifications.createdAt,
            })
            .from(notifications)
            .where(and(...conditions))
            .orderBy(desc(notifications.createdAt), desc(notifications.id))
            .limit(input.limit + 1);
        const hasMore = result.length > input.limit;
        const rows = result.slice(0, input.limit);
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
        return this.writeDb(async (tx) => {
            const ids = [...new Set(input.notificationIds ?? [])];
            if (!input.all && ids.length === 0)
                throw new CollaborationError("invalid", "Notification ids or all=true is required");
            const sequence = await this.nextSequence(tx);
            const conditions = [
                eq(notifications.userId, input.actorUserId),
                isNull(notifications.readAt),
            ];
            if (!input.all) conditions.push(inArray(notifications.id, ids));
            await tx
                .update(notifications)
                .set({ readAt: sql`CURRENT_TIMESTAMP` })
                .where(and(...conditions));
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
        const root = alias(messages, "root");
        const conditions: SQL[] = [
            or(
                eq(threadUserStates.userId, input.userId),
                eq(threadParticipants.userId, input.userId),
                eq(root.senderUserId, input.userId),
            )!,
            isNull(chats.deletedAt),
            or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`)!,
        ];
        if (input.unreadOnly)
            conditions.push(gt(sql`coalesce(${threadUserStates.unreadCount}, 0)`, 0));
        if (input.before) {
            const [cursor] = await this.db
                .select({ updatedAt: threads.updatedAt })
                .from(threads)
                .where(eq(threads.rootMessageId, input.before))
                .limit(1);
            if (cursor)
                conditions.push(
                    or(
                        lt(threads.updatedAt, cursor.updatedAt),
                        and(
                            eq(threads.updatedAt, cursor.updatedAt),
                            lt(threads.rootMessageId, input.before),
                        ),
                    )!,
                );
        }
        const result = await this.db
            .selectDistinct({
                root_message_id: threads.rootMessageId,
                reply_count: threads.replyCount,
                participant_count: threads.participantCount,
                last_reply_message_id: threads.lastReplyMessageId,
                last_reply_sequence: threads.lastReplySequence,
                updated_at: threads.updatedAt,
                subscribed: sql<number>`coalesce(${threadUserStates.subscribed}, 0)`,
                unread_count: sql<number>`coalesce(${threadUserStates.unreadCount}, 0)`,
                mention_count: sql<number>`coalesce(${threadUserStates.mentionCount}, 0)`,
            })
            .from(threads)
            .innerJoin(root, eq(root.id, threads.rootMessageId))
            .innerJoin(chats, eq(chats.id, threads.chatId))
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .leftJoin(
                threadUserStates,
                and(
                    eq(threadUserStates.threadRootMessageId, threads.rootMessageId),
                    eq(threadUserStates.userId, input.userId),
                ),
            )
            .leftJoin(
                threadParticipants,
                and(
                    eq(threadParticipants.threadRootMessageId, threads.rootMessageId),
                    eq(threadParticipants.userId, input.userId),
                ),
            )
            .where(and(...conditions))
            .orderBy(desc(threads.updatedAt), desc(threads.rootMessageId))
            .limit(input.limit + 1);
        const hasMore = result.length > input.limit;
        const rows = result.slice(0, input.limit);
        const summaries: ThreadSummary[] = [];
        for (const row of rows) {
            const root = await this.getMessageProjectionDb(
                this.db,
                input.userId,
                text(row.root_message_id),
            );
            if (!root) continue;
            summaries.push({
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
            threads: summaries,
            nextCursor: hasMore ? optionalText(rows.at(-1)?.root_message_id) : undefined,
        };
    }

    async setThreadSubscription(input: {
        actorUserId: string;
        threadRootMessageId: string;
        subscribed: boolean;
        notificationLevel?: NotificationLevel;
    }): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const root = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.threadRootMessageId,
            );
            if (!root || root.deletedAt)
                throw new CollaborationError("not_found", "Thread was not found");
            const [thread] = await tx
                .select({ id: threads.rootMessageId })
                .from(threads)
                .where(eq(threads.rootMessageId, input.threadRootMessageId))
                .limit(1);
            if (!thread) throw new CollaborationError("not_found", "Thread was not found");
            const sequence = await this.nextSequence(tx);
            await tx
                .insert(threadUserStates)
                .values({
                    threadRootMessageId: input.threadRootMessageId,
                    userId: input.actorUserId,
                    subscribed: input.subscribed ? 1 : 0,
                    notificationLevel: input.notificationLevel ?? "all",
                })
                .onConflictDoUpdate({
                    target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                    set: {
                        subscribed: input.subscribed ? 1 : 0,
                        ...(input.notificationLevel === undefined
                            ? {}
                            : { notificationLevel: input.notificationLevel }),
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
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
        return this.writeDb(async (tx) => {
            const root = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.threadRootMessageId,
            );
            if (!root) throw new CollaborationError("not_found", "Thread was not found");
            const [target] = await tx
                .select({ id: messages.id, sequence: messages.sequence })
                .from(messages)
                .where(
                    and(
                        eq(messages.threadRootMessageId, input.threadRootMessageId),
                        isNull(messages.deletedAt),
                        ...(input.messageId ? [eq(messages.id, input.messageId)] : []),
                    ),
                )
                .orderBy(desc(messages.sequence))
                .limit(1);
            const targetSequence = target?.sequence ?? 0;
            const sequence = await this.nextSequence(tx);
            await tx
                .insert(threadUserStates)
                .values({
                    threadRootMessageId: input.threadRootMessageId,
                    userId: input.actorUserId,
                    subscribed: 1,
                    lastReadMessageId: target?.id ?? null,
                    lastReadSequence: targetSequence,
                    unreadCount: 0,
                    mentionCount: 0,
                })
                .onConflictDoUpdate({
                    target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                    set: {
                        lastReadMessageId: target?.id ?? null,
                        lastReadSequence: sql`max(${threadUserStates.lastReadSequence}, ${targetSequence})`,
                        unreadCount: sql`(select count(*) from messages m where m.thread_root_message_id = ${input.threadRootMessageId} and m.sequence > ${targetSequence} and m.deleted_at is null)`,
                        mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.thread_root_message_id = ${input.threadRootMessageId} and m.sequence > ${targetSequence} and mm.mentioned_user_id = ${input.actorUserId} and m.deleted_at is null)`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
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
        if (!(await this.chatAccessDb(this.db, userId, chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.db
            .select({
                id: chatPins.id,
                message_id: chatPins.messageId,
                pinned_by_user_id: chatPins.pinnedByUserId,
                created_at: chatPins.createdAt,
            })
            .from(chatPins)
            .where(eq(chatPins.chatId, chatId))
            .orderBy(desc(chatPins.createdAt), desc(chatPins.id));
        const pins: ChatPinSummary[] = [];
        for (const row of result) {
            const message = await this.getMessageProjectionDb(
                this.db,
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
        return this.writeDb(async (tx) => {
            const message = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.messageId,
            );
            if (!message || message.deletedAt)
                throw new CollaborationError("not_found", "Message was not found");
            const access = await this.chatAccessDb(tx, input.actorUserId, message.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Message was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestrictedDb(tx, input.actorUserId, message.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            const [existing] = await tx
                .select({ id: chatPins.id, pinnedByUserId: chatPins.pinnedByUserId })
                .from(chatPins)
                .where(
                    and(
                        eq(chatPins.chatId, message.chatId),
                        eq(chatPins.messageId, input.messageId),
                    ),
                )
                .limit(1);
            if (Boolean(existing) === input.pinned)
                throw new CollaborationError(
                    "conflict",
                    input.pinned ? "Message is already pinned" : "Message is not pinned",
                );
            if (
                !input.pinned &&
                existing?.pinnedByUserId !== input.actorUserId &&
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
                await tx.insert(chatPins).values({
                    id: createId(),
                    chatId: message.chatId,
                    messageId: input.messageId,
                    pinnedByUserId: input.actorUserId,
                });
            else
                await tx
                    .delete(chatPins)
                    .where(
                        and(
                            eq(chatPins.chatId, message.chatId),
                            eq(chatPins.messageId, input.messageId),
                        ),
                    );
            return { hint: chatHint(sequence, message.chatId, mutation.pts) };
        });
    }

    async listChatBookmarks(userId: string, chatId: string): Promise<ChatBookmarkSummary[]> {
        if (!(await this.chatAccessDb(this.db, userId, chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const result = await this.db
            .select({
                id: chatBookmarks.id,
                kind: chatBookmarks.kind,
                title: chatBookmarks.title,
                url: chatBookmarks.url,
                message_id: chatBookmarks.messageId,
                file_id: chatBookmarks.fileId,
                emoji: chatBookmarks.emoji,
                created_by_user_id: chatBookmarks.createdByUserId,
                sort_order: chatBookmarks.sortOrder,
                created_at: chatBookmarks.createdAt,
            })
            .from(chatBookmarks)
            .where(eq(chatBookmarks.chatId, chatId))
            .orderBy(chatBookmarks.sortOrder, chatBookmarks.id);
        return result.map((row) => ({
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
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (input.kind === "message")
                await this.requireMessageInChatDb(tx, input.messageId!, input.chatId);
            if (
                input.kind === "file" &&
                !(await this.canAccessFileWithDb(tx, input.actorUserId, input.fileId!))
            )
                throw new CollaborationError("not_found", "File was not found");
            const id = createId();
            const [next] = await tx
                .select({ order: sql<number>`coalesce(max(${chatBookmarks.sortOrder}), -1) + 1` })
                .from(chatBookmarks)
                .where(eq(chatBookmarks.chatId, input.chatId));
            const order = next?.order ?? 0;
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                input.chatId,
                "bookmark.created",
                id,
            );
            await tx.insert(chatBookmarks).values({
                id,
                chatId: input.chatId,
                kind: input.kind,
                title: input.title,
                url: input.url,
                messageId: input.messageId,
                fileId: input.fileId,
                emoji: input.emoji,
                sortOrder: order,
                createdByUserId: input.actorUserId,
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
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            const [bookmark] = await tx
                .select({ createdByUserId: chatBookmarks.createdByUserId })
                .from(chatBookmarks)
                .where(
                    and(
                        eq(chatBookmarks.id, input.bookmarkId),
                        eq(chatBookmarks.chatId, input.chatId),
                    ),
                )
                .limit(1);
            if (!bookmark) throw new CollaborationError("not_found", "Bookmark was not found");
            if (
                bookmark.createdByUserId !== input.actorUserId &&
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
            await tx
                .delete(chatBookmarks)
                .where(
                    and(
                        eq(chatBookmarks.id, input.bookmarkId),
                        eq(chatBookmarks.chatId, input.chatId),
                    ),
                );
            return { hint: chatHint(sequence, input.chatId, mutation.pts) };
        });
    }

    async sendMessage(
        input: SendMessageRepositoryInput,
    ): Promise<{ message: MessageSummary; hint: MutationHint }> {
        return this.writeDb((tx) => this.sendMessageDb(tx, input));
    }

    private async sendMessageDb(
        tx: DrizzleTransaction,
        input: SendMessageDbInput,
    ): Promise<{ message: MessageSummary; hint: MutationHint }> {
        const scope = `message.send:${input.chatId}`;
        return (async () => {
            if (input.kind === "automated" && !input.agentSessionId) {
                await this.requireServerAdminDb(tx, input.actorUserId);
                if (
                    input.senderBotId &&
                    !(
                        await tx
                            .select({ id: botIdentities.id })
                            .from(botIdentities)
                            .where(
                                and(
                                    eq(botIdentities.id, input.senderBotId),
                                    eq(botIdentities.active, 1),
                                    isNull(botIdentities.deletedAt),
                                ),
                            )
                            .limit(1)
                    )[0]
                )
                    throw new CollaborationError("not_found", "Bot identity was not found");
            }
            if (input.clientMutationId) {
                const previous = await this.findClientMutationDb(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                );
                if (previous) {
                    const message = await this.getMessageProjectionDb(
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
                input.kind === "automated" && !input.agentSessionId
                    ? await this.requireChatManagerDb(tx, input.actorUserId, input.chatId)
                    : await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (input.agentTurn) {
                if (
                    input.kind === "automated" ||
                    input.threadRootMessageId ||
                    access.kind !== "dm" ||
                    access.dmType !== "direct"
                )
                    throw new CollaborationError(
                        "invalid",
                        "Agent turns are only supported for top-level direct messages",
                    );
                const [binding] = await tx
                    .select({ userId: agentRigBindings.userId })
                    .from(agentRigBindings)
                    .innerJoin(
                        chatMembers,
                        and(
                            eq(chatMembers.chatId, agentRigBindings.chatId),
                            eq(chatMembers.userId, agentRigBindings.userId),
                        ),
                    )
                    .innerJoin(users, eq(users.id, agentRigBindings.userId))
                    .where(
                        and(
                            eq(agentRigBindings.chatId, input.chatId),
                            eq(agentRigBindings.userId, input.agentTurn.agentUserId),
                            eq(agentRigBindings.sessionId, input.agentTurn.sessionId),
                            isNull(chatMembers.leftAt),
                            isNull(users.deletedAt),
                            eq(users.kind, "agent"),
                        ),
                    )
                    .limit(1);
                if (!binding)
                    throw new CollaborationError(
                        "conflict",
                        "Agent direct message is not ready for inference",
                    );
            }
            let senderUserId = input.kind === "automated" ? undefined : input.actorUserId;
            if (input.agentSessionId) {
                const [agent] = await tx
                    .select({ userId: agentRigBindings.userId })
                    .from(agentRigBindings)
                    .where(
                        and(
                            eq(agentRigBindings.chatId, input.chatId),
                            eq(agentRigBindings.sessionId, input.agentSessionId),
                        ),
                    )
                    .limit(1);
                if (!agent)
                    throw new CollaborationError(
                        "forbidden",
                        "Agent session does not own this chat",
                    );
                senderUserId = agent.userId;
            }
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestrictedDb(tx, input.actorUserId, input.chatId))
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
                const [defaults] = await tx
                    .select({
                        defaultRetentionMode: serverSettings.defaultRetentionMode,
                        defaultRetentionSeconds: serverSettings.defaultRetentionSeconds,
                    })
                    .from(serverSettings)
                    .where(eq(serverSettings.id, 1));
                retentionSeconds =
                    defaults?.defaultRetentionMode === "duration"
                        ? (defaults.defaultRetentionSeconds ?? undefined)
                        : undefined;
            } else if (access.retentionMode === "forever") retentionSeconds = undefined;
            const retentionAt = retentionSeconds
                ? new Date(Date.now() + retentionSeconds * 1_000).toISOString()
                : null;
            const expiresAt = earliestDate(selfDestructAt, retentionAt);
            if (input.quotedMessageId)
                await this.requireMessageInChatDb(tx, input.quotedMessageId, input.chatId);
            if (input.forwardedFromMessageId) {
                const source = await this.getMessageProjectionDb(
                    tx,
                    input.actorUserId,
                    input.forwardedFromMessageId,
                );
                if (!source || source.deletedAt)
                    throw new CollaborationError("not_found", "Source message was not found");
            }
            if (input.threadRootMessageId) {
                const root = await this.requireMessageInChatDb(
                    tx,
                    input.threadRootMessageId,
                    input.chatId,
                );
                if (root.threadRootMessageId)
                    throw new CollaborationError("invalid", "Threads cannot be nested");
            }
            const fileIds = [...new Set(input.attachmentFileIds ?? [])];
            for (const fileId of fileIds)
                if (!(await this.canAccessFileWithDb(tx, input.actorUserId, fileId)))
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
            await tx.insert(messages).values({
                id,
                chatId: input.chatId,
                sequence: mutation.messageSequence,
                changePts: mutation.pts,
                senderUserId,
                kind: input.kind ?? "user",
                text: input.text,
                quotedMessageId: input.quotedMessageId,
                threadRootMessageId: input.threadRootMessageId,
                forwardedFromMessageId: input.forwardedFromMessageId,
                expiresAt,
                expiryMode,
                selfDestructSeconds,
                afterReadScope: input.afterReadScope ?? access.defaultAfterReadScope,
                senderBotId: input.senderBotId,
                publishedAt: input.deferPublication ? null : sql`CURRENT_TIMESTAMP`,
            });
            if (input.agentTurn)
                await tx.insert(agentTurns).values({
                    userMessageId: id,
                    agentUserId: input.agentTurn.agentUserId,
                    chatId: input.chatId,
                    sessionId: input.agentTurn.sessionId,
                });
            const mentions = input.deferPublication
                ? { notifyAll: false, userIds: [] }
                : await this.replaceMessageMentionsDb(tx, id, input.text);
            if (!input.deferPublication)
                await this.indexMessageForSearchDb(tx, id, input.chatId, input.text, 1);
            if (fileIds.length)
                await tx
                    .insert(messageAttachments)
                    .values(
                        fileIds.map((fileId, position) => ({ messageId: id, fileId, position })),
                    );
            if (input.threadRootMessageId) {
                await tx
                    .insert(threads)
                    .values({
                        rootMessageId: input.threadRootMessageId,
                        chatId: input.chatId,
                        createdByUserId: input.actorUserId,
                        replyCount: 1,
                        lastPts: mutation.pts,
                        lastReplyMessageId: id,
                        lastReplySequence: mutation.messageSequence,
                        participantCount: 1,
                    })
                    .onConflictDoUpdate({
                        target: threads.rootMessageId,
                        set: {
                            replyCount: sql`${threads.replyCount} + 1`,
                            lastPts: mutation.pts,
                            lastReplyMessageId: id,
                            lastReplySequence: mutation.messageSequence,
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
                await tx
                    .insert(threadParticipants)
                    .values({
                        threadRootMessageId: input.threadRootMessageId,
                        userId: input.actorUserId,
                        replyCount: 1,
                    })
                    .onConflictDoUpdate({
                        target: [threadParticipants.threadRootMessageId, threadParticipants.userId],
                        set: {
                            replyCount: sql`${threadParticipants.replyCount} + 1`,
                            lastParticipatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
                await tx
                    .update(threads)
                    .set({
                        participantCount: sql`(select count(*) from thread_participants where thread_root_message_id = ${input.threadRootMessageId})`,
                    })
                    .where(eq(threads.rootMessageId, input.threadRootMessageId));
                await tx
                    .update(messages)
                    .set({ changePts: mutation.pts })
                    .where(eq(messages.id, input.threadRootMessageId));
            }
            if (!input.deferPublication)
                await this.recordMessageDeliveryDb(tx, {
                    actorUserId: input.actorUserId,
                    chat: access,
                    messageId: id,
                    messageSequence: mutation.messageSequence,
                    threadRootMessageId: input.threadRootMessageId,
                    mentionedUserIds: mentions.userIds,
                    mentionAll: mentions.notifyAll,
                    syncSequence: sequence,
                    senderUserId,
                });
            if (input.clientMutationId)
                await this.storeClientMutationDb(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                    { messageId: id, sequence, pts: mutation.pts },
                );
            const message = await this.getMessageProjectionDb(tx, input.actorUserId, id);
            if (!message) throw new Error("Created message is not readable");
            if (input.kind === "automated")
                await this.appendAuditDb(tx, {
                    actorUserId: input.actorUserId,
                    action: "message.automated_sent",
                    targetType: "message",
                    targetId: id,
                    chatId: input.chatId,
                    after: { botId: input.senderBotId },
                });
            return { message, hint: chatHint(sequence, input.chatId, mutation.pts) };
        })();
    }

    async forwardMessage(input: {
        actorUserId: string;
        messageId: string;
        targetChatIds: string[];
        clientMutationId?: string;
    }): Promise<{ messages: MessageSummary[]; hints: MutationHint[] }> {
        const targetChatIds = [...new Set(input.targetChatIds)];
        const scope = `message.forward:${input.messageId}`;
        return this.writeDb(async (tx) => {
            if (input.clientMutationId) {
                const previous = await this.findClientMutationDb(
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
                        const message = await this.getMessageProjectionDb(
                            tx,
                            input.actorUserId,
                            id,
                        );
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
            const source = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.messageId,
            );
            if (!source || source.deletedAt)
                throw new CollaborationError("not_found", "Source message was not found");
            const destinations = new Map<string, ChatAccess>();
            for (const chatId of targetChatIds) {
                const destination = await this.chatAccessDb(tx, input.actorUserId, chatId, true);
                if (!destination)
                    throw new CollaborationError("not_found", "Destination chat was not found");
                if (destination.archivedAt)
                    throw new CollaborationError("forbidden", "Archived chats are read-only");
                if (await this.isPostingRestrictedDb(tx, input.actorUserId, chatId))
                    throw new CollaborationError(
                        "forbidden",
                        "Posting is restricted by moderation",
                    );
                destinations.set(chatId, destination);
            }
            const sequence = await this.nextSequence(tx);
            const forwardedMessages: MessageSummary[] = [];
            const hints: MutationHint[] = [];
            const messageIds: string[] = [];
            const points: Array<{ chatId: string; pts: number }> = [];
            for (const chatId of targetChatIds) {
                const destination = destinations.get(chatId)!;
                let retentionSeconds = destination.retentionSeconds;
                if (destination.retentionMode === "inherit") {
                    const [defaults] = await tx
                        .select({
                            mode: serverSettings.defaultRetentionMode,
                            seconds: serverSettings.defaultRetentionSeconds,
                        })
                        .from(serverSettings)
                        .where(eq(serverSettings.id, 1));
                    retentionSeconds =
                        defaults?.mode === "duration" ? (defaults.seconds ?? undefined) : undefined;
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
                await tx.insert(messages).values({
                    id,
                    chatId,
                    sequence: mutation.messageSequence,
                    changePts: mutation.pts,
                    senderUserId: input.actorUserId,
                    kind: "user",
                    text: source.text,
                    forwardedFromMessageId: source.id,
                    expiresAt,
                    expiryMode,
                    selfDestructSeconds,
                    afterReadScope: destination.defaultAfterReadScope,
                    publishedAt: sql`CURRENT_TIMESTAMP`,
                });
                await this.indexMessageForSearchDb(tx, id, chatId, source.text, 1);
                await tx.insert(messageForwardMetadata).values({
                    messageId: id,
                    sourceMessageId: source.id,
                    sourceChatId: source.chatId,
                    sourceSenderUserId: source.sender?.id,
                    sourceCreatedAt: source.createdAt,
                    sourceTextSnapshot: source.text,
                    forwardedByUserId: input.actorUserId,
                });
                if (source.attachments.length)
                    await tx.insert(messageAttachments).values(
                        source.attachments.map((file, position) => ({
                            messageId: id,
                            fileId: file.id,
                            position,
                        })),
                    );
                await this.recordMessageDeliveryDb(tx, {
                    actorUserId: input.actorUserId,
                    chat: destination,
                    messageId: id,
                    messageSequence: mutation.messageSequence,
                    mentionedUserIds: [],
                    syncSequence: sequence,
                });
                const message = await this.getMessageProjectionDb(tx, input.actorUserId, id);
                if (!message) throw new Error("Forwarded message is not readable");
                forwardedMessages.push(message);
                messageIds.push(id);
                points.push({ chatId, pts: mutation.pts });
                hints.push(chatHint(sequence, chatId, mutation.pts));
            }
            if (input.clientMutationId)
                await this.storeClientMutationDb(
                    tx,
                    input.actorUserId,
                    scope,
                    input.clientMutationId,
                    { messageIds, sequence, points },
                );
            return { messages: forwardedMessages, hints };
        });
    }

    async getMessage(userId: string, messageId: string): Promise<MessageSummary> {
        const message = await this.getMessageProjectionDb(this.db, userId, messageId);
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
        return this.writeDb(async (tx) => {
            const [row] = await tx
                .select({
                    chatId: messages.chatId,
                    senderUserId: messages.senderUserId,
                    kind: messages.kind,
                    text: messages.text,
                    contentJson: messages.contentJson,
                    revision: messages.revision,
                    deletedAt: messages.deletedAt,
                    expiresAt: messages.expiresAt,
                })
                .from(messages)
                .where(eq(messages.id, input.messageId))
                .limit(1);
            if (!row || row.deletedAt !== null || isPast(row.expiresAt ?? undefined))
                throw new CollaborationError("not_found", "Message was not found");
            const access = await this.chatAccessDb(tx, input.actorUserId, row.chatId, false);
            if (!access) throw new CollaborationError("not_found", "Message was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestrictedDb(tx, input.actorUserId, row.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            if (row.kind !== "user" || row.senderUserId !== input.actorUserId)
                throw new CollaborationError("forbidden", "Cannot edit this message");
            const revision = row.revision;
            if (input.expectedRevision !== undefined && input.expectedRevision !== revision)
                throw new CollaborationError("conflict", "Message was edited by another request");
            if (row.text === input.text)
                throw new CollaborationError("conflict", "Message text is unchanged");
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                input.actorUserId,
                row.chatId,
                "message.edited",
                input.messageId,
            );
            await tx
                .insert(messageRevisions)
                .values({
                    id: createId(),
                    messageId: input.messageId,
                    revision,
                    text: row.text,
                    contentJson: row.contentJson,
                    editedByUserId: input.actorUserId,
                    editReason: input.reason,
                })
                .onConflictDoNothing();
            const nextRevision = revision + 1;
            await tx
                .update(messages)
                .set({
                    text: input.text,
                    revision: nextRevision,
                    editedAt: sql`CURRENT_TIMESTAMP`,
                    editedByUserId: input.actorUserId,
                    editReason: input.reason ?? null,
                    changePts: mutation.pts,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(messages.id, input.messageId));
            await tx.insert(messageRevisions).values({
                id: createId(),
                messageId: input.messageId,
                revision: nextRevision,
                text: input.text,
                contentJson: null,
                editedByUserId: input.actorUserId,
                editReason: input.reason,
            });
            await this.replaceMessageMentionsDb(tx, input.messageId, input.text);
            await this.indexMessageForSearchDb(
                tx,
                input.messageId,
                row.chatId,
                input.text,
                nextRevision,
            );
            const message = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.messageId,
            );
            if (!message) throw new Error("Edited message is not readable");
            return {
                message,
                hint: chatHint(sequence, row.chatId, mutation.pts),
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
        const message = await this.getMessageProjectionDb(this.db, userId, messageId);
        if (!message || message.deletedAt)
            throw new CollaborationError("not_found", "Message was not found");
        const result = await this.db
            .select({
                revision: messageRevisions.revision,
                text: messageRevisions.text,
                edited_by_user_id: messageRevisions.editedByUserId,
                edit_reason: messageRevisions.editReason,
                created_at: messageRevisions.createdAt,
            })
            .from(messageRevisions)
            .where(eq(messageRevisions.messageId, messageId))
            .orderBy(desc(messageRevisions.revision));
        return result.map((row) => ({
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
        const chat = await this.chatAccessDb(this.db, input.userId, input.chatId, false);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        const conditions: SQL[] = [eq(messages.chatId, input.chatId)];
        if (input.threadRootMessageId) {
            conditions.push(eq(messages.threadRootMessageId, input.threadRootMessageId));
        } else conditions.push(isNull(messages.threadRootMessageId));
        if (input.beforeSequence !== undefined) {
            conditions.push(lt(messages.sequence, input.beforeSequence));
        }
        if (input.afterSequence !== undefined) {
            conditions.push(gt(messages.sequence, input.afterSequence));
        }
        const ascending = input.afterSequence !== undefined;
        const result = await this.db
            .select({ id: messages.id })
            .from(messages)
            .where(and(...conditions))
            .orderBy(ascending ? asc(messages.sequence) : desc(messages.sequence))
            .limit(input.limit + 1);
        const hasMore = result.length > input.limit;
        const ids = result.slice(0, input.limit).map((row) => row.id);
        const summaries: MessageSummary[] = [];
        for (const id of ids) {
            const message = await this.getMessageProjectionDb(this.db, input.userId, id);
            if (message) summaries.push(message);
        }
        if (!ascending) summaries.reverse();
        return { messages: summaries, chatPts: chat.pts, hasMore };
    }

    async deleteMessage(
        actorUserId: string,
        messageId: string,
    ): Promise<{ message: MessageSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const [row] = await tx
                .select({
                    chatId: messages.chatId,
                    senderUserId: messages.senderUserId,
                    deletedAt: messages.deletedAt,
                    threadRootMessageId: messages.threadRootMessageId,
                    actorRole: users.role,
                })
                .from(messages)
                .innerJoin(users, eq(users.id, actorUserId))
                .where(eq(messages.id, messageId))
                .limit(1);
            if (!row) throw new CollaborationError("not_found", "Message was not found");
            if (!(await this.chatAccessDb(tx, actorUserId, row.chatId, false)))
                throw new CollaborationError("not_found", "Message was not found");
            if (row.deletedAt !== null)
                throw new CollaborationError("conflict", "Message is already deleted");
            if ((row.senderUserId ?? "") !== actorUserId && row.actorRole !== "admin")
                throw new CollaborationError("forbidden", "Cannot delete this message");
            const chatId = row.chatId;
            const sequence = await this.nextSequence(tx);
            const mutation = await this.advanceChatWithSequence(
                tx,
                sequence,
                actorUserId,
                chatId,
                "message.deleted",
                messageId,
            );
            await tx
                .update(messages)
                .set({
                    text: "",
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    deletedByUserId: actorUserId,
                    changePts: mutation.pts,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)));
            await tx
                .delete(messageSearchDocuments)
                .where(eq(messageSearchDocuments.messageId, messageId));
            await tx.delete(messageRevisions).where(eq(messageRevisions.messageId, messageId));
            await tx.delete(notifications).where(eq(notifications.messageId, messageId));
            if (row.threadRootMessageId) {
                await this.recomputeThreadProjectionDb(tx, row.threadRootMessageId, mutation.pts);
            }
            const message = await this.getMessageProjectionDb(tx, actorUserId, messageId);
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
        return this.writeDb(async (tx) => {
            if (Boolean(input.emoji) === Boolean(input.customEmojiId))
                throw new CollaborationError(
                    "invalid",
                    "Exactly one reaction identifier is required",
                );
            const message = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.messageId,
            );
            if (!message || message.deletedAt)
                throw new CollaborationError("not_found", "Message was not found");
            if (await this.isPostingRestrictedDb(tx, input.actorUserId, message.chatId))
                throw new CollaborationError("forbidden", "Posting is restricted by moderation");
            const reactionKey = input.customEmojiId
                ? `custom:${input.customEmojiId}`
                : `unicode:${input.emoji}`;
            let customEmoji: { name: string; fileId: string } | undefined;
            if (input.customEmojiId) {
                [customEmoji] = await tx
                    .select({ name: customEmojis.name, fileId: customEmojis.fileId })
                    .from(customEmojis)
                    .where(
                        and(
                            eq(customEmojis.id, input.customEmojiId),
                            isNull(customEmojis.deletedAt),
                        ),
                    )
                    .limit(1);
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
                await tx
                    .insert(reactions)
                    .values({
                        messageId: input.messageId,
                        userId: input.actorUserId,
                        reactionKey,
                        emoji: input.emoji,
                        customEmojiId: input.customEmojiId,
                        customEmojiNameSnapshot: customEmoji?.name,
                        customEmojiFileIdSnapshot: customEmoji?.fileId,
                    })
                    .onConflictDoNothing();
            } else {
                await tx
                    .delete(reactions)
                    .where(
                        and(
                            eq(reactions.messageId, input.messageId),
                            eq(reactions.userId, input.actorUserId),
                            eq(reactions.reactionKey, reactionKey),
                        ),
                    );
            }
            const [recipient] = await tx
                .select({ senderUserId: messages.senderUserId })
                .from(messages)
                .where(eq(messages.id, input.messageId));
            const recipientUserId = recipient?.senderUserId ?? undefined;
            const reactionPreference = recipientUserId
                ? (
                      await tx
                          .select({
                              reactions: sql<string>`coalesce(${userNotificationPreferences.reactions}, 'all')`,
                          })
                          .from(userNotificationPreferences)
                          .where(eq(userNotificationPreferences.userId, recipientUserId))
                          .limit(1)
                  )[0]
                : undefined;
            if (
                input.active &&
                recipientUserId &&
                recipientUserId !== input.actorUserId &&
                reactionPreference?.reactions !== "none"
            ) {
                const notificationId = createId();
                await tx.insert(notifications).values({
                    id: notificationId,
                    userId: recipientUserId,
                    kind: "reaction",
                    chatId: message.chatId,
                    messageId: input.messageId,
                    actorUserId: input.actorUserId,
                    payloadJson: JSON.stringify({ reactionKey }),
                    syncSequence: sequence,
                });
                await this.insertSyncEvent(tx, {
                    sequence,
                    kind: "notification.created",
                    entityId: notificationId,
                    actorUserId: input.actorUserId,
                    targetUserId: recipientUserId,
                });
            }
            await tx
                .update(messages)
                .set({ changePts: mutation.pts, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(messages.id, input.messageId));
            const updated = await this.getMessageProjectionDb(
                tx,
                input.actorUserId,
                input.messageId,
            );
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
        const [retention] = await this.db
            .select({ minRecoverableSequence: serverSyncState.minRecoverableSequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        if (input.fromSequence < (retention?.minRecoverableSequence ?? 0))
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
        const page = await this.db
            .selectDistinct({ sequence: syncEvents.sequence })
            .from(syncEvents)
            .where(
                and(gt(syncEvents.sequence, input.fromSequence), lte(syncEvents.sequence, target)),
            )
            .orderBy(asc(syncEvents.sequence))
            .limit(input.limit + 1);
        const sequences = page.map((row) => row.sequence);
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
        const events = await this.db
            .select({
                sequence: syncEvents.sequence,
                kind: syncEvents.kind,
                chat_id: syncEvents.chatId,
                target_user_id: syncEvents.targetUserId,
            })
            .from(syncEvents)
            .where(inArray(syncEvents.sequence, included))
            .orderBy(syncEvents.sequence, syncEvents.id);
        const changedChatIds = new Set<string>();
        const removedChatIds = new Set<string>();
        const areas = new Set<string>();
        for (const event of events) {
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
                const [wasMember] = await this.db
                    .select({ userId: chatMembers.userId })
                    .from(chatMembers)
                    .where(
                        and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, input.userId)),
                    )
                    .limit(1);
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
            else if (kind.startsWith("scheduled.")) areas.add("scheduled-messages");
            else if (kind.startsWith("automation.")) areas.add("automations");
            else if (kind.startsWith("bot.")) areas.add("bots");
            else if (kind.startsWith("integration.")) areas.add("integrations");
            else if (kind.startsWith("presence.")) areas.add("presence");
            else if (kind.startsWith("user.")) areas.add("users");
            else if (kind.startsWith("emoji.")) areas.add("emoji");
            else if (kind.startsWith("server.")) areas.add("server");
            else if (kind.startsWith("agentImage.")) areas.add("agent-images");
            else if (!chatId) areas.add("directories");
        }
        const changedChats: ChatSummary[] = [];
        for (const chatId of changedChatIds) {
            const chat = await this.chatAccessDb(this.db, input.userId, chatId, false);
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
        const [recoverable] = await this.db
            .select({ minRecoverablePts: chats.minRecoverablePts })
            .from(chats)
            .where(eq(chats.id, input.chatId));
        if (input.fromPts < (recoverable?.minRecoverablePts ?? 0))
            return { kind: "tooLong", ...base };
        const result = await this.db
            .select({
                pts: chatUpdates.pts,
                pts_count: chatUpdates.ptsCount,
                kind: chatUpdates.kind,
                entity_id: chatUpdates.entityId,
            })
            .from(chatUpdates)
            .where(
                and(
                    eq(chatUpdates.chatId, input.chatId),
                    gt(chatUpdates.pts, input.fromPts),
                    lte(chatUpdates.pts, target),
                ),
            )
            .orderBy(asc(chatUpdates.pts))
            .limit(input.limit + 1);
        const hasMore = result.length > input.limit;
        const rows = result.slice(0, input.limit);
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
            const message = await this.getMessageProjectionDb(this.db, input.userId, messageId);
            if (!message) continue;
            messages.push(message);
            projectedMessageIds.add(message.id);
            if (
                message.threadRootMessageId &&
                !projectedMessageIds.has(message.threadRootMessageId)
            ) {
                const root = await this.getMessageProjectionDb(
                    this.db,
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
        if ((await dueMessages(this.db, 1)).length === 0) return undefined;
        return this.writeDb(async (tx) => {
            const due = await dueMessages(tx, limit);
            if (due.length === 0) return undefined;
            const sequence = await this.nextSequence(tx);
            const changedChats = new Map<string, number>();
            for (const row of due) {
                const messageId = row.id;
                const chatId = row.chatId;
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    undefined,
                    chatId,
                    "message.expired",
                    messageId,
                );
                const changed = await tx
                    .update(messages)
                    .set({
                        text: "",
                        deletedAt: sql`CURRENT_TIMESTAMP`,
                        changePts: mutation.pts,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
                    .returning({ id: messages.id });
                if (changed.length) {
                    await tx
                        .delete(messageSearchDocuments)
                        .where(eq(messageSearchDocuments.messageId, messageId));
                    await tx
                        .delete(messageRevisions)
                        .where(eq(messageRevisions.messageId, messageId));
                    await tx.delete(notifications).where(eq(notifications.messageId, messageId));
                    const threadRootMessageId = row.threadRootMessageId ?? undefined;
                    if (threadRootMessageId) {
                        await this.recomputeThreadProjectionDb(
                            tx,
                            threadRootMessageId,
                            mutation.pts,
                        );
                        await tx
                            .update(messages)
                            .set({ changePts: mutation.pts })
                            .where(eq(messages.id, threadRootMessageId));
                    }
                    changedChats.set(chatId, mutation.pts);
                }
            }
            return {
                sequence: String(sequence),
                chats: [...changedChats].map(([chatId, pts]) => ({ chatId, pts: String(pts) })),
                areas: [],
            };
        });
    }

    async listContacts(): Promise<UserSummary[]> {
        const result = await this.db
            .select(userSelection)
            .from(users)
            .leftJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    isNull(users.deletedAt),
                    or(
                        eq(users.kind, "agent"),
                        and(
                            eq(users.kind, "human"),
                            eq(accounts.active, 1),
                            isNull(accounts.bannedAt),
                            isNull(accounts.deletedAt),
                        ),
                    ),
                ),
            )
            .orderBy(sql`lower(${users.firstName})`, sql`lower(${users.lastName})`, users.id);
        return result.map(asUser);
    }

    async listPresenceSettings(userIds?: string[]): Promise<PresenceSettingsSummary[]> {
        const ids = userIds ? [...new Set(userIds)] : undefined;
        if (ids?.length === 0) return [];
        const activeStatus = or(
            isNull(userPresenceSettings.statusExpiresAt),
            gt(sql`datetime(${userPresenceSettings.statusExpiresAt})`, sql`CURRENT_TIMESTAMP`),
        );
        const result = await this.db
            .select({
                user_id: userPresenceSettings.userId,
                availability: userPresenceSettings.availability,
                custom_status_text: sql<
                    string | null
                >`case when ${activeStatus} then ${userPresenceSettings.customStatusText} end`,
                custom_status_emoji: sql<
                    string | null
                >`case when ${activeStatus} then ${userPresenceSettings.customStatusEmoji} end`,
                status_expires_at: sql<
                    string | null
                >`case when ${activeStatus} then ${userPresenceSettings.statusExpiresAt} end`,
                dnd_until: sql<
                    string | null
                >`case when ${userPresenceSettings.dndUntil} is not null and datetime(${userPresenceSettings.dndUntil}) > CURRENT_TIMESTAMP then ${userPresenceSettings.dndUntil} end`,
                updated_at: userPresenceSettings.updatedAt,
            })
            .from(userPresenceSettings)
            .where(ids ? inArray(userPresenceSettings.userId, ids) : undefined)
            .orderBy(userPresenceSettings.userId);
        return result.map((row) => ({
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
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            const sequence = await this.nextSequence(tx);
            await tx
                .insert(userPresenceSettings)
                .values({
                    userId: input.actorUserId,
                    availability: input.availability ?? "automatic",
                    customStatusText: input.customStatusText,
                    customStatusEmoji: input.customStatusEmoji,
                    statusExpiresAt: input.statusExpiresAt,
                    dndUntil: input.dndUntil,
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: userPresenceSettings.userId,
                    set: {
                        ...(input.availability === undefined
                            ? {}
                            : { availability: input.availability }),
                        ...(input.customStatusText === undefined
                            ? {}
                            : { customStatusText: input.customStatusText }),
                        ...(input.customStatusEmoji === undefined
                            ? {}
                            : { customStatusEmoji: input.customStatusEmoji }),
                        ...(input.statusExpiresAt === undefined
                            ? {}
                            : { statusExpiresAt: input.statusExpiresAt }),
                        ...(input.dndUntil === undefined ? {} : { dndUntil: input.dndUntil }),
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "presence.updated",
                entityId: input.actorUserId,
                actorUserId: input.actorUserId,
            });
            const [presence] = await this.listPresenceSettingsWithDb(tx, [input.actorUserId]);
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
        return this.writeDb(async (tx) => {
            const access = await this.chatAccessDb(tx, input.actorUserId, input.chatId, true);
            if (!access) throw new CollaborationError("not_found", "Chat was not found");
            if (access.archivedAt)
                throw new CollaborationError("forbidden", "Archived chats are read-only");
            if (await this.isPostingRestrictedDb(tx, input.actorUserId, input.chatId))
                throw new CollaborationError("forbidden", "Calling is restricted by moderation");
            const members = await tx
                .select({ userId: chatMembers.userId })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        isNull(chatMembers.leftAt),
                        ne(chatMembers.userId, input.actorUserId),
                    ),
                );
            const memberIds = new Set(members.map((row) => row.userId));
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
            const [active] = await tx
                .select({ id: calls.id })
                .from(calls)
                .where(
                    and(
                        eq(calls.chatId, input.chatId),
                        inArray(calls.status, ["ringing", "active"]),
                    ),
                )
                .limit(1);
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
            await tx.insert(calls).values({
                id,
                chatId: input.chatId,
                createdByUserId: input.actorUserId,
                kind: input.kind,
            });
            await tx.insert(callParticipants).values({
                callId: id,
                userId: input.actorUserId,
                invitedByUserId: input.actorUserId,
                status: "joined",
                joinedAt: sql`CURRENT_TIMESTAMP`,
                lastSeenAt: sql`CURRENT_TIMESTAMP`,
            });
            await tx.insert(callEvents).values({
                id: createId(),
                callId: id,
                kind: "created",
                actorUserId: input.actorUserId,
            });
            for (const userId of invitedUserIds) {
                await tx.insert(callParticipants).values({
                    callId: id,
                    userId,
                    invitedByUserId: input.actorUserId,
                    status: "ringing",
                    ringingAt: sql`CURRENT_TIMESTAMP`,
                });
                await tx.insert(callEvents).values({
                    id: createId(),
                    callId: id,
                    kind: "ringing",
                    actorUserId: input.actorUserId,
                    targetUserId: userId,
                });
                const [notificationPreference] = await tx
                    .select({ calls: userNotificationPreferences.calls })
                    .from(userNotificationPreferences)
                    .where(eq(userNotificationPreferences.userId, userId))
                    .limit(1);
                if (notificationPreference?.calls === "none") continue;
                const notificationId = createId();
                await tx.insert(notifications).values({
                    id: notificationId,
                    userId,
                    kind: "call",
                    chatId: input.chatId,
                    actorUserId: input.actorUserId,
                    payloadJson: JSON.stringify({ callId: id, kind: input.kind }),
                    syncSequence: sequence,
                });
                await this.insertSyncEvent(tx, {
                    sequence,
                    kind: "notification.created",
                    entityId: notificationId,
                    actorUserId: input.actorUserId,
                    targetUserId: userId,
                });
            }
            const call = await this.getCallProjectionDb(tx, input.actorUserId, id);
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
        const call = await this.getCallProjectionDb(this.db, userId, callId);
        if (!call) throw new CollaborationError("not_found", "Call was not found");
        return call;
    }

    async listCalls(input: {
        userId: string;
        chatId?: string;
        limit: number;
    }): Promise<CallSummary[]> {
        if (input.chatId && !(await this.chatAccessDb(this.db, input.userId, input.chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const visibleCalls = this.db
            .select({ callId: callParticipants.callId })
            .from(callParticipants)
            .where(
                and(
                    eq(callParticipants.callId, calls.id),
                    eq(callParticipants.userId, input.userId),
                ),
            );
        const result = await this.db
            .select({ id: calls.id })
            .from(calls)
            .where(
                and(
                    ...(input.chatId ? [eq(calls.chatId, input.chatId)] : []),
                    sql`exists ${visibleCalls}`,
                ),
            )
            .orderBy(desc(calls.createdAt), desc(calls.id))
            .limit(input.limit);
        const callSummaries: CallSummary[] = [];
        for (const row of result) {
            const call = await this.getCallProjectionDb(this.db, input.userId, row.id);
            if (call) callSummaries.push(call);
        }
        return callSummaries;
    }

    async updateCallParticipation(input: {
        actorUserId: string;
        callId: string;
        action: "join" | "decline" | "leave";
    }): Promise<{ call: CallSummary; hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            const call = await this.getCallProjectionDb(tx, input.actorUserId, input.callId);
            if (!call) throw new CollaborationError("not_found", "Call was not found");
            if (call.status === "ended" || call.status === "cancelled" || call.status === "failed")
                throw new CollaborationError("conflict", "Call has ended");
            const [participant] = await tx
                .select({ status: callParticipants.status })
                .from(callParticipants)
                .where(
                    and(
                        eq(callParticipants.callId, input.callId),
                        eq(callParticipants.userId, input.actorUserId),
                    ),
                )
                .limit(1);
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
            await tx
                .update(callParticipants)
                .set({
                    status: nextStatus,
                    joinedAt:
                        nextStatus === "joined"
                            ? sql`coalesce(${callParticipants.joinedAt}, CURRENT_TIMESTAMP)`
                            : sql`${callParticipants.joinedAt}`,
                    leftAt: ["declined", "left"].includes(nextStatus)
                        ? sql`CURRENT_TIMESTAMP`
                        : sql`${callParticipants.leftAt}`,
                    lastSeenAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(callParticipants.callId, input.callId),
                        eq(callParticipants.userId, input.actorUserId),
                    ),
                );
            await tx.insert(callEvents).values({
                id: createId(),
                callId: input.callId,
                kind: nextStatus,
                actorUserId: input.actorUserId,
            });
            if (nextStatus === "joined")
                await tx
                    .update(calls)
                    .set({
                        status: "active",
                        startedAt: sql`coalesce(${calls.startedAt}, CURRENT_TIMESTAMP)`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(calls.id, input.callId));
            else {
                const [remaining] = await tx
                    .select({ userId: callParticipants.userId })
                    .from(callParticipants)
                    .where(
                        and(
                            eq(callParticipants.callId, input.callId),
                            inArray(callParticipants.status, ["joined", "ringing", "invited"]),
                        ),
                    )
                    .limit(1);
                if (!remaining)
                    await tx
                        .update(calls)
                        .set({
                            status: "ended",
                            endedAt: sql`CURRENT_TIMESTAMP`,
                            endReason: "no_participants",
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        })
                        .where(eq(calls.id, input.callId));
            }
            const updated = await this.getCallProjectionDb(tx, input.actorUserId, input.callId);
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
        return this.writeDb(async (tx) => {
            const call = await this.getCallProjectionDb(tx, input.actorUserId, input.callId);
            if (!call) throw new CollaborationError("not_found", "Call was not found");
            const access = await this.chatAccessDb(tx, input.actorUserId, call.chatId, true);
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
            await tx
                .update(calls)
                .set({
                    status: "ended",
                    endedAt: sql`CURRENT_TIMESTAMP`,
                    endReason: input.reason ?? "ended",
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(calls.id, input.callId));
            await tx
                .update(callParticipants)
                .set({
                    status: sql`case when ${callParticipants.status} in ('ringing', 'invited') then 'missed' when ${callParticipants.status} = 'joined' then 'left' else ${callParticipants.status} end`,
                    leftAt: sql`case when ${callParticipants.status} in ('ringing', 'invited', 'joined') then CURRENT_TIMESTAMP else ${callParticipants.leftAt} end`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(callParticipants.callId, input.callId));
            await tx.insert(callEvents).values({
                id: createId(),
                callId: input.callId,
                kind: "ended",
                actorUserId: input.actorUserId,
                payloadJson: JSON.stringify({ reason: input.reason ?? "ended" }),
            });
            const updated = await this.getCallProjectionDb(tx, input.actorUserId, input.callId);
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
        const sender = alias(callParticipants, "sender");
        const recipient = alias(callParticipants, "recipient");
        const recipientExists = this.db
            .select({ userId: recipient.userId })
            .from(recipient)
            .where(
                and(
                    eq(recipient.callId, calls.id),
                    eq(recipient.userId, input.recipientUserId!),
                    inArray(recipient.status, ["ringing", "joined"]),
                ),
            );
        const [row] = await this.db
            .select({ id: calls.id })
            .from(calls)
            .innerJoin(sender, and(eq(sender.callId, calls.id), eq(sender.userId, input.userId)))
            .where(
                and(
                    eq(calls.id, input.callId),
                    eq(calls.chatId, input.chatId),
                    inArray(calls.status, ["ringing", "active"]),
                    inArray(sender.status, ["ringing", "joined"]),
                    ...(input.recipientUserId ? [sql`exists ${recipientExists}`] : []),
                ),
            )
            .limit(1);
        return Boolean(row);
    }

    async listDirectoryChannels(userId: string): Promise<ChatSummary[]> {
        const result = await this.db
            .select(chatSelection)
            .from(chats)
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .leftJoin(
                userChatPreferences,
                and(
                    eq(userChatPreferences.chatId, chats.id),
                    eq(userChatPreferences.userId, userId),
                ),
            )
            .where(
                and(
                    isNull(chats.deletedAt),
                    inArray(chats.kind, ["public_channel", "private_channel"]),
                    or(
                        and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
                        sql`${chatMembers.userId} IS NOT NULL`,
                    ),
                ),
            )
            .orderBy(sql`lower(${chats.name})`, chats.id);
        return result.map(asChat);
    }

    async listFiles(input: {
        userId: string;
        kind?: FileKind;
        before?: string;
        limit: number;
    }): Promise<{ files: FileSummary[]; nextCursor?: string }> {
        const conditions: SQL[] = [
            isNull(files.deletedAt),
            eq(files.uploadStatus, "complete"),
            ne(files.scanStatus, "infected"),
            isNull(messages.deletedAt),
            or(
                isNull(messages.expiresAt),
                sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
            )!,
            isNull(chats.deletedAt),
            or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`)!,
        ];
        if (input.kind) {
            conditions.push(eq(files.kind, input.kind));
        }
        if (input.before) {
            const [cursor] = await this.db
                .select({ createdAt: files.createdAt })
                .from(files)
                .where(eq(files.id, input.before));
            if (cursor)
                conditions.push(
                    or(
                        lt(files.createdAt, cursor.createdAt),
                        and(eq(files.createdAt, cursor.createdAt), lt(files.id, input.before)),
                    )!,
                );
        }
        const result = await this.db
            .selectDistinct(fileSelection)
            .from(files)
            .innerJoin(messageAttachments, eq(messageAttachments.fileId, files.id))
            .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
            .innerJoin(chats, eq(chats.id, messages.chatId))
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(and(...conditions))
            .orderBy(desc(files.createdAt), desc(files.id))
            .limit(input.limit + 1);
        const hasMore = result.length > input.limit;
        const rows = result.slice(0, input.limit);
        return {
            files: rows.map(asFile),
            nextCursor: hasMore ? text(rows.at(-1)?.id) : undefined,
        };
    }

    async canAccessFile(userId: string, fileId: string): Promise<boolean> {
        return this.canAccessFileWithDb(this.db, userId, fileId);
    }

    async listCustomEmoji(): Promise<
        Array<{ id: string; name: string; file: FileSummary; createdByUserId: string }>
    > {
        const result = await this.db
            .select({
                emoji_id: customEmojis.id,
                name: customEmojis.name,
                created_by_user_id: customEmojis.createdByUserId,
                ...fileSelection,
            })
            .from(customEmojis)
            .innerJoin(files, eq(files.id, customEmojis.fileId))
            .where(
                and(
                    isNull(customEmojis.deletedAt),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                ),
            )
            .orderBy(customEmojis.name);
        return result.map((row) => ({
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
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            const [file] = await tx
                .select(fileSelection)
                .from(files)
                .where(
                    and(
                        eq(files.id, input.fileId),
                        isNull(files.deletedAt),
                        eq(files.uploadStatus, "complete"),
                        ne(files.scanStatus, "infected"),
                        or(eq(files.uploadedByUserId, input.actorUserId), eq(files.isPublic, 1)),
                    ),
                )
                .limit(1);
            if (!file || !["photo", "gif"].includes(text(file.kind)))
                throw new CollaborationError("not_found", "Emoji image file was not found");
            const id = createId();
            const sequence = await this.nextSequence(tx);
            try {
                await tx.insert(customEmojis).values({
                    id,
                    name: input.name,
                    fileId: input.fileId,
                    createdByUserId: input.actorUserId,
                    syncSequence: sequence,
                });
                await tx.insert(customEmojiRevisions).values({
                    id: createId(),
                    customEmojiId: id,
                    name: input.name,
                    fileId: input.fileId,
                    changedByUserId: input.actorUserId,
                    changeKind: "created",
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
        return this.writeDb(async (tx) => {
            const [emoji] = await tx
                .select({
                    createdByUserId: customEmojis.createdByUserId,
                    name: customEmojis.name,
                    fileId: customEmojis.fileId,
                    actorRole: users.role,
                })
                .from(customEmojis)
                .innerJoin(users, eq(users.id, actorUserId))
                .where(and(eq(customEmojis.id, emojiId), isNull(customEmojis.deletedAt)))
                .limit(1);
            if (!emoji) throw new CollaborationError("not_found", "Emoji was not found");
            if (emoji.createdByUserId !== actorUserId && emoji.actorRole !== "admin")
                throw new CollaborationError("forbidden", "Cannot delete this emoji");
            const sequence = await this.nextSequence(tx);
            const affected = await tx
                .selectDistinct({ chatId: messages.chatId })
                .from(reactions)
                .innerJoin(messages, eq(messages.id, reactions.messageId))
                .where(and(eq(reactions.customEmojiId, emojiId), isNull(messages.deletedAt)));
            const chatHints: Array<{ chatId: string; pts: string }> = [];
            for (const row of affected) {
                const chatId = row.chatId;
                const mutation = await this.advanceChatWithSequence(
                    tx,
                    sequence,
                    actorUserId,
                    chatId,
                    "reaction.emojiDeleted",
                    emojiId,
                );
                chatHints.push({ chatId, pts: String(mutation.pts) });
            }
            await tx.delete(reactions).where(eq(reactions.customEmojiId, emojiId));
            await tx
                .update(customEmojis)
                .set({ deletedAt: sql`CURRENT_TIMESTAMP`, syncSequence: sequence })
                .where(eq(customEmojis.id, emojiId));
            await tx.insert(customEmojiRevisions).values({
                id: createId(),
                customEmojiId: emojiId,
                name: emoji.name,
                fileId: emoji.fileId,
                changedByUserId: actorUserId,
                changeKind: "deleted",
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "emoji.deleted",
                entityId: emojiId,
                actorUserId,
            });
            return {
                hint: { sequence: String(sequence), chats: chatHints, areas: ["emoji"] },
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
            const candidateLimit = offset + input.limit + candidates.length + 1;
            const matched = this.db
                .select({
                    messageId: messageSearchNgrams.messageId,
                    matchedGrams: sql<number>`count(*)`.as("matched_grams"),
                })
                .from(messageSearchNgrams)
                .where(inArray(messageSearchNgrams.gram, grams))
                .groupBy(messageSearchNgrams.messageId)
                .as("matched");
            const candidateScore = sql<number>`case when instr(${messageSearchDocuments.normalizedText}, ${normalized}) > 0 then 1.0 else cast(${matched.matchedGrams} as real) / max(1, ${messageSearchDocuments.gramCount} + ${grams.length} - ${matched.matchedGrams}) end`;
            const messageRows = await this.db
                .select({
                    message_id: messageSearchDocuments.messageId,
                    normalized_text: messageSearchDocuments.normalizedText,
                    candidate_score: candidateScore,
                })
                .from(matched)
                .innerJoin(
                    messageSearchDocuments,
                    eq(messageSearchDocuments.messageId, matched.messageId),
                )
                .innerJoin(messages, eq(messages.id, messageSearchDocuments.messageId))
                .innerJoin(chats, eq(chats.id, messageSearchDocuments.chatId))
                .leftJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.chatId, chats.id),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .where(
                    and(
                        isNull(messages.deletedAt),
                        or(
                            isNull(messages.expiresAt),
                            sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                        ),
                        isNull(chats.deletedAt),
                        or(
                            eq(chats.kind, "public_channel"),
                            sql`${chatMembers.userId} IS NOT NULL`,
                        ),
                    ),
                )
                .orderBy(
                    desc(candidateScore),
                    desc(messageSearchDocuments.messageCreatedAt),
                    desc(messageSearchDocuments.messageId),
                )
                .limit(candidateLimit);
            for (const row of messageRows) {
                const fuzzy = fuzzyScore(normalized, text(row.normalized_text));
                const ngram = Number(row.candidate_score);
                const score = Math.max(fuzzy, Number.isFinite(ngram) ? ngram * 0.85 : 0);
                if (score > 0) rankedMessages.push({ messageId: text(row.message_id), score });
            }
        }
        for (const { messageId, score } of rankedMessages) {
            const message = await this.getMessageProjectionDb(this.db, input.userId, messageId);
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
        const [row] = await this.db
            .select({
                name: serverSettings.name,
                title: serverSettings.title,
                photo_file_id: serverSettings.photoFileId,
                default_retention_mode: serverSettings.defaultRetentionMode,
                default_retention_seconds: serverSettings.defaultRetentionSeconds,
                updated_at: serverSettings.updatedAt,
            })
            .from(serverSettings)
            .where(eq(serverSettings.id, 1));
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
        await this.requireServerAdminDb(this.db, actorUserId);
        const result = await this.db
            .select({
                ...userSelection,
                last_access_at: users.lastAccessAt,
                email: accounts.email,
                banned_at: accounts.bannedAt,
                deleted_at: accounts.deletedAt,
                session_last_seen_at: sql<string | null>`max(${authSessions.lastSeenAt})`,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .leftJoin(authSessions, eq(authSessions.accountId, accounts.id))
            .groupBy(users.id)
            .orderBy(users.createdAt, users.id);
        return result.map((row) => ({
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
        const result = await this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            if (
                input.photoFileId &&
                !(await this.canAccessFileWithDb(tx, input.actorUserId, input.photoFileId))
            )
                throw new CollaborationError("not_found", "Server photo file was not found");
            const [current] = await tx
                .select({
                    defaultRetentionMode: serverSettings.defaultRetentionMode,
                    defaultRetentionSeconds: serverSettings.defaultRetentionSeconds,
                })
                .from(serverSettings)
                .where(eq(serverSettings.id, 1));
            if (!current) throw new Error("Server settings are missing");
            const retentionMode = input.defaultRetentionMode ?? current.defaultRetentionMode;
            const retentionSeconds =
                input.defaultRetentionSeconds === undefined
                    ? current.defaultRetentionSeconds === null
                        ? undefined
                        : current.defaultRetentionSeconds
                    : (input.defaultRetentionSeconds ?? undefined);
            if (retentionMode === "duration" && !retentionSeconds)
                throw new CollaborationError(
                    "invalid",
                    "Duration retention requires defaultRetentionSeconds",
                );
            const sequence = await this.nextSequence(tx);
            await tx
                .update(serverSettings)
                .set({
                    ...(input.name === undefined ? {} : { name: input.name }),
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.photoFileId === undefined ? {} : { photoFileId: input.photoFileId }),
                    ...(input.defaultRetentionMode === undefined
                        ? {}
                        : { defaultRetentionMode: input.defaultRetentionMode }),
                    ...(input.defaultRetentionSeconds === undefined
                        ? {}
                        : { defaultRetentionSeconds: input.defaultRetentionSeconds }),
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(serverSettings.id, 1));
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "server.updated",
                actorUserId: input.actorUserId,
            });
            await this.appendAuditDb(tx, {
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
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            await this.requireActiveUserDb(tx, input.userId);
            if (input.actorUserId === input.userId && input.role === "member")
                throw new CollaborationError("invalid", "An admin cannot demote themselves");
            const sequence = await this.nextSequence(tx);
            await tx
                .update(users)
                .set({
                    ...(input.title === undefined ? {} : { title: input.title }),
                    ...(input.role === undefined ? {} : { role: input.role }),
                    syncSequence: sequence,
                })
                .where(and(eq(users.id, input.userId), isNull(users.deletedAt)));
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "user.updated",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            await this.appendAuditDb(tx, {
                actorUserId: input.actorUserId,
                action: "user.administration_updated",
                targetType: "user",
                targetId: input.userId,
                after: { title: input.title, role: input.role },
            });
            const [user] = await tx
                .select(userSelection)
                .from(users)
                .where(eq(users.id, input.userId));
            if (!user) throw new Error("Updated user is missing");
            return { user: asUser(user), hint: areaHint(sequence, "users") };
        });
    }

    async setUserBanned(input: {
        actorUserId: string;
        userId: string;
        banned: boolean;
    }): Promise<{ hint: MutationHint }> {
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            if (input.actorUserId === input.userId)
                throw new CollaborationError("invalid", "An admin cannot ban themselves");
            const [existingUser] = await tx
                .select({ id: users.id })
                .from(users)
                .where(eq(users.id, input.userId));
            if (!existingUser) throw new CollaborationError("not_found", "User was not found");
            const sequence = await this.nextSequence(tx);
            const [target] = await tx
                .select({ accountId: users.accountId, bannedAt: accounts.bannedAt })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(eq(users.id, input.userId));
            if (!target?.accountId)
                throw new CollaborationError("not_found", "User account was not found");
            const accountId = target.accountId;
            if ((target.bannedAt !== null) === input.banned)
                throw new CollaborationError(
                    "conflict",
                    input.banned ? "User is already banned" : "User is not banned",
                );
            await tx
                .update(accounts)
                .set({
                    bannedAt: input.banned ? sql`CURRENT_TIMESTAMP` : null,
                    banExpiresAt: null,
                    banReason: input.banned ? "Administrative action" : null,
                    bannedByUserId: input.banned ? input.actorUserId : null,
                })
                .where(eq(accounts.id, accountId));
            if (input.banned) {
                await tx.insert(accountBans).values({
                    id: createId(),
                    accountId,
                    bannedByUserId: input.actorUserId,
                    reason: "Administrative action",
                });
                await tx
                    .update(authSessions)
                    .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                    .where(
                        and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)),
                    );
            } else {
                await tx
                    .update(accountBans)
                    .set({
                        revokedAt: sql`coalesce(${accountBans.revokedAt}, CURRENT_TIMESTAMP)`,
                        revokedByUserId: sql`coalesce(${accountBans.revokedByUserId}, ${input.actorUserId})`,
                        revokeReason: sql`coalesce(${accountBans.revokeReason}, 'Administrative action')`,
                    })
                    .where(
                        and(eq(accountBans.accountId, accountId), isNull(accountBans.revokedAt)),
                    );
            }
            await tx
                .update(users)
                .set({ syncSequence: sequence })
                .where(eq(users.id, input.userId));
            await this.insertSyncEvent(tx, {
                sequence,
                kind: input.banned ? "user.banned" : "user.unbanned",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            await this.appendAuditDb(tx, {
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
        return this.writeDb(async (tx) => {
            await this.requireServerAdminDb(tx, input.actorUserId);
            if (input.actorUserId === input.userId)
                throw new CollaborationError("invalid", "An admin cannot delete themselves");
            await this.requireActiveUserDb(tx, input.userId);
            const sequence = await this.nextSequence(tx);
            const memberships = await tx
                .select({ chatId: chatMembers.chatId, role: chatMembers.role, kind: chats.kind })
                .from(chatMembers)
                .innerJoin(chats, eq(chats.id, chatMembers.chatId))
                .where(
                    and(
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                        isNull(chats.deletedAt),
                    ),
                );
            const chatPoints: Array<{ chatId: string; pts: string }> = [];
            for (const membership of memberships) {
                const chatId = membership.chatId;
                let eventKind = "member.deleted";
                if (membership.kind !== "dm" && membership.role === "owner") {
                    const [remainingOwner] = await tx
                        .select({ userId: chatMembers.userId })
                        .from(chatMembers)
                        .where(
                            and(
                                eq(chatMembers.chatId, chatId),
                                ne(chatMembers.userId, input.userId),
                                isNull(chatMembers.leftAt),
                                eq(chatMembers.role, "owner"),
                            ),
                        )
                        .limit(1);
                    let replacementOwnerId = remainingOwner?.userId;
                    if (!replacementOwnerId) {
                        const [successor] = await tx
                            .select({ userId: chatMembers.userId })
                            .from(chatMembers)
                            .innerJoin(users, eq(users.id, chatMembers.userId))
                            .innerJoin(accounts, eq(accounts.id, users.accountId))
                            .where(
                                and(
                                    eq(chatMembers.chatId, chatId),
                                    ne(chatMembers.userId, input.userId),
                                    isNull(chatMembers.leftAt),
                                    isNull(users.deletedAt),
                                    eq(accounts.active, 1),
                                    isNull(accounts.bannedAt),
                                    isNull(accounts.deletedAt),
                                ),
                            )
                            .orderBy(
                                sql`case ${chatMembers.role} when 'admin' then 0 else 1 end`,
                                chatMembers.joinedAt,
                                chatMembers.userId,
                            )
                            .limit(1);
                        if (successor) {
                            replacementOwnerId = successor.userId;
                            await tx
                                .update(chatMembers)
                                .set({
                                    role: "owner",
                                    syncSequence: sequence,
                                    updatedAt: sql`CURRENT_TIMESTAMP`,
                                })
                                .where(
                                    and(
                                        eq(chatMembers.chatId, chatId),
                                        eq(chatMembers.userId, successor.userId),
                                    ),
                                );
                            eventKind = "member.deletedAndOwnershipTransferred";
                        } else {
                            eventKind = "chat.deletedWithLastMember";
                        }
                    }
                    if (replacementOwnerId)
                        await tx
                            .update(chats)
                            .set({ ownerUserId: replacementOwnerId })
                            .where(and(eq(chats.id, chatId), eq(chats.ownerUserId, input.userId)));
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
                    await tx
                        .update(chatMembers)
                        .set({ leftAt: sql`CURRENT_TIMESTAMP`, syncSequence: sequence })
                        .where(
                            and(
                                eq(chatMembers.chatId, chatId),
                                eq(chatMembers.userId, input.userId),
                                isNull(chatMembers.leftAt),
                            ),
                        );
                if (eventKind === "chat.deletedWithLastMember")
                    await tx
                        .update(chats)
                        .set({ deletedAt: sql`CURRENT_TIMESTAMP` })
                        .where(eq(chats.id, chatId));
            }
            const [target] = await tx
                .select({ accountId: users.accountId })
                .from(users)
                .where(eq(users.id, input.userId));
            if (!target?.accountId)
                throw new CollaborationError("not_found", "User account was not found");
            const accountId = target.accountId;
            await tx
                .update(accounts)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    active: 0,
                    passwordHash: null,
                    email: sql`'deleted+' || ${accounts.id} || '@invalid.local'`,
                })
                .where(eq(accounts.id, accountId));
            await tx
                .update(authSessions)
                .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                .where(and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)));
            await tx
                .update(users)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    syncSequence: sequence,
                    firstName: "Deleted",
                    lastName: null,
                    title: null,
                    username: sql`'deleted_' || ${users.id}`,
                    email: null,
                    phone: null,
                    photoFileId: null,
                })
                .where(eq(users.id, input.userId));
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "user.deleted",
                entityId: input.userId,
                actorUserId: input.actorUserId,
            });
            await this.appendAuditDb(tx, {
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
        await this.requireServerAdminDb(this.db, input.actorUserId);
        const [chat] = await this.db
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
            .limit(1);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
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

    private async chatAccessDb(
        executor: DrizzleExecutor,
        userId: string,
        chatId: string,
        requireMembership: boolean,
    ): Promise<ChatAccess | undefined> {
        const [row] = await executor
            .select(chatSelection)
            .from(chats)
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .leftJoin(
                userChatPreferences,
                and(
                    eq(userChatPreferences.chatId, chats.id),
                    eq(userChatPreferences.userId, userId),
                ),
            )
            .innerJoin(users, eq(users.id, userId))
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(chats.id, chatId),
                    isNull(chats.deletedAt),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                    requireMembership
                        ? sql`${chatMembers.userId} IS NOT NULL`
                        : or(
                              eq(chats.kind, "public_channel"),
                              sql`${chatMembers.userId} IS NOT NULL`,
                          ),
                ),
            )
            .limit(1);
        if (!row) return undefined;
        const [actor] = await executor
            .select({ role: users.role })
            .from(users)
            .where(and(eq(users.id, userId), isNull(users.deletedAt)))
            .limit(1);
        return { ...asChat(row), isServerAdmin: actor?.role === "admin" };
    }

    private async requireChatManagerDb(
        executor: DrizzleExecutor,
        userId: string,
        chatId: string,
    ): Promise<ChatAccess> {
        let access = await this.chatAccessDb(executor, userId, chatId, true);
        if (!access) {
            const [admin] = await executor
                .select({ id: users.id })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        eq(users.id, userId),
                        eq(users.role, "admin"),
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                )
                .limit(1);
            if (admin) {
                const [row] = await executor
                    .select(chatSelection)
                    .from(chats)
                    .leftJoin(
                        chatMembers,
                        and(
                            eq(chatMembers.chatId, chats.id),
                            eq(chatMembers.userId, userId),
                            isNull(chatMembers.leftAt),
                        ),
                    )
                    .leftJoin(
                        userChatPreferences,
                        and(
                            eq(userChatPreferences.chatId, chats.id),
                            eq(userChatPreferences.userId, userId),
                        ),
                    )
                    .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
                    .limit(1);
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

    private async requireActiveUserDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const [row] = await executor
            .select({ id: users.id })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    isNull(users.deletedAt),
                    isNull(accounts.deletedAt),
                    isNull(accounts.bannedAt),
                    eq(accounts.active, 1),
                ),
            )
            .limit(1);
        if (!row) throw new CollaborationError("not_found", "User was not found");
    }

    private async requireActiveIdentityDb(
        executor: DrizzleExecutor,
        userId: string,
    ): Promise<"human" | "agent"> {
        const [row] = await executor
            .select({ kind: users.kind })
            .from(users)
            .leftJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    isNull(users.deletedAt),
                    or(
                        eq(users.kind, "agent"),
                        and(
                            eq(users.kind, "human"),
                            isNull(accounts.deletedAt),
                            isNull(accounts.bannedAt),
                            eq(accounts.active, 1),
                        ),
                    ),
                ),
            )
            .limit(1);
        if (!row) throw new CollaborationError("not_found", "User was not found");
        return row.kind as "human" | "agent";
    }

    private async isPostingRestrictedDb(
        executor: DrizzleExecutor,
        userId: string,
        chatId: string,
    ): Promise<boolean> {
        const [row] = await executor
            .select({ id: moderationActions.id })
            .from(moderationActions)
            .where(
                and(
                    eq(moderationActions.action, "restrict"),
                    eq(moderationActions.targetUserId, userId),
                    isNull(moderationActions.revokedAt),
                    or(isNull(moderationActions.chatId), eq(moderationActions.chatId, chatId)),
                    or(
                        isNull(moderationActions.expiresAt),
                        gt(moderationActions.expiresAt, sql`CURRENT_TIMESTAMP`),
                    ),
                ),
            )
            .limit(1);
        return Boolean(row);
    }

    private async getCallProjectionDb(
        executor: DrizzleExecutor,
        viewerUserId: string,
        callId: string,
    ): Promise<CallSummary | undefined> {
        const [row] = await executor
            .select({
                id: calls.id,
                chatId: calls.chatId,
                createdByUserId: calls.createdByUserId,
                kind: calls.kind,
                status: calls.status,
                startedAt: calls.startedAt,
                endedAt: calls.endedAt,
                endReason: calls.endReason,
                createdAt: calls.createdAt,
                updatedAt: calls.updatedAt,
            })
            .from(calls)
            .where(eq(calls.id, callId))
            .limit(1);
        if (!row || !(await this.chatAccessDb(executor, viewerUserId, row.chatId, false)))
            return undefined;
        const [visible] = await executor
            .select({ userId: callParticipants.userId })
            .from(callParticipants)
            .where(
                and(eq(callParticipants.callId, callId), eq(callParticipants.userId, viewerUserId)),
            )
            .limit(1);
        if (!visible) return undefined;
        const participants = await executor
            .select({
                userId: callParticipants.userId,
                status: callParticipants.status,
                joinedAt: callParticipants.joinedAt,
                leftAt: callParticipants.leftAt,
            })
            .from(callParticipants)
            .where(eq(callParticipants.callId, callId))
            .orderBy(callParticipants.invitedAt, callParticipants.userId);
        return {
            id: row.id,
            chatId: row.chatId,
            createdByUserId: row.createdByUserId ?? undefined,
            kind: row.kind as CallSummary["kind"],
            status: row.status as CallSummary["status"],
            participants: participants.map((p) => ({
                userId: p.userId,
                status: p.status as CallSummary["participants"][number]["status"],
                joinedAt: p.joinedAt ?? undefined,
                leftAt: p.leftAt ?? undefined,
            })),
            startedAt: row.startedAt ?? undefined,
            endedAt: row.endedAt ?? undefined,
            endReason: row.endReason ?? undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    private async listPresenceSettingsWithDb(
        executor: DrizzleExecutor,
        userIds: string[],
    ): Promise<PresenceSettingsSummary[]> {
        if (!userIds.length) return [];
        const rows = await executor
            .select({
                userId: userPresenceSettings.userId,
                availability: userPresenceSettings.availability,
                customStatusText: userPresenceSettings.customStatusText,
                customStatusEmoji: userPresenceSettings.customStatusEmoji,
                statusExpiresAt: userPresenceSettings.statusExpiresAt,
                dndUntil: userPresenceSettings.dndUntil,
                updatedAt: userPresenceSettings.updatedAt,
            })
            .from(userPresenceSettings)
            .where(inArray(userPresenceSettings.userId, userIds));
        return rows.map((row) => {
            const statusActive = !row.statusExpiresAt || !isPast(row.statusExpiresAt);
            const dndActive = !!row.dndUntil && !isPast(row.dndUntil);
            return {
                userId: row.userId,
                availability: dndActive
                    ? "dnd"
                    : (row.availability as PresenceSettingsSummary["availability"]),
                customStatusText: statusActive ? (row.customStatusText ?? undefined) : undefined,
                customStatusEmoji: statusActive ? (row.customStatusEmoji ?? undefined) : undefined,
                statusExpiresAt: statusActive ? (row.statusExpiresAt ?? undefined) : undefined,
                dndUntil: dndActive ? (row.dndUntil ?? undefined) : undefined,
                updatedAt: row.updatedAt,
            };
        });
    }

    private async nextSequence(tx: DrizzleTransaction): Promise<number> {
        const [row] = await tx
            .update(serverSyncState)
            .set({ sequence: sql`${serverSyncState.sequence} + 1` })
            .where(eq(serverSyncState.id, 1))
            .returning({ sequence: serverSyncState.sequence });
        if (!row) throw new Error("Sync state has not been initialized");
        return row.sequence;
    }

    private async advanceChat(
        tx: DrizzleTransaction,
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
        tx: DrizzleTransaction,
        sequence: number,
        actorUserId: string | undefined,
        chatId: string,
        kind: string,
        entityId?: string,
        targetUserId?: string,
        incrementMessageSequence = false,
    ): Promise<ChatMutation & { messageSequence?: number }> {
        const [row] = await tx
            .update(chats)
            .set({
                pts: sql`${chats.pts} + 1`,
                lastMessageSequence: sql`${chats.lastMessageSequence} + ${incrementMessageSequence ? 1 : 0}`,
                lastChangeSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
            .returning({ pts: chats.pts, lastMessageSequence: chats.lastMessageSequence });
        if (!row) throw new CollaborationError("not_found", "Chat was not found");
        await this.insertChatUpdate(tx, {
            sequence,
            pts: row.pts,
            chatId,
            kind,
            entityId,
            actorUserId,
            targetUserId,
        });
        return {
            sequence,
            pts: row.pts,
            chatId,
            messageSequence: incrementMessageSequence ? row.lastMessageSequence : undefined,
        };
    }

    private async insertChatUpdate(
        tx: DrizzleTransaction,
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
        await tx.insert(chatUpdates).values({
            chatId: input.chatId,
            pts: input.pts,
            ptsCount: 1,
            kind: input.kind,
            entityId: input.entityId,
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
        tx: DrizzleTransaction,
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
        await tx.insert(syncEvents).values({
            sequence: input.sequence,
            kind: input.kind,
            chatId: input.chatId,
            chatPts: input.chatPts,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
    }

    private async recomputeThreadProjectionDb(
        tx: DrizzleTransaction,
        threadRootMessageId: string,
        pts: number,
    ): Promise<void> {
        await tx
            .delete(threadParticipants)
            .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
        const participants = await tx
            .select({
                userId: messages.senderUserId,
                replyCount: sql<number>`count(*)`,
                firstParticipatedAt: sql<string>`min(${messages.createdAt})`,
                lastParticipatedAt: sql<string>`max(${messages.createdAt})`,
            })
            .from(messages)
            .where(
                and(
                    eq(messages.threadRootMessageId, threadRootMessageId),
                    sql`${messages.senderUserId} IS NOT NULL`,
                    isNull(messages.deletedAt),
                    or(
                        isNull(messages.expiresAt),
                        sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                    ),
                ),
            )
            .groupBy(messages.senderUserId);
        if (participants.length)
            await tx.insert(threadParticipants).values(
                participants.map((p) => ({
                    threadRootMessageId,
                    userId: p.userId!,
                    replyCount: p.replyCount,
                    firstParticipatedAt: p.firstParticipatedAt,
                    lastParticipatedAt: p.lastParticipatedAt,
                })),
            );
        const active = and(
            eq(messages.threadRootMessageId, threadRootMessageId),
            isNull(messages.deletedAt),
            or(
                isNull(messages.expiresAt),
                sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
            ),
        );
        const [last] = await tx
            .select({ id: messages.id, sequence: messages.sequence })
            .from(messages)
            .where(active)
            .orderBy(desc(messages.sequence))
            .limit(1);
        const [counts] = await tx
            .select({ replies: sql<number>`count(*)` })
            .from(messages)
            .where(active);
        const [participantCount] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(threadParticipants)
            .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
        await tx
            .update(threads)
            .set({
                replyCount: counts?.replies ?? 0,
                participantCount: participantCount?.count ?? 0,
                lastReplyMessageId: last?.id ?? null,
                lastReplySequence: last?.sequence ?? 0,
                lastPts: pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(threads.rootMessageId, threadRootMessageId));
        await tx
            .update(threadUserStates)
            .set({
                unreadCount: sql`(select count(*) from messages m where m.thread_root_message_id = ${threadRootMessageId} and m.deleted_at is null and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP) and m.sequence > ${threadUserStates.lastReadSequence} and (m.sender_user_id is null or m.sender_user_id != ${threadUserStates.userId}))`,
                mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.thread_root_message_id = ${threadRootMessageId} and m.deleted_at is null and m.sequence > ${threadUserStates.lastReadSequence} and mm.mentioned_user_id = ${threadUserStates.userId})`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(threadUserStates.threadRootMessageId, threadRootMessageId));
    }

    private async canAccessFileWithDb(
        executor: DrizzleExecutor,
        userId: string,
        fileId: string,
    ): Promise<boolean> {
        const [row] = await executor
            .select({ id: files.id })
            .from(files)
            .where(
                and(
                    eq(files.id, fileId),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    ne(files.scanStatus, "infected"),
                    or(
                        eq(files.isPublic, 1),
                        eq(files.uploadedByUserId, userId),
                        sql`exists (select 1 from custom_emojis e where e.file_id = ${files.id} and e.deleted_at is null)`,
                        sql`exists (select 1 from server_settings s where s.photo_file_id = ${files.id})`,
                        sql`exists (select 1 from users u where u.photo_file_id = ${files.id} and u.deleted_at is null)`,
                        sql`exists (select 1 from bot_identities b where b.photo_file_id = ${files.id} and b.deleted_at is null and b.active = 1)`,
                        sql`exists (select 1 from chats photo_chat left join chat_members photo_member on photo_member.chat_id = photo_chat.id and photo_member.user_id = ${userId} and photo_member.left_at is null where photo_chat.photo_file_id = ${files.id} and photo_chat.deleted_at is null and (photo_chat.kind = 'public_channel' or photo_member.user_id is not null))`,
                        sql`exists (select 1 from file_access_grants g where g.file_id = ${files.id} and (g.expires_at is null or datetime(g.expires_at) > CURRENT_TIMESTAMP) and ((g.principal_type = 'user' and g.principal_id = ${userId}) or g.principal_type in ('server', 'custom_emoji') or (g.principal_type = 'chat' and exists (select 1 from chats grant_chat left join chat_members grant_member on grant_member.chat_id = grant_chat.id and grant_member.user_id = ${userId} and grant_member.left_at is null where grant_chat.id = g.principal_id and grant_chat.deleted_at is null and (grant_chat.kind = 'public_channel' or grant_member.user_id is not null)))))`,
                        sql`exists (select 1 from message_attachments ma join messages m on m.id = ma.message_id join chats c on c.id = m.chat_id left join chat_members cm on cm.chat_id = c.id and cm.user_id = ${userId} and cm.left_at is null where ma.file_id = ${files.id} and m.deleted_at is null and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP) and c.deleted_at is null and (c.kind = 'public_channel' or cm.user_id is not null))`,
                    ),
                ),
            )
            .limit(1);
        return Boolean(row);
    }

    private async requireMessageInChatDb(
        executor: DrizzleExecutor,
        messageId: string,
        chatId: string,
    ) {
        const [row] = await executor
            .select({
                id: messages.id,
                chatId: messages.chatId,
                threadRootMessageId: messages.threadRootMessageId,
            })
            .from(messages)
            .where(
                and(
                    eq(messages.id, messageId),
                    eq(messages.chatId, chatId),
                    isNull(messages.deletedAt),
                    or(
                        isNull(messages.expiresAt),
                        sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                    ),
                ),
            )
            .limit(1);
        if (!row) throw new CollaborationError("not_found", "Referenced message was not found");
        return row;
    }

    private async getMessageProjectionDb(
        executor: DrizzleExecutor,
        viewerUserId: string,
        messageId: string,
    ): Promise<MessageSummary | undefined> {
        const sender = alias(users, "sender");
        const bot = alias(botIdentities, "sender_bot");
        const quoted = alias(messages, "quoted");
        const forwarded = alias(messages, "forwarded");
        const [row] = await executor
            .select({
                id: messages.id,
                chat_id: messages.chatId,
                sequence: messages.sequence,
                change_pts: messages.changePts,
                sender_user_id: messages.senderUserId,
                kind: messages.kind,
                text: messages.text,
                quoted_message_id: messages.quotedMessageId,
                thread_root_message_id: messages.threadRootMessageId,
                forwarded_from_message_id: messages.forwardedFromMessageId,
                expires_at: messages.expiresAt,
                edited_at: messages.editedAt,
                expiry_mode: messages.expiryMode,
                self_destruct_seconds: messages.selfDestructSeconds,
                first_read_at: messages.firstReadAt,
                revision: messages.revision,
                deleted_at: messages.deletedAt,
                created_at: messages.createdAt,
                sender_id: sender.id,
                sender_username: sender.username,
                sender_first_name: sender.firstName,
                sender_last_name: sender.lastName,
                sender_title: sender.title,
                sender_photo_file_id: sender.photoFileId,
                sender_role: sender.role,
                sender_kind: sender.kind,
                sender_bot_id: bot.id,
                sender_bot_name: bot.name,
                sender_bot_username: bot.username,
                sender_bot_photo_file_id: bot.photoFileId,
                generation_status: agentTurns.status,
                quoted_sender_user_id: quoted.senderUserId,
                quoted_text: quoted.text,
                quoted_deleted_at: quoted.deletedAt,
                quoted_expires_at: quoted.expiresAt,
                forwarded_from_chat_id: forwarded.chatId,
                thread_reply_count: sql<number>`coalesce(${threads.replyCount}, 0)`,
            })
            .from(messages)
            .leftJoin(sender, eq(sender.id, messages.senderUserId))
            .leftJoin(bot, eq(bot.id, messages.senderBotId))
            .leftJoin(agentTurns, eq(agentTurns.assistantMessageId, messages.id))
            .leftJoin(quoted, eq(quoted.id, messages.quotedMessageId))
            .leftJoin(forwarded, eq(forwarded.id, messages.forwardedFromMessageId))
            .leftJoin(threads, eq(threads.rootMessageId, messages.id))
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!row || !(await this.chatAccessDb(executor, viewerUserId, row.chat_id, false)))
            return undefined;
        const deleted = row.deleted_at !== null || isPast(row.expires_at ?? undefined);
        const attachmentRows = deleted
            ? []
            : await executor
                  .select(fileSelection)
                  .from(messageAttachments)
                  .innerJoin(files, eq(files.id, messageAttachments.fileId))
                  .where(
                      and(
                          eq(messageAttachments.messageId, messageId),
                          isNull(files.deletedAt),
                          eq(files.uploadStatus, "complete"),
                          ne(files.scanStatus, "infected"),
                      ),
                  )
                  .orderBy(messageAttachments.position, files.id);
        const reactionRows = deleted
            ? []
            : await executor
                  .select({
                      reaction_key: reactions.reactionKey,
                      emoji: reactions.emoji,
                      custom_emoji_id: reactions.customEmojiId,
                      user_id: reactions.userId,
                  })
                  .from(reactions)
                  .where(eq(reactions.messageId, messageId))
                  .orderBy(reactions.reactionKey, reactions.createdAt, reactions.userId);
        const mentionRows = deleted
            ? []
            : await executor
                  .select({
                      kind: messageMentions.kind,
                      mentioned_user_id: messageMentions.mentionedUserId,
                      start_offset: messageMentions.startOffset,
                      length: messageMentions.length,
                      raw_text: messageMentions.rawText,
                  })
                  .from(messageMentions)
                  .where(eq(messageMentions.messageId, messageId))
                  .orderBy(messageMentions.startOffset);
        const receiptRows = await executor
            .select({
                user_id: messageReceipts.userId,
                delivered_at: messageReceipts.deliveredAt,
                read_at: messageReceipts.readAt,
            })
            .from(messageReceipts)
            .where(eq(messageReceipts.messageId, messageId))
            .orderBy(messageReceipts.userId);
        const reactionMap = new Map<string, ReactionSummary>();
        for (const reaction of reactionRows) {
            const existing = reactionMap.get(reaction.reaction_key) ?? {
                key: reaction.reaction_key,
                emoji: reaction.emoji ?? undefined,
                customEmojiId: reaction.custom_emoji_id ?? undefined,
                count: 0,
                reacted: false,
                userIds: [],
            };
            existing.count += 1;
            existing.reacted ||= reaction.user_id === viewerUserId;
            existing.userIds.push(reaction.user_id);
            reactionMap.set(reaction.reaction_key, existing);
        }
        const senderSummary = row.sender_id
            ? asUser({
                  id: row.sender_id,
                  username: row.sender_username,
                  first_name: row.sender_first_name,
                  last_name: row.sender_last_name,
                  title: row.sender_title,
                  photo_file_id: row.sender_photo_file_id,
                  role: row.sender_role,
                  user_kind: row.sender_kind,
              })
            : undefined;
        const forwardedFromChatId = row.forwarded_from_chat_id ?? undefined;
        const forwardedFrom =
            row.forwarded_from_message_id &&
            forwardedFromChatId &&
            (await this.chatAccessDb(executor, viewerUserId, forwardedFromChatId, false))
                ? { messageId: row.forwarded_from_message_id, chatId: forwardedFromChatId }
                : undefined;
        const quotedDeleted =
            row.quoted_deleted_at !== null || isPast(row.quoted_expires_at ?? undefined);
        return {
            id: row.id,
            chatId: row.chat_id,
            sequence: String(row.sequence),
            changePts: String(row.change_pts),
            sender: senderSummary,
            senderBot: row.sender_bot_id
                ? {
                      id: row.sender_bot_id,
                      name: row.sender_bot_name!,
                      username: row.sender_bot_username!,
                      photoFileId: row.sender_bot_photo_file_id ?? undefined,
                  }
                : undefined,
            kind: row.kind as "user" | "automated",
            text: deleted ? "" : row.text,
            generationStatus:
                row.generation_status === "running"
                    ? "streaming"
                    : row.generation_status === "complete" || row.generation_status === "failed"
                      ? row.generation_status
                      : undefined,
            quotedMessage: row.quoted_message_id
                ? {
                      id: row.quoted_message_id,
                      senderUserId: row.quoted_sender_user_id ?? undefined,
                      text: quotedDeleted || deleted ? "" : (row.quoted_text ?? ""),
                      deleted: quotedDeleted,
                  }
                : undefined,
            threadRootMessageId: row.thread_root_message_id ?? undefined,
            threadReplyCount: row.thread_reply_count,
            revision: row.revision,
            mentions: mentionRows.map((mention) => ({
                kind: mention.kind as MessageSummary["mentions"][number]["kind"],
                userId: mention.mentioned_user_id ?? undefined,
                offset: mention.start_offset,
                length: mention.length,
                rawText: mention.raw_text,
            })),
            forwardedFrom,
            attachments: attachmentRows.map(asFile),
            reactions: [...reactionMap.values()],
            receipts: receiptRows.map((receipt) => ({
                userId: receipt.user_id,
                deliveredAt: receipt.delivered_at ?? undefined,
                readAt: receipt.read_at ?? undefined,
            })),
            expiresAt: row.expires_at ?? undefined,
            expiryMode: row.expiry_mode as MessageSummary["expiryMode"],
            selfDestructSeconds: row.self_destruct_seconds ?? undefined,
            firstReadAt: row.first_read_at ?? undefined,
            editedAt: row.edited_at ?? undefined,
            deletedAt: deleted ? (row.deleted_at ?? row.expires_at ?? undefined) : undefined,
            createdAt: row.created_at,
        };
    }

    private async replaceMessageMentionsDb(
        tx: DrizzleTransaction,
        messageId: string,
        messageText: string,
    ): Promise<{ userIds: string[]; notifyAll: boolean }> {
        await tx.delete(messageMentions).where(eq(messageMentions.messageId, messageId));
        const mentionedUsers = new Set<string>();
        let notifyAll = false;
        const seenRanges = new Set<string>();
        for (const match of messageText.matchAll(
            /(^|[^\p{L}\p{N}_])@([a-zA-Z0-9_][a-zA-Z0-9_.-]{0,63})/gu,
        )) {
            const candidate = match[2].replace(/[.-]+$/g, "");
            if (!candidate) continue;
            const rawText = `@${candidate}`;
            const startOffset = (match.index ?? 0) + match[1].length;
            const range = `${startOffset}:${rawText.length}`;
            if (seenRanges.has(range)) continue;
            seenRanges.add(range);
            const special = candidate.toLowerCase();
            if (["channel", "here", "everyone"].includes(special)) {
                await tx.insert(messageMentions).values({
                    id: createId(),
                    messageId,
                    kind: special,
                    startOffset,
                    length: rawText.length,
                    rawText,
                });
                notifyAll = true;
                continue;
            }
            const [user] = await tx
                .select({ id: users.id })
                .from(users)
                .leftJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        sql`lower(${users.username}) = lower(${candidate})`,
                        isNull(users.deletedAt),
                        or(
                            eq(users.kind, "agent"),
                            and(
                                eq(users.kind, "human"),
                                eq(accounts.active, 1),
                                isNull(accounts.bannedAt),
                                isNull(accounts.deletedAt),
                            ),
                        ),
                    ),
                )
                .limit(1);
            if (!user) continue;
            await tx.insert(messageMentions).values({
                id: createId(),
                messageId,
                kind: "user",
                mentionedUserId: user.id,
                startOffset,
                length: rawText.length,
                rawText,
            });
            mentionedUsers.add(user.id);
        }
        return { userIds: [...mentionedUsers], notifyAll };
    }

    private async indexMessageForSearchDb(
        tx: DrizzleTransaction,
        messageId: string,
        chatId: string,
        messageText: string,
        revision: number,
    ): Promise<void> {
        await tx
            .delete(messageSearchDocuments)
            .where(eq(messageSearchDocuments.messageId, messageId));
        const normalized = normalizeSearch(messageText);
        if (!normalized) return;
        const grams = searchGrams(normalized);
        const [created] = await tx
            .select({ createdAt: messages.createdAt })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!created) throw new Error("Search source message is missing");
        await tx.insert(messageSearchDocuments).values({
            messageId,
            chatId,
            normalizedText: normalized,
            normalizedLength: normalized.length,
            gramCount: grams.size,
            indexedRevision: revision,
            messageCreatedAt: created.createdAt,
        });
        if (grams.size)
            await tx
                .insert(messageSearchNgrams)
                .values(
                    [...grams].map(([gram, occurrences]) => ({ gram, messageId, occurrences })),
                );
    }

    private async recordMessageDeliveryDb(
        tx: DrizzleTransaction,
        input: {
            actorUserId: string;
            chat: ChatSummary;
            messageId: string;
            messageSequence: number;
            threadRootMessageId?: string;
            mentionedUserIds: string[];
            mentionAll?: boolean;
            respectCurrentReadState?: boolean;
            syncSequence: number;
            senderUserId?: string;
        },
    ): Promise<void> {
        const mentioned = new Set(input.mentionedUserIds);
        const recipients = await tx
            .select({
                userId: chatMembers.userId,
                notificationLevel: sql<string>`coalesce(${userChatPreferences.notificationLevel}, 'all')`,
                mutedUntil: userChatPreferences.mutedUntil,
                notifyThreadReplies: sql<number>`coalesce(${userChatPreferences.notifyThreadReplies}, 1)`,
                directMessages: sql<string>`coalesce(${userNotificationPreferences.directMessages}, 'all')`,
                mentionNotifications: sql<string>`coalesce(${userNotificationPreferences.mentions}, 'all')`,
                threadReplies: sql<string>`coalesce(${userNotificationPreferences.threadReplies}, 'all')`,
                lastReadSequence: chatMembers.lastReadSequence,
            })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .leftJoin(
                userChatPreferences,
                and(
                    eq(userChatPreferences.chatId, chatMembers.chatId),
                    eq(userChatPreferences.userId, chatMembers.userId),
                ),
            )
            .leftJoin(
                userNotificationPreferences,
                eq(userNotificationPreferences.userId, chatMembers.userId),
            )
            .where(
                and(
                    eq(chatMembers.chatId, input.chat.id),
                    isNull(chatMembers.leftAt),
                    eq(users.kind, "human"),
                    ne(chatMembers.userId, input.senderUserId ?? input.actorUserId),
                ),
            );
        let rootSenderUserId: string | undefined;
        if (input.threadRootMessageId) {
            const [root] = await tx
                .select({ senderUserId: messages.senderUserId })
                .from(messages)
                .where(eq(messages.id, input.threadRootMessageId));
            rootSenderUserId = root?.senderUserId ?? undefined;
            for (const userId of new Set(
                [input.actorUserId, rootSenderUserId].filter(Boolean) as string[],
            )) {
                const actor = userId === input.actorUserId;
                await tx
                    .insert(threadUserStates)
                    .values({
                        threadRootMessageId: input.threadRootMessageId,
                        userId,
                        subscribed: 1,
                        lastReadMessageId: input.messageId,
                        lastReadSequence: input.messageSequence,
                        lastParticipatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .onConflictDoUpdate({
                        target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                        set: {
                            subscribed: 1,
                            ...(actor
                                ? {
                                      lastReadMessageId: input.messageId,
                                      lastReadSequence: input.messageSequence,
                                      lastParticipatedAt: sql`CURRENT_TIMESTAMP`,
                                  }
                                : {}),
                            updatedAt: sql`CURRENT_TIMESTAMP`,
                        },
                    });
            }
        }
        for (const recipient of recipients) {
            const userId = recipient.userId;
            const isMentioned = input.mentionAll === true || mentioned.has(userId);
            const alreadyRead =
                input.respectCurrentReadState === true &&
                recipient.lastReadSequence >= input.messageSequence;
            await tx
                .update(chatMembers)
                .set({
                    unreadCount: sql`${chatMembers.unreadCount} + ${alreadyRead ? 0 : 1}`,
                    mentionCount: sql`${chatMembers.mentionCount} + ${isMentioned && !alreadyRead ? 1 : 0}`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, input.chat.id),
                        eq(chatMembers.userId, userId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            await tx
                .insert(messageReceipts)
                .values({
                    messageId: input.messageId,
                    userId,
                    deliveredAt: sql`CURRENT_TIMESTAMP`,
                    ...(alreadyRead ? { readAt: sql`CURRENT_TIMESTAMP` } : {}),
                })
                .onConflictDoUpdate({
                    target: [messageReceipts.messageId, messageReceipts.userId],
                    set: {
                        deliveredAt: sql`coalesce(${messageReceipts.deliveredAt}, CURRENT_TIMESTAMP)`,
                        ...(alreadyRead
                            ? {
                                  readAt: sql`coalesce(${messageReceipts.readAt}, CURRENT_TIMESTAMP)`,
                              }
                            : {}),
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
            let threadSubscribed = false;
            let threadNotificationLevel: NotificationLevel = "all";
            if (input.threadRootMessageId) {
                const [state] = await tx
                    .select({
                        subscribed: threadUserStates.subscribed,
                        notificationLevel: threadUserStates.notificationLevel,
                    })
                    .from(threadUserStates)
                    .where(
                        and(
                            eq(threadUserStates.threadRootMessageId, input.threadRootMessageId),
                            eq(threadUserStates.userId, userId),
                        ),
                    )
                    .limit(1);
                threadSubscribed = state?.subscribed === 1 || userId === rootSenderUserId;
                threadNotificationLevel = (state?.notificationLevel ?? "all") as NotificationLevel;
                if (threadSubscribed || isMentioned)
                    await tx
                        .insert(threadUserStates)
                        .values({
                            threadRootMessageId: input.threadRootMessageId,
                            userId,
                            subscribed: threadSubscribed || isMentioned ? 1 : 0,
                            unreadCount: 1,
                            mentionCount: isMentioned ? 1 : 0,
                        })
                        .onConflictDoUpdate({
                            target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                            set: {
                                unreadCount: sql`${threadUserStates.unreadCount} + 1`,
                                mentionCount: sql`${threadUserStates.mentionCount} + ${isMentioned ? 1 : 0}`,
                                updatedAt: sql`CURRENT_TIMESTAMP`,
                            },
                        });
            }
            const muted =
                recipient.mutedUntil !== null && !isPast(recipient.mutedUntil ?? undefined);
            const kind = isMentioned
                ? "mention"
                : input.threadRootMessageId && threadSubscribed
                  ? "thread_reply"
                  : input.chat.kind === "dm"
                    ? "direct_message"
                    : undefined;
            const globallyAllowed =
                kind === "mention"
                    ? recipient.mentionNotifications !== "none"
                    : kind === "thread_reply"
                      ? recipient.notifyThreadReplies === 1 &&
                        recipient.threadReplies !== "none" &&
                        (recipient.threadReplies !== "mentions" || isMentioned) &&
                        threadNotificationLevel !== "none" &&
                        (threadNotificationLevel !== "mentions" || isMentioned)
                      : kind === "direct_message"
                        ? recipient.directMessages !== "none"
                        : true;
            if (
                alreadyRead ||
                !kind ||
                !globallyAllowed ||
                muted ||
                recipient.notificationLevel === "none" ||
                (recipient.notificationLevel === "mentions" && !isMentioned)
            )
                continue;
            const notificationId = createId();
            await tx.insert(notifications).values({
                id: notificationId,
                userId,
                kind,
                chatId: input.chat.id,
                messageId: input.messageId,
                threadRootMessageId: input.threadRootMessageId,
                actorUserId: input.actorUserId,
                syncSequence: input.syncSequence,
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

    private async findClientMutationDb(
        executor: DrizzleExecutor,
        actorUserId: string,
        scope: string,
        clientMutationId: string,
    ): Promise<Record<string, unknown> | undefined> {
        const [row] = await executor
            .select({ resultJson: clientMutations.resultJson })
            .from(clientMutations)
            .where(
                and(
                    eq(clientMutations.actorUserId, actorUserId),
                    eq(clientMutations.scope, scope),
                    eq(clientMutations.clientMutationId, clientMutationId),
                ),
            )
            .limit(1);
        if (!row) return undefined;
        await executor
            .update(clientMutations)
            .set({ lastAccessedAt: sql`CURRENT_TIMESTAMP` })
            .where(
                and(
                    eq(clientMutations.actorUserId, actorUserId),
                    eq(clientMutations.scope, scope),
                    eq(clientMutations.clientMutationId, clientMutationId),
                ),
            );
        return JSON.parse(row.resultJson) as Record<string, unknown>;
    }

    private async storeClientMutationDb(
        tx: DrizzleTransaction,
        actorUserId: string,
        scope: string,
        clientMutationId: string,
        result: Record<string, unknown>,
    ): Promise<void> {
        const [settings] = await tx
            .select({ retentionSeconds: serverSettings.idempotencyRetentionSeconds })
            .from(serverSettings)
            .where(eq(serverSettings.id, 1));
        const retention = settings?.retentionSeconds ?? 604800;
        await tx.insert(clientMutations).values({
            actorUserId,
            scope,
            clientMutationId,
            resultJson: JSON.stringify(result),
            expiresAt: sql`strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ${retention} || ' seconds')`,
            lastAccessedAt: sql`CURRENT_TIMESTAMP`,
        });
    }

    private async requireServerAdminDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const [row] = await executor
            .select({ id: users.id })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                    eq(accounts.active, 1),
                ),
            )
            .limit(1);
        if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
    }

    private async appendAuditDb(
        tx: DrizzleTransaction,
        input: {
            actorUserId: string;
            action: string;
            targetType: string;
            targetId?: string;
            chatId?: string;
            after?: Record<string, unknown>;
        },
    ): Promise<void> {
        await tx.insert(auditLogEntries).values({
            id: createId(),
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            chatId: input.chatId,
            afterJson: input.after ? JSON.stringify(input.after) : null,
        });
    }

    private writeDb<T>(operation: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
        return retrySqliteBusy(() => this.db.transaction(operation));
    }
}

function dueMessages(executor: DrizzleExecutor, limit: number) {
    return executor
        .select({
            id: messages.id,
            chatId: messages.chatId,
            threadRootMessageId: messages.threadRootMessageId,
        })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .innerJoin(serverSettings, eq(serverSettings.id, 1))
        .where(
            and(
                isNull(messages.deletedAt),
                or(
                    and(
                        sql`${messages.expiresAt} IS NOT NULL`,
                        sql`datetime(${messages.expiresAt}) <= CURRENT_TIMESTAMP`,
                    ),
                    and(
                        eq(chats.retentionMode, "duration"),
                        sql`${chats.retentionSeconds} IS NOT NULL`,
                        sql`datetime(${messages.createdAt}, '+' || ${chats.retentionSeconds} || ' seconds') <= CURRENT_TIMESTAMP`,
                    ),
                    and(
                        eq(chats.retentionMode, "inherit"),
                        eq(serverSettings.defaultRetentionMode, "duration"),
                        sql`${serverSettings.defaultRetentionSeconds} IS NOT NULL`,
                        sql`datetime(${messages.createdAt}, '+' || ${serverSettings.defaultRetentionSeconds} || ' seconds') <= CURRENT_TIMESTAMP`,
                    ),
                ),
            ),
        )
        .orderBy(sql`coalesce(${messages.expiresAt}, ${messages.createdAt})`, messages.id)
        .limit(limit);
}

function asChat(row: Record<string, unknown>): ChatSummary {
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

function agentTurnWork(row: {
    agentUserId: string;
    actorUserId: string | null;
    baselineMessageCount: number | null;
    chatId: string;
    lastSessionEventId: string | null;
    leaseExpiresAt: string | null;
    runId: string | null;
    sessionId: string;
    streamCommittedText: string;
    text: string;
    userMessageId: string;
    workerId: string | null;
}) {
    if (!row.actorUserId) throw new Error("Agent turn sender is missing");
    if (!row.workerId) throw new Error("Agent turn worker lease is missing");
    return {
        agentUserId: row.agentUserId,
        actorUserId: row.actorUserId,
        ...(row.baselineMessageCount === null
            ? {}
            : { baselineMessageCount: row.baselineMessageCount }),
        chatId: row.chatId,
        ...(row.lastSessionEventId ? { lastSessionEventId: row.lastSessionEventId } : {}),
        ...(row.leaseExpiresAt ? { leaseExpiresAt: row.leaseExpiresAt } : {}),
        ...(row.runId ? { runId: row.runId } : {}),
        sessionId: row.sessionId,
        streamCommittedText: row.streamCommittedText,
        text: row.text,
        userMessageId: row.userMessageId,
        workerId: row.workerId,
    };
}

function asRigEventCheckpoint(row: {
    cursor: number | null;
    eventsSinceTrim: number;
    lastTrimmedAt: string;
    trimmedThrough: number | null;
}): RigEventCheckpoint {
    return {
        ...(row.cursor === null ? {} : { cursor: row.cursor }),
        eventsSinceTrim: row.eventsSinceTrim,
        lastTrimmedAt: row.lastTrimmedAt,
        ...(row.trimmedThrough === null ? {} : { trimmedThrough: row.trimmedThrough }),
    };
}

function asUser(row: Record<string, unknown>): UserSummary {
    return {
        id: text(row.id),
        username: text(row.username),
        firstName: text(row.first_name),
        lastName: optionalText(row.last_name),
        title: optionalText(row.title),
        photoFileId: optionalText(row.photo_file_id),
        role: text(row.role) as "member" | "admin",
        kind: text(row.user_kind, "human") as "human" | "agent",
        agentImageId: optionalText(row.agent_image_id),
        createdByUserId: optionalText(row.created_by_user_id),
    };
}

function asAgentImage(row: Record<string, unknown>): AgentImageSummary {
    const builtinKey = optionalText(row.builtin_key);
    return {
        id: text(row.id),
        name: text(row.name),
        definitionHash: text(row.definition_hash),
        dockerTag: text(row.docker_tag),
        ...(builtinKey === "daycare-full" || builtinKey === "daycare-minimal"
            ? { builtinKey }
            : {}),
        status: text(row.status) as AgentImageSummary["status"],
        buildAttempt: number(row.build_attempt),
        buildProgress: number(row.build_progress),
        lastBuildLogLine: optionalText(row.last_build_log_line),
        buildLogUpdatedAt: optionalText(row.build_log_updated_at),
        dockerImageId: optionalText(row.docker_image_id),
        lastError: optionalText(row.last_error),
        buildRequestedAt: optionalText(row.build_requested_at),
        buildStartedAt: optionalText(row.build_started_at),
        readyAt: optionalText(row.ready_at),
        createdByUserId: optionalText(row.created_by_user_id),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asAgentImageDetails(row: Record<string, unknown>): AgentImageDetails {
    return {
        ...asAgentImage(row),
        dockerfile: text(row.dockerfile),
        buildLog: text(row.build_log, ""),
        buildLogTruncated: number(row.build_log_truncated) === 1,
    };
}

function asFile(row: Record<string, unknown>): FileSummary {
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

function asNotification(row: Record<string, unknown>): NotificationSummary {
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

function syncState(row: Record<string, unknown>): SyncState {
    return stateAt(text(row.generation), number(row.sequence));
}

function stateAt(generation: string, sequence: number): SyncState {
    return { protocolVersion: 1, generation, sequence: String(sequence) };
}

function agentReplyMutationId(sessionId: string, userMessageId: string): string {
    return `rig:${sessionId}:${userMessageId}`;
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

function isUniqueConstraint(error: unknown, seen = new Set<unknown>()): boolean {
    if (!error || typeof error !== "object" || seen.has(error)) return false;
    seen.add(error);
    const candidate = error as { cause?: unknown; code?: unknown; message?: unknown };
    return (
        String(candidate.code ?? "").includes("CONSTRAINT") ||
        String(candidate.message ?? "").includes("UNIQUE constraint") ||
        isUniqueConstraint(candidate.cause, seen)
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
