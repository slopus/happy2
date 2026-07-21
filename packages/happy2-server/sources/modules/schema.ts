import { sql } from "drizzle-orm";
import {
    type AnySQLiteColumn,
    check,
    index,
    integer,
    primaryKey,
    sqliteTable,
    text,
    uniqueIndex,
} from "drizzle-orm/sqlite-core";

// Generated from the fully migrated SQLite schema. Migrations remain the DDL authority.
export const accountBans = sqliteTable("account_bans", {
    id: text("id").primaryKey().notNull(),
    accountId: text("account_id").notNull(),
    bannedByUserId: text("banned_by_user_id"),
    reason: text("reason"),
    bannedAt: text("banned_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    revokedByUserId: text("revoked_by_user_id"),
    revokeReason: text("revoke_reason"),
});

export const accounts = sqliteTable("accounts", {
    id: text("id").primaryKey().notNull(),
    email: text("email").notNull(),
    passwordHash: text("password_hash"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    active: integer("active").notNull().default(0),
    bannedAt: text("banned_at"),
    deletedAt: text("deleted_at"),
    banExpiresAt: text("ban_expires_at"),
    banReason: text("ban_reason"),
    bannedByUserId: text("banned_by_user_id"),
});

export const apiCredentials = sqliteTable("api_credentials", {
    id: text("id").primaryKey().notNull(),
    integrationId: text("integration_id"),
    userId: text("user_id"),
    botId: text("bot_id"),
    name: text("name").notNull(),
    tokenPrefix: text("token_prefix").notNull(),
    tokenHash: text("token_hash").notNull(),
    scopesJson: text("scopes_json").notNull().default("[]"),
    createdByUserId: text("created_by_user_id"),
    expiresAt: text("expires_at"),
    lastUsedAt: text("last_used_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const auditLogEntries = sqliteTable("audit_log_entries", {
    id: text("id").primaryKey().notNull(),
    actorUserId: text("actor_user_id"),
    actorIntegrationId: text("actor_integration_id"),
    action: text("action").notNull(),
    targetType: text("target_type").notNull(),
    targetId: text("target_id"),
    chatId: text("chat_id"),
    beforeJson: text("before_json"),
    afterJson: text("after_json"),
    metadataJson: text("metadata_json"),
    clientIp: text("client_ip"),
    device: text("device"),
    appVersion: text("app_version"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const authMagicLinks = sqliteTable("auth_magic_links", {
    tokenHash: text("token_hash").primaryKey().notNull(),
    email: text("email").notNull(),
    expiresAt: text("expires_at").notNull(),
    consumedAt: text("consumed_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const authOidcStates = sqliteTable("auth_oidc_states", {
    state: text("state").primaryKey().notNull(),
    provider: text("provider").notNull(),
    codeVerifier: text("code_verifier").notNull(),
    nonce: text("nonce").notNull(),
    redirectUri: text("redirect_uri").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const authSessionEvents = sqliteTable("auth_session_events", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sessionId: text("session_id").notNull(),
    eventType: text("event_type").notNull(),
    ip: text("ip"),
    forwardedFor: text("forwarded_for"),
    location: text("location"),
    device: text("device"),
    appVersion: text("app_version"),
    userAgent: text("user_agent"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const authSessions = sqliteTable("auth_sessions", {
    id: text("id").primaryKey().notNull(),
    accountId: text("account_id").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at").notNull(),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    revokedAt: text("revoked_at"),
});

export const authDevTokens = sqliteTable(
    "auth_dev_tokens",
    {
        id: text("id").primaryKey().notNull(),
        sessionId: text("session_id")
            .notNull()
            .references(() => authSessions.id, { onDelete: "cascade" }),
        tokenHash: text("token_hash").notNull(),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        uniqueIndex("auth_dev_tokens_token_hash_unique").on(table.tokenHash),
        index("auth_dev_tokens_session_id_index").on(table.sessionId),
    ],
);

export const automationRuns = sqliteTable("automation_runs", {
    id: text("id").primaryKey().notNull(),
    automationId: text("automation_id").notNull(),
    triggerEventId: text("trigger_event_id"),
    scheduledFor: text("scheduled_for"),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    inputJson: text("input_json"),
    resultJson: text("result_json"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
});

export const automations = sqliteTable("automations", {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    createdByUserId: text("created_by_user_id"),
    botId: text("bot_id"),
    chatId: text("chat_id"),
    triggerType: text("trigger_type").notNull(),
    triggerConfigJson: text("trigger_config_json").notNull().default("{}"),
    actionType: text("action_type").notNull().default("send_message"),
    actionConfigJson: text("action_config_json").notNull().default("{}"),
    timezone: text("timezone"),
    nextRunAt: text("next_run_at"),
    active: integer("active").notNull().default(1),
    createdSequence: integer("created_sequence").notNull().default(0),
    lastRunAt: text("last_run_at"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
});

export const backupRecords = sqliteTable("backup_records", {
    id: text("id").primaryKey().notNull(),
    storageProvider: text("storage_provider").notNull(),
    storageKey: text("storage_key").notNull(),
    checksumSha256: text("checksum_sha256"),
    size: integer("size"),
    status: text("status").notNull().default("pending"),
    createdByUserId: text("created_by_user_id"),
    metadataJson: text("metadata_json"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
    retentionUntil: text("retention_until"),
});

export const botIdentities = sqliteTable("bot_identities", {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    username: text("username").notNull(),
    description: text("description"),
    photoFileId: text("photo_file_id"),
    ownerUserId: text("owner_user_id"),
    createdByUserId: text("created_by_user_id"),
    active: integer("active").notNull().default(1),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
});

export const agentImages = sqliteTable("agent_images", {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    dockerfile: text("dockerfile").notNull(),
    definitionHash: text("definition_hash").notNull(),
    dockerTag: text("docker_tag").notNull(),
    buildContext: text("build_context"),
    builtinKey: text("builtin_key"),
    status: text("status").notNull().default("pending"),
    buildAttempt: integer("build_attempt").notNull().default(0),
    buildProgress: integer("build_progress").notNull().default(0),
    buildLog: text("build_log").notNull().default(""),
    buildLogTruncated: integer("build_log_truncated").notNull().default(0),
    lastBuildLogLine: text("last_build_log_line"),
    buildLogUpdatedAt: text("build_log_updated_at"),
    dockerImageId: text("docker_image_id"),
    lastError: text("last_error"),
    buildRequestedAt: text("build_requested_at"),
    buildStartedAt: text("build_started_at"),
    readyAt: text("ready_at"),
    workerId: text("worker_id"),
    leaseExpiresAt: text("lease_expires_at"),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
});

export const agentImageSettings = sqliteTable("agent_image_settings", {
    id: integer("id").primaryKey().notNull(),
    defaultImageId: text("default_image_id").references(() => agentImages.id, {
        onDelete: "restrict",
    }),
    updatedByUserId: text("updated_by_user_id").references(() => users.id, {
        onDelete: "set null",
    }),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const agentRigBindings = sqliteTable(
    "agent_rig_bindings",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        imageId: text("image_id")
            .notNull()
            .references(() => agentImages.id, { onDelete: "restrict" }),
        sessionId: text("session_id").notNull(),
        containerName: text("container_name").notNull(),
        cwd: text("cwd").notNull(),
        effort: text("effort"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.userId, table.chatId] })],
);

export const agentSecretAgentAssignments = sqliteTable(
    "agent_secret_agent_assignments",
    {
        secretId: text("secret_id").notNull(),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdByUserId: text("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.secretId, table.agentUserId] })],
);

export const agentSecretChannelAssignments = sqliteTable(
    "agent_secret_channel_assignments",
    {
        secretId: text("secret_id").notNull(),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        createdByUserId: text("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.secretId, table.chatId] })],
);

export const callCredentialLeases = sqliteTable("call_credential_leases", {
    id: text("id").primaryKey().notNull(),
    callId: text("call_id").notNull(),
    userId: text("user_id").notNull(),
    provider: text("provider").notNull(),
    credentialUsername: text("credential_username").notNull(),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    revokedAt: text("revoked_at"),
});

export const callEvents = sqliteTable("call_events", {
    id: text("id").primaryKey().notNull(),
    callId: text("call_id").notNull(),
    kind: text("kind").notNull(),
    actorUserId: text("actor_user_id"),
    targetUserId: text("target_user_id"),
    payloadJson: text("payload_json"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const callParticipants = sqliteTable("call_participants", {
    callId: text("call_id").notNull(),
    userId: text("user_id").notNull(),
    invitedByUserId: text("invited_by_user_id"),
    status: text("status").notNull().default("invited"),
    invitedAt: text("invited_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    ringingAt: text("ringing_at"),
    joinedAt: text("joined_at"),
    leftAt: text("left_at"),
    lastSeenAt: text("last_seen_at"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const calls = sqliteTable("calls", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    createdByUserId: text("created_by_user_id"),
    kind: text("kind").notNull().default("audio"),
    status: text("status").notNull().default("ringing"),
    provider: text("provider").notNull().default("webrtc"),
    providerRoomId: text("provider_room_id"),
    providerDataJson: text("provider_data_json"),
    startedAt: text("started_at"),
    endedAt: text("ended_at"),
    endReason: text("end_reason"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const chatBookmarks = sqliteTable("chat_bookmarks", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    kind: text("kind").notNull(),
    title: text("title").notNull(),
    url: text("url"),
    messageId: text("message_id"),
    fileId: text("file_id"),
    emoji: text("emoji"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdByUserId: text("created_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const chatMembers = sqliteTable("chat_members", {
    chatId: text("chat_id").notNull(),
    userId: text("user_id").notNull(),
    role: text("role").notNull().default("member"),
    membershipEpoch: text("membership_epoch").notNull(),
    syncSequence: integer("sync_sequence").notNull().default(0),
    joinedAt: text("joined_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    leftAt: text("left_at"),
    lastReadMessageId: text("last_read_message_id"),
    lastReadSequence: integer("last_read_sequence").notNull().default(0),
    lastReadPts: integer("last_read_pts").notNull().default(0),
    lastReadAt: text("last_read_at"),
    unreadCount: integer("unread_count").notNull().default(0),
    mentionCount: integer("mention_count").notNull().default(0),
    invitedByUserId: text("invited_by_user_id"),
    removedByUserId: text("removed_by_user_id"),
});

export const chatPins = sqliteTable("chat_pins", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    messageId: text("message_id").notNull(),
    pinnedByUserId: text("pinned_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const chatSyncCompactions = sqliteTable("chat_sync_compactions", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    previousMinPts: integer("previous_min_pts").notNull(),
    newMinPts: integer("new_min_pts").notNull(),
    updatesDeleted: integer("updates_deleted").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const chatUpdates = sqliteTable("chat_updates", {
    chatId: text("chat_id").notNull(),
    pts: integer("pts").notNull(),
    ptsCount: integer("pts_count").notNull().default(1),
    kind: text("kind").notNull(),
    entityId: text("entity_id"),
    payloadJson: text("payload_json"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const chats = sqliteTable("chats", {
    id: text("id").primaryKey().notNull(),
    kind: text("kind").notNull(),
    name: text("name"),
    slug: text("slug"),
    topic: text("topic"),
    parentChatId: text("parent_chat_id").references((): AnySQLiteColumn => chats.id, {
        onDelete: "restrict",
    }),
    createdByUserId: text("created_by_user_id"),
    dmKey: text("dm_key"),
    pts: integer("pts").notNull().default(0),
    minRecoverablePts: integer("min_recoverable_pts").notNull().default(0),
    lastMessageSequence: integer("last_message_sequence").notNull().default(0),
    lastChangeSequence: integer("last_change_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
    dmType: text("dm_type").notNull().default("none"),
    visibility: text("visibility").notNull().default("private"),
    ownerUserId: text("owner_user_id"),
    photoFileId: text("photo_file_id"),
    isListed: integer("is_listed").notNull().default(1),
    archivedAt: text("archived_at"),
    archivedByUserId: text("archived_by_user_id"),
    archiveReason: text("archive_reason"),
    deletedByUserId: text("deleted_by_user_id"),
    deleteReason: text("delete_reason"),
    retentionMode: text("retention_mode").notNull().default("inherit"),
    retentionSeconds: integer("retention_seconds"),
    defaultExpiryMode: text("default_expiry_mode").notNull().default("none"),
    defaultSelfDestructSeconds: integer("default_self_destruct_seconds"),
    defaultAfterReadScope: text("default_after_read_scope").notNull().default("any_reader"),
    lifecycleVersion: integer("lifecycle_version").notNull().default(1),
    isMain: integer("is_main").notNull().default(0),
    autoJoin: integer("auto_join").notNull().default(0),
    defaultAgentUserId: text("default_agent_user_id").references(() => users.id, {
        onDelete: "restrict",
    }),
    agentModelId: text("agent_model_id"),
    isDefaultAgentConversation: integer("is_default_agent_conversation").notNull().default(0),
});

export const agentTurns = sqliteTable(
    "agent_turns",
    {
        userMessageId: text("user_message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        sessionId: text("session_id").notNull(),
        prompt: text("prompt").notNull().default(""),
        runId: text("run_id"),
        baselineMessageCount: integer("baseline_message_count"),
        lastSessionEventId: text("last_session_event_id"),
        streamCommittedText: text("stream_committed_text").notNull().default(""),
        traceLatestKind: text("trace_latest_kind"),
        traceLatestTitle: text("trace_latest_title"),
        traceLatestDetail: text("trace_latest_detail"),
        traceLatestAt: integer("trace_latest_at"),
        traceEntryCount: integer("trace_entry_count").notNull().default(0),
        traceSubagentsJson: text("trace_subagents_json").notNull().default("[]"),
        traceBackgroundTerminalsJson: text("trace_background_terminals_json")
            .notNull()
            .default("[]"),
        status: text("status").notNull().default("pending"),
        assistantMessageId: text("assistant_message_id").references(() => messages.id, {
            onDelete: "set null",
        }),
        lastError: text("last_error"),
        workerId: text("worker_id"),
        leaseExpiresAt: text("lease_expires_at"),
        startedAt: text("started_at"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        completedAt: text("completed_at"),
    },
    (table) => [primaryKey({ columns: [table.userMessageId, table.agentUserId] })],
);

export const agentTurnTraceEntries = sqliteTable(
    "agent_turn_trace_entries",
    {
        id: text("id").primaryKey().notNull(),
        userMessageId: text("user_message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        traceKey: text("trace_key").notNull(),
        sessionEventId: text("session_event_id").notNull(),
        kind: text("kind").notNull(),
        title: text("title").notNull(),
        detail: text("detail"),
        status: text("status").notNull(),
        occurredAt: integer("occurred_at").notNull(),
        completedAt: integer("completed_at"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        uniqueIndex("agent_turn_trace_entries_turn_key_unique").on(
            table.userMessageId,
            table.agentUserId,
            table.traceKey,
        ),
        index("agent_turn_trace_entries_turn_time_index").on(
            table.userMessageId,
            table.agentUserId,
            table.occurredAt,
        ),
    ],
);

export const rigEventSyncState = sqliteTable("rig_event_sync_state", {
    id: integer("id").primaryKey().notNull(),
    cursor: integer("cursor"),
    trimmedThrough: integer("trimmed_through"),
    eventsSinceTrim: integer("events_since_trim").notNull().default(0),
    lastTrimmedAt: text("last_trimmed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const clientMutations = sqliteTable("client_mutations", {
    actorUserId: text("actor_user_id").notNull(),
    scope: text("scope").notNull(),
    clientMutationId: text("client_mutation_id").notNull(),
    resultJson: text("result_json").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
    lastAccessedAt: text("last_accessed_at"),
});

export const customEmojiRevisions = sqliteTable("custom_emoji_revisions", {
    id: text("id").primaryKey().notNull(),
    customEmojiId: text("custom_emoji_id").notNull(),
    name: text("name").notNull(),
    fileId: text("file_id").notNull(),
    changedByUserId: text("changed_by_user_id"),
    changeKind: text("change_kind").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const customEmojis = sqliteTable("custom_emojis", {
    id: text("id").primaryKey().notNull(),
    name: text("name").notNull(),
    fileId: text("file_id").notNull(),
    createdByUserId: text("created_by_user_id"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
    promotedAt: text("promoted_at"),
    promotedByUserId: text("promoted_by_user_id"),
});

export const drafts = sqliteTable(
    "drafts",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        text: text("text").notNull().default(""),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.userId, table.chatId] })],
);

export const documents = sqliteTable(
    "documents",
    {
        id: text("id").primaryKey().notNull(),
        ownerUserId: text("owner_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        title: text("title").notNull().default(""),
        format: text("format").notNull().default("blocknote"),
        snapshotUpdate: text("snapshot_update").notNull(),
        snapshotSequence: integer("snapshot_sequence").notNull().default(0),
        lastSequence: integer("last_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [index("documents_owner_user_id_idx").on(table.ownerUserId)],
);

export const documentChannelAttachments = sqliteTable(
    "document_channel_attachments",
    {
        documentId: text("document_id")
            .notNull()
            .references(() => documents.id, { onDelete: "cascade" }),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        attachedByUserId: text("attached_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "restrict" }),
        attachedAt: text("attached_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.documentId, table.chatId] }),
        index("document_channel_attachments_chat_id_idx").on(table.chatId),
        index("document_channel_attachments_attached_by_user_id_idx").on(table.attachedByUserId),
    ],
);

export const documentUpdates = sqliteTable(
    "document_updates",
    {
        documentId: text("document_id")
            .notNull()
            .references(() => documents.id, { onDelete: "cascade" }),
        sequence: integer("sequence").notNull(),
        update: text("update").notNull(),
        clientUpdateId: text("client_update_id").notNull(),
        actorUserId: text("actor_user_id"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.documentId, table.sequence] }),
        uniqueIndex("document_updates_client_update_idx").on(
            table.documentId,
            table.clientUpdateId,
        ),
    ],
);

export const documentWriteRequests = sqliteTable(
    "document_write_requests",
    {
        id: text("id").primaryKey().notNull(),
        status: text("status").notNull().default("pending"),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        actorUserId: text("actor_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        agentUserId: text("agent_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        requesterInstallationId: text("requester_installation_id").references(
            () => pluginInstallations.id,
            { onDelete: "set null" },
        ),
        sessionId: text("session_id").notNull(),
        callId: text("call_id").notNull(),
        documentId: text("document_id").notNull(),
        documentTitle: text("document_title").notNull(),
        clientUpdateId: text("client_update_id").notNull(),
        baseSequence: text("base_sequence").notNull().default("0"),
        updatesJson: text("updates_json").notNull(),
        acceptedSequence: text("accepted_sequence"),
        resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        resolvedAt: text("resolved_at"),
        expiresAt: text("expires_at").notNull(),
        lastError: text("last_error"),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        index("document_write_requests_chat_index").on(table.chatId, table.createdAt),
        index("document_write_requests_pending_expiry_index").on(table.status, table.expiresAt),
        uniqueIndex("document_write_requests_call_unique").on(
            table.requesterInstallationId,
            table.callId,
        ),
        check(
            "document_write_requests_status_check",
            sql`${table.status} in ('pending', 'approved', 'denied', 'failed')`,
        ),
        check(
            "document_write_requests_updates_check",
            sql`json_valid(${table.updatesJson}) and json_type(${table.updatesJson}) = 'array'`,
        ),
    ],
);

export const dataExportJobs = sqliteTable("data_export_jobs", {
    id: text("id").primaryKey().notNull(),
    requestedByUserId: text("requested_by_user_id"),
    kind: text("kind").notNull(),
    targetId: text("target_id"),
    status: text("status").notNull().default("pending"),
    outputFileId: text("output_file_id"),
    optionsJson: text("options_json"),
    lastError: text("last_error"),
    expiresAt: text("expires_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
});

export const fileAccessGrants = sqliteTable("file_access_grants", {
    id: text("id").primaryKey().notNull(),
    fileId: text("file_id").notNull(),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    sourceMessageId: text("source_message_id"),
    grantedByUserId: text("granted_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
});

export const fileDerivatives = sqliteTable("file_derivatives", {
    sourceFileId: text("source_file_id").notNull(),
    derivedFileId: text("derived_file_id").notNull(),
    kind: text("kind").notNull(),
    variant: text("variant").notNull().default("default"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const fileProcessingJobs = sqliteTable("file_processing_jobs", {
    id: text("id").primaryKey().notNull(),
    fileId: text("file_id").notNull(),
    kind: text("kind").notNull(),
    status: text("status").notNull().default("pending"),
    inputJson: text("input_json"),
    resultJson: text("result_json"),
    attempts: integer("attempts").notNull().default(0),
    runAfter: text("run_after").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    lockedAt: text("locked_at"),
    lockedBy: text("locked_by"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
});

export const fileScanEvents = sqliteTable("file_scan_events", {
    id: text("id").primaryKey().notNull(),
    fileId: text("file_id").notNull(),
    scanner: text("scanner").notNull(),
    status: text("status").notNull(),
    resultJson: text("result_json"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const fileUploadParts = sqliteTable("file_upload_parts", {
    uploadSessionId: text("upload_session_id").notNull(),
    partNumber: integer("part_number").notNull(),
    byteOffset: integer("byte_offset").notNull(),
    size: integer("size").notNull(),
    checksumSha256: text("checksum_sha256"),
    storageEtag: text("storage_etag"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const fileUploadSessions = sqliteTable("file_upload_sessions", {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    fileId: text("file_id"),
    storageProvider: text("storage_provider").notNull().default("local"),
    storageKey: text("storage_key").notNull(),
    originalName: text("original_name").notNull(),
    contentType: text("content_type").notNull(),
    expectedSize: integer("expected_size").notNull(),
    receivedSize: integer("received_size").notNull().default(0),
    chunkSize: integer("chunk_size").notNull(),
    checksumSha256: text("checksum_sha256"),
    status: text("status").notNull().default("pending"),
    clientMutationId: text("client_mutation_id"),
    metadataJson: text("metadata_json"),
    lastError: text("last_error"),
    expiresAt: text("expires_at").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
});

export const files = sqliteTable("files", {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    storageName: text("storage_name").notNull(),
    contentType: text("content_type").notNull(),
    size: integer("size").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    thumbhash: text("thumbhash").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    uploadedByUserId: text("uploaded_by_user_id"),
    isPublic: integer("is_public").notNull().default(0),
    kind: text("kind").notNull().default("file"),
    originalName: text("original_name"),
    durationMs: integer("duration_ms"),
    storageProvider: text("storage_provider").notNull().default("local"),
    storageKey: text("storage_key"),
    checksumSha256: text("checksum_sha256"),
    accessScope: text("access_scope").notNull().default("private"),
    uploadStatus: text("upload_status").notNull().default("complete"),
    scanStatus: text("scan_status").notNull().default("unscanned"),
    scannedAt: text("scanned_at"),
    scanResultJson: text("scan_result_json"),
    mediaMetadataJson: text("media_metadata_json"),
    codec: text("codec"),
    previewFileId: text("preview_file_id"),
    thumbnailFileId: text("thumbnail_file_id"),
    orphanedAt: text("orphaned_at"),
    retentionUntil: text("retention_until"),
    deletedAt: text("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
    deleteReason: text("delete_reason"),
});

export const idempotencyKeys = sqliteTable("idempotency_keys", {
    id: text("id").primaryKey().notNull(),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    scope: text("scope").notNull(),
    idempotencyKey: text("idempotency_key").notNull(),
    requestHash: text("request_hash").notNull(),
    status: text("status").notNull().default("in_progress"),
    responseStatus: integer("response_status"),
    responseJson: text("response_json"),
    lockedUntil: text("locked_until"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at").notNull(),
});

export const integrations = sqliteTable("integrations", {
    id: text("id").primaryKey().notNull(),
    kind: text("kind").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    botId: text("bot_id"),
    createdByUserId: text("created_by_user_id"),
    scopesJson: text("scopes_json").notNull().default("[]"),
    configJson: text("config_json"),
    active: integer("active").notNull().default(1),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deletedAt: text("deleted_at"),
});

export const plugins = sqliteTable(
    "plugins",
    {
        id: text("id").primaryKey().notNull(),
        displayName: text("display_name").notNull(),
        shortName: text("short_name").notNull().unique(),
        description: text("description").notNull(),
        sourceKind: text("source_kind").notNull(),
        sourceReference: text("source_reference").notNull(),
        sourceVersion: text("source_version").notNull(),
        packageDigest: text("package_digest").notNull(),
        manifestJson: text("manifest_json").notNull(),
        packageDirectory: text("package_directory").notNull(),
        imageStorageKey: text("image_storage_key").notNull(),
        imageContentType: text("image_content_type").notNull(),
        imageSize: integer("image_size").notNull(),
        imageWidth: integer("image_width").notNull(),
        imageHeight: integer("image_height").notNull(),
        imageThumbhash: text("image_thumbhash").notNull(),
        imageChecksumSha256: text("image_checksum_sha256").notNull(),
        installedByUserId: text("installed_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        syncSequence: integer("sync_sequence").notNull().default(0),
        installedAt: text("installed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [uniqueIndex("plugins_source_unique").on(table.sourceKind, table.sourceReference)],
);

export const pluginInstallations = sqliteTable(
    "plugin_installations",
    {
        id: text("id").primaryKey().notNull(),
        pluginId: text("plugin_id")
            .notNull()
            .references(() => plugins.id, { onDelete: "restrict" }),
        containerImageId: text("container_image_id").references(() => agentImages.id, {
            onDelete: "restrict",
        }),
        runtimeImageTag: text("runtime_image_tag"),
        containerName: text("container_name"),
        containerInstanceId: text("container_instance_id"),
        grantedPermissionsJson: text("granted_permissions_json").notNull().default("[]"),
        status: text("status").notNull().default("preparing"),
        statusDetail: text("status_detail"),
        lastError: text("last_error"),
        diagnosticOutput: text("diagnostic_output"),
        sourceVersion: text("source_version").notNull(),
        packageDigest: text("package_digest").notNull(),
        manifestJson: text("manifest_json").notNull(),
        packageDirectory: text("package_directory").notNull(),
        installedByUserId: text("installed_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        syncSequence: integer("sync_sequence").notNull().default(0),
        installedAt: text("installed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        readyAt: text("ready_at"),
        mcpToolsSyncedAt: text("mcp_tools_synced_at"),
    },
    (table) => [index("plugin_installations_plugin_id_index").on(table.pluginId)],
);

export const pluginUiAssets = sqliteTable(
    "plugin_ui_assets",
    {
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        assetId: text("asset_id").notNull(),
        relativePath: text("relative_path").notNull(),
        contentType: text("content_type").notNull(),
        byteSize: integer("byte_size").notNull(),
        width: integer("width").notNull(),
        height: integer("height").notNull(),
        checksumSha256: text("checksum_sha256").notNull(),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.installationId, table.assetId] }),
        index("plugin_ui_assets_checksum_index").on(table.checksumSha256),
        check("plugin_ui_assets_asset_id_check", sql`length(${table.assetId}) between 1 and 64`),
        check(
            "plugin_ui_assets_relative_path_check",
            sql`length(${table.relativePath}) between 1 and 512`,
        ),
        check("plugin_ui_assets_content_type_check", sql`${table.contentType} = 'image/png'`),
        check("plugin_ui_assets_byte_size_check", sql`${table.byteSize} between 1 and 65536`),
        check(
            "plugin_ui_assets_dimensions_check",
            sql`${table.width} = 40 and ${table.height} = 40`,
        ),
        check(
            "plugin_ui_assets_checksum_check",
            sql`length(${table.checksumSha256}) = 64 and ${table.checksumSha256} not glob '*[^0-9a-f]*'`,
        ),
    ],
);

export const pluginAppInstances = sqliteTable(
    "plugin_app_instances",
    {
        id: text("id").primaryKey().notNull(),
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        instanceKey: text("instance_key").notNull(),
        resourceUri: text("resource_uri").notNull(),
        resourceHtml: text("resource_html").notNull(),
        resourceContentHashSha256: text("resource_content_hash_sha256").notNull(),
        resourceCspJson: text("resource_csp_json"),
        resourcePermissionsJson: text("resource_permissions_json"),
        resourceDomain: text("resource_domain"),
        resourcePrefersBorder: integer("resource_prefers_border", { mode: "boolean" }),
        title: text("title").notNull(),
        description: text("description").notNull(),
        assetId: text("asset_id").notNull(),
        contextJson: text("context_json").notNull().default("{}"),
        dataRevision: integer("data_revision").notNull().default(0),
        scope: text("scope").notNull(),
        ownerUserId: text("owner_user_id").references(() => users.id, {
            onDelete: "cascade",
        }),
        chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),
        presentation: text("presentation").notNull().default("sidebar"),
        position: text("position").notNull(),
        revision: integer("revision").notNull().default(0),
        createdByUserId: text("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        uniqueIndex("plugin_app_instances_installation_key_unique").on(
            table.installationId,
            table.instanceKey,
        ),
        index("plugin_app_instances_resource_index").on(table.installationId, table.resourceUri),
        index("plugin_app_instances_owner_index").on(
            table.ownerUserId,
            table.presentation,
            table.position,
        ),
        index("plugin_app_instances_chat_index").on(
            table.chatId,
            table.presentation,
            table.position,
        ),
        index("plugin_app_instances_listing_index").on(
            table.scope,
            table.presentation,
            table.position,
        ),
        check(
            "plugin_app_instances_instance_key_check",
            sql`length(${table.instanceKey}) between 1 and 128`,
        ),
        check(
            "plugin_app_instances_resource_uri_check",
            sql`length(${table.resourceUri}) between 6 and 2048 and substr(${table.resourceUri}, 1, 5) = 'ui://'`,
        ),
        check(
            "plugin_app_instances_resource_hash_check",
            sql`length(${table.resourceContentHashSha256}) = 64 and ${table.resourceContentHashSha256} not glob '*[^0-9a-f]*'`,
        ),
        check(
            "plugin_app_instances_resource_csp_check",
            sql`${table.resourceCspJson} is null or (json_valid(${table.resourceCspJson}) and json_type(${table.resourceCspJson}) = 'object')`,
        ),
        check(
            "plugin_app_instances_resource_permissions_check",
            sql`${table.resourcePermissionsJson} is null or (json_valid(${table.resourcePermissionsJson}) and json_type(${table.resourcePermissionsJson}) = 'object')`,
        ),
        check(
            "plugin_app_instances_resource_border_check",
            sql`${table.resourcePrefersBorder} is null or ${table.resourcePrefersBorder} in (0, 1)`,
        ),
        check(
            "plugin_app_instances_title_check",
            sql`length(trim(${table.title})) between 1 and 64`,
        ),
        check(
            "plugin_app_instances_description_check",
            sql`length(trim(${table.description})) between 1 and 256`,
        ),
        check(
            "plugin_app_instances_asset_id_check",
            sql`length(${table.assetId}) between 1 and 64`,
        ),
        check(
            "plugin_app_instances_context_check",
            sql`length(${table.contextJson}) <= 32768 and case when json_valid(${table.contextJson}) then json_type(${table.contextJson}) = 'object' else 0 end`,
        ),
        check("plugin_app_instances_data_revision_check", sql`${table.dataRevision} >= 0`),
        check("plugin_app_instances_scope_check", sql`${table.scope} in ('all_users', 'user')`),
        check(
            "plugin_app_instances_owner_check",
            sql`(${table.scope} = 'all_users' and ${table.ownerUserId} is null) or (${table.scope} = 'user' and ${table.ownerUserId} is not null)`,
        ),
        check(
            "plugin_app_instances_presentation_check",
            sql`${table.presentation} in ('sidebar', 'detached')`,
        ),
        check(
            "plugin_app_instances_position_check",
            sql`length(${table.position}) between 1 and 256`,
        ),
        check("plugin_app_instances_revision_check", sql`${table.revision} >= 0`),
        check("plugin_app_instances_sync_sequence_check", sql`${table.syncSequence} >= 0`),
    ],
);

export const pluginContributions = sqliteTable(
    "plugin_contributions",
    {
        id: text("id").primaryKey().notNull(),
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        contributionKey: text("contribution_key").notNull(),
        placement: text("placement").notNull(),
        title: text("title").notNull(),
        description: text("description").notNull(),
        specJson: text("spec_json").notNull(),
        scope: text("scope").notNull(),
        ownerUserId: text("owner_user_id").references(() => users.id, {
            onDelete: "cascade",
        }),
        chatId: text("chat_id").references(() => chats.id, { onDelete: "cascade" }),
        position: text("position").notNull(),
        revision: integer("revision").notNull().default(0),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        uniqueIndex("plugin_contributions_installation_key_unique").on(
            table.installationId,
            table.contributionKey,
        ),
        index("plugin_contributions_placement_index").on(table.placement, table.position),
        index("plugin_contributions_owner_index").on(
            table.ownerUserId,
            table.placement,
            table.position,
        ),
        index("plugin_contributions_chat_index").on(table.chatId, table.placement, table.position),
        check(
            "plugin_contributions_key_check",
            sql`length(${table.contributionKey}) between 1 and 128`,
        ),
        check(
            "plugin_contributions_placement_check",
            sql`${table.placement} in ('sidebarMenu', 'profileSection', 'pluginSettings', 'chatMenu', 'composerIcon', 'composerMenu', 'messageMenu')`,
        ),
        check(
            "plugin_contributions_title_check",
            sql`length(trim(${table.title})) between 1 and 64`,
        ),
        check(
            "plugin_contributions_description_check",
            sql`length(trim(${table.description})) between 1 and 256`,
        ),
        check(
            "plugin_contributions_spec_check",
            sql`length(${table.specJson}) between 2 and 32768 and case when json_valid(${table.specJson}) then json_type(${table.specJson}) = 'object' else 0 end`,
        ),
        check("plugin_contributions_scope_check", sql`${table.scope} in ('all_users', 'user')`),
        check(
            "plugin_contributions_owner_check",
            sql`(${table.scope} = 'all_users' and ${table.ownerUserId} is null) or (${table.scope} = 'user' and ${table.ownerUserId} is not null)`,
        ),
        check(
            "plugin_contributions_position_check",
            sql`length(${table.position}) between 1 and 256`,
        ),
        check("plugin_contributions_revision_check", sql`${table.revision} >= 0`),
        check("plugin_contributions_sync_sequence_check", sql`${table.syncSequence} >= 0`),
    ],
);

export const appPresentationPreferences = sqliteTable(
    "app_presentation_preferences",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        instanceId: text("instance_id")
            .notNull()
            .references(() => pluginAppInstances.id, { onDelete: "cascade" }),
        hidden: integer("hidden", { mode: "boolean" }).notNull().default(false),
        position: text("position"),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.instanceId] }),
        index("app_presentation_preferences_instance_index").on(table.instanceId),
        index("app_presentation_preferences_user_listing_index").on(
            table.userId,
            table.hidden,
            table.position,
        ),
        check("app_presentation_preferences_hidden_check", sql`${table.hidden} in (0, 1)`),
        check(
            "app_presentation_preferences_position_check",
            sql`${table.position} is null or length(${table.position}) between 1 and 256`,
        ),
        check("app_presentation_preferences_sync_sequence_check", sql`${table.syncSequence} >= 0`),
    ],
);

export const pluginSkills = sqliteTable(
    "plugin_skills",
    {
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        description: text("description").notNull(),
        directory: text("directory").notNull(),
    },
    (table) => [primaryKey({ columns: [table.installationId, table.name] })],
);

export const pluginInstallationVariables = sqliteTable(
    "plugin_installation_variables",
    {
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        key: text("key").notNull(),
        kind: text("kind").notNull(),
        textValue: text("text_value"),
        secretCiphertext: text("secret_ciphertext"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.installationId, table.key] })],
);

export const pluginFunctionResults = sqliteTable(
    "plugin_function_results",
    {
        sessionId: text("session_id").notNull(),
        callId: text("call_id").notNull(),
        status: text("status").notNull().default("in_progress"),
        leaseToken: text("lease_token"),
        lockedUntil: text("locked_until"),
        resolutionJson: text("resolution_json"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.sessionId, table.callId] })],
);

export const pluginMcpAppCalls = sqliteTable(
    "plugin_mcp_app_calls",
    {
        sessionId: text("session_id").notNull(),
        callId: text("call_id").notNull(),
        userMessageId: text("user_message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        toolName: text("tool_name").notNull(),
        resourceUri: text("resource_uri").notNull(),
        argumentsJson: text("arguments_json").notNull(),
        status: text("status").notNull().default("in_progress"),
        resultJson: text("result_json"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.sessionId, table.callId] }),
        index("plugin_mcp_app_calls_turn_index").on(table.userMessageId, table.agentUserId),
        index("plugin_mcp_app_calls_installation_index").on(table.installationId),
    ],
);

export const pluginResourceLinks = sqliteTable(
    "plugin_resource_links",
    {
        sessionId: text("session_id").notNull(),
        callId: text("call_id").notNull(),
        position: integer("position").notNull(),
        userMessageId: text("user_message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        toolName: text("tool_name").notNull(),
        kind: text("kind").notNull(),
        uri: text("uri").notNull(),
        name: text("name").notNull(),
        title: text("title"),
        description: text("description"),
        mimeType: text("mime_type"),
        size: integer("size"),
    },
    (table) => [
        primaryKey({ columns: [table.sessionId, table.callId, table.position] }),
        index("plugin_resource_links_turn_index").on(table.userMessageId, table.agentUserId),
        index("plugin_resource_links_installation_index").on(table.installationId),
        check("plugin_resource_links_position_check", sql`${table.position} >= 0`),
        check(
            "plugin_resource_links_kind_check",
            sql`${table.kind} in ('resource', 'shared_link')`,
        ),
        check("plugin_resource_links_size_check", sql`${table.size} is null or ${table.size} >= 0`),
    ],
);

export const pluginMcpAppResources = sqliteTable(
    "plugin_mcp_app_resources",
    {
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        uri: text("uri").notNull(),
        html: text("html").notNull(),
        contentHashSha256: text("content_hash_sha256").notNull(),
        cspJson: text("csp_json"),
        permissionsJson: text("permissions_json"),
        domain: text("domain"),
        prefersBorder: integer("prefers_border", { mode: "boolean" }),
        syncedAt: text("synced_at").notNull(),
    },
    (table) => [primaryKey({ columns: [table.installationId, table.uri] })],
);

export const pluginMcpTools = sqliteTable(
    "plugin_mcp_tools",
    {
        installationId: text("installation_id")
            .notNull()
            .references(() => pluginInstallations.id, { onDelete: "cascade" }),
        name: text("name").notNull(),
        title: text("title"),
        description: text("description"),
        inputSchemaJson: text("input_schema_json").notNull(),
        outputSchemaJson: text("output_schema_json"),
        annotationsJson: text("annotations_json"),
        metaJson: text("meta_json"),
        syncedAt: text("synced_at").notNull(),
    },
    (table) => [primaryKey({ columns: [table.installationId, table.name] })],
);

export const portShares = sqliteTable(
    "port_shares",
    {
        id: text("id").primaryKey().notNull(),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        containerName: text("container_name").notNull(),
        containerPort: integer("container_port").notNull(),
        name: text("name").notNull(),
        subdomain: text("subdomain").notNull(),
        audience: text("audience").notNull().default("chat"),
        createdByUserId: text("created_by_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        disabledAt: text("disabled_at"),
        disabledByUserId: text("disabled_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
    },
    (table) => [
        check(
            "port_shares_container_port_check",
            sql`${table.containerPort} BETWEEN 3000 AND 3010`,
        ),
        check(
            "port_shares_audience_check",
            sql`${table.audience} IN ('internet', 'server', 'chat')`,
        ),
        uniqueIndex("port_shares_subdomain_unique").on(table.subdomain),
        uniqueIndex("port_shares_active_chat_unique")
            .on(table.chatId)
            .where(sql`${table.disabledAt} IS NULL`),
        index("port_shares_chat_id_index").on(table.chatId),
    ],
);

export const pluginManagementRequests = sqliteTable(
    "plugin_management_requests",
    {
        id: text("id").primaryKey().notNull(),
        action: text("action").notNull(),
        status: text("status").notNull().default("pending"),
        chatId: text("chat_id")
            .notNull()
            .references(() => chats.id, { onDelete: "cascade" }),
        actorUserId: text("actor_user_id").references(() => users.id, { onDelete: "set null" }),
        agentUserId: text("agent_user_id").references(() => users.id, { onDelete: "set null" }),
        requesterInstallationId: text("requester_installation_id").references(
            () => pluginInstallations.id,
            { onDelete: "set null" },
        ),
        callId: text("call_id").notNull(),
        displayName: text("display_name").notNull(),
        shortName: text("short_name").notNull(),
        description: text("description").notNull(),
        reason: text("reason"),
        sourceKind: text("source_kind"),
        sourceReference: text("source_reference"),
        packageDigest: text("package_digest"),
        packageDirectory: text("package_directory"),
        targetInstallationId: text("target_installation_id"),
        installationId: text("installation_id"),
        resolvedByUserId: text("resolved_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        resolvedAt: text("resolved_at"),
        lastError: text("last_error"),
        syncSequence: integer("sync_sequence").notNull().default(0),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        index("plugin_management_requests_chat_index").on(table.chatId, table.createdAt),
        uniqueIndex("plugin_management_requests_call_unique").on(
            table.requesterInstallationId,
            table.callId,
            table.action,
        ),
    ],
);

export const messageAttachments = sqliteTable("message_attachments", {
    messageId: text("message_id").notNull(),
    fileId: text("file_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageForwardMetadata = sqliteTable("message_forward_metadata", {
    messageId: text("message_id").primaryKey().notNull(),
    sourceMessageId: text("source_message_id"),
    sourceChatId: text("source_chat_id"),
    sourceSenderUserId: text("source_sender_user_id"),
    sourceSenderBotId: text("source_sender_bot_id"),
    sourceSenderName: text("source_sender_name"),
    sourceCreatedAt: text("source_created_at"),
    sourceTextSnapshot: text("source_text_snapshot"),
    forwardedByUserId: text("forwarded_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageMentions = sqliteTable("message_mentions", {
    id: text("id").primaryKey().notNull(),
    messageId: text("message_id").notNull(),
    kind: text("kind").notNull(),
    mentionedUserId: text("mentioned_user_id"),
    startOffset: integer("start_offset").notNull(),
    length: integer("length").notNull(),
    rawText: text("raw_text").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageReceipts = sqliteTable("message_receipts", {
    messageId: text("message_id").notNull(),
    userId: text("user_id").notNull(),
    deliveredAt: text("delivered_at"),
    readAt: text("read_at"),
    expiryTriggeredAt: text("expiry_triggered_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageRevisions = sqliteTable("message_revisions", {
    id: text("id").primaryKey().notNull(),
    messageId: text("message_id").notNull(),
    revision: integer("revision").notNull(),
    text: text("text").notNull().default(""),
    contentJson: text("content_json"),
    editedByUserId: text("edited_by_user_id"),
    editReason: text("edit_reason"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageSearchDocuments = sqliteTable("message_search_documents", {
    messageId: text("message_id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    normalizedText: text("normalized_text").notNull(),
    normalizedLength: integer("normalized_length").notNull(),
    gramCount: integer("gram_count").notNull().default(0),
    indexedRevision: integer("indexed_revision").notNull(),
    contentHash: text("content_hash"),
    messageCreatedAt: text("message_created_at").notNull(),
    indexedAt: text("indexed_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const messageSearchNgrams = sqliteTable("message_search_ngrams", {
    gram: text("gram").notNull(),
    messageId: text("message_id").notNull(),
    occurrences: integer("occurrences").notNull().default(1),
});

export const messages = sqliteTable("messages", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    sequence: integer("sequence").notNull(),
    changePts: integer("change_pts").notNull(),
    senderUserId: text("sender_user_id"),
    kind: text("kind").notNull().default("user"),
    text: text("text").notNull().default(""),
    quotedMessageId: text("quoted_message_id"),
    forwardedFromMessageId: text("forwarded_from_message_id"),
    expiresAt: text("expires_at"),
    editedAt: text("edited_at"),
    deletedAt: text("deleted_at"),
    deletedByUserId: text("deleted_by_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    senderBotId: text("sender_bot_id"),
    contentJson: text("content_json"),
    revision: integer("revision").notNull().default(1),
    editedByUserId: text("edited_by_user_id"),
    editReason: text("edit_reason"),
    publishedAt: text("published_at"),
    expiryMode: text("expiry_mode").notNull().default("none"),
    selfDestructSeconds: integer("self_destruct_seconds"),
    afterReadScope: text("after_read_scope").notNull().default("any_reader"),
    firstReadAt: text("first_read_at"),
    hardDeleteAt: text("hard_delete_at"),
    deleteReason: text("delete_reason"),
    audience: text("audience").notNull().default("people"),
});

export const messageAgentAudiences = sqliteTable(
    "message_agent_audiences",
    {
        messageId: text("message_id")
            .notNull()
            .references(() => messages.id, { onDelete: "cascade" }),
        agentUserId: text("agent_user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.messageId, table.agentUserId] })],
);

export const moderationActions = sqliteTable("moderation_actions", {
    id: text("id").primaryKey().notNull(),
    reportId: text("report_id"),
    actorUserId: text("actor_user_id"),
    targetUserId: text("target_user_id"),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    fileId: text("file_id"),
    action: text("action").notNull(),
    reason: text("reason"),
    metadataJson: text("metadata_json"),
    automationRunId: text("automation_run_id"),
    expiresAt: text("expires_at"),
    revokedAt: text("revoked_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const moderationReports = sqliteTable("moderation_reports", {
    id: text("id").primaryKey().notNull(),
    reportedByUserId: text("reported_by_user_id"),
    targetUserId: text("target_user_id"),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    fileId: text("file_id"),
    reason: text("reason").notNull(),
    details: text("details"),
    status: text("status").notNull().default("open"),
    assignedToUserId: text("assigned_to_user_id"),
    resolution: text("resolution"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    resolvedAt: text("resolved_at"),
});

export const notifications = sqliteTable("notifications", {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    actorUserId: text("actor_user_id"),
    actorBotId: text("actor_bot_id"),
    payloadJson: text("payload_json"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    readAt: text("read_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    expiresAt: text("expires_at"),
});

export const oidcIdentities = sqliteTable("oidc_identities", {
    provider: text("provider").notNull(),
    subject: text("subject").notNull(),
    accountId: text("account_id").notNull(),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const rateLimitBuckets = sqliteTable("rate_limit_buckets", {
    principalKey: text("principal_key").notNull(),
    action: text("action").notNull(),
    windowStartedAt: text("window_started_at").notNull(),
    windowSeconds: integer("window_seconds").notNull(),
    requestCount: integer("request_count").notNull().default(0),
    blockedUntil: text("blocked_until"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const roles = sqliteTable(
    "roles",
    {
        id: text("id").primaryKey().notNull(),
        name: text("name").notNull(),
        description: text("description"),
        builtinKind: text("builtin_kind"),
        createdByUserId: text("created_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        uniqueIndex("roles_name_unique").on(table.name),
        uniqueIndex("roles_builtin_kind_unique").on(table.builtinKind),
    ],
);
// Migration 0023 additionally gives roles.name NOCASE collation, constrains both role enum
// columns, makes the built-in index partial, and installs triggers that preserve built-in markers.

export const rolePermissions = sqliteTable(
    "role_permissions",
    {
        roleId: text("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }),
        permission: text("permission").notNull(),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.roleId, table.permission] })],
);

export const reactions = sqliteTable("reactions", {
    messageId: text("message_id").notNull(),
    userId: text("user_id").notNull(),
    reactionKey: text("reaction_key").notNull(),
    emoji: text("emoji"),
    customEmojiId: text("custom_emoji_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    customEmojiNameSnapshot: text("custom_emoji_name_snapshot"),
    customEmojiFileIdSnapshot: text("custom_emoji_file_id_snapshot"),
});

export const retentionRuns = sqliteTable("retention_runs", {
    id: text("id").primaryKey().notNull(),
    scope: text("scope").notNull(),
    status: text("status").notNull().default("running"),
    itemsExamined: integer("items_examined").notNull().default(0),
    itemsDeleted: integer("items_deleted").notNull().default(0),
    detailsJson: text("details_json"),
    lastError: text("last_error"),
    startedAt: text("started_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
});

export const scheduledMessageAttachments = sqliteTable("scheduled_message_attachments", {
    scheduledMessageId: text("scheduled_message_id").notNull(),
    fileId: text("file_id").notNull(),
    position: integer("position").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const scheduledMessages = sqliteTable("scheduled_messages", {
    id: text("id").primaryKey().notNull(),
    chatId: text("chat_id").notNull(),
    createdByUserId: text("created_by_user_id"),
    senderBotId: text("sender_bot_id"),
    text: text("text").notNull().default(""),
    contentJson: text("content_json"),
    quotedMessageId: text("quoted_message_id"),
    forwardedFromMessageId: text("forwarded_from_message_id"),
    scheduledFor: text("scheduled_for").notNull(),
    timezone: text("timezone"),
    status: text("status").notNull().default("scheduled"),
    publishedMessageId: text("published_message_id"),
    lastError: text("last_error"),
    clientMutationId: text("client_mutation_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    cancelledAt: text("cancelled_at"),
    publishedAt: text("published_at"),
});

export const searchIndexState = sqliteTable("search_index_state", {
    entityKind: text("entity_kind").primaryKey().notNull(),
    version: integer("version").notNull().default(1),
    status: text("status").notNull().default("ready"),
    lastIndexedId: text("last_indexed_id"),
    lastError: text("last_error"),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const serverSettings = sqliteTable("server_settings", {
    id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
    name: text("name").notNull(),
    title: text("title"),
    photoFileId: text("photo_file_id"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    defaultRetentionMode: text("default_retention_mode").notNull().default("forever"),
    defaultRetentionSeconds: integer("default_retention_seconds"),
    defaultFileQuotaBytes: integer("default_file_quota_bytes"),
    maxUploadBytes: integer("max_upload_bytes"),
    syncEventRetentionSeconds: integer("sync_event_retention_seconds").notNull().default(2592000),
    chatUpdateRetentionSeconds: integer("chat_update_retention_seconds").notNull().default(2592000),
    idempotencyRetentionSeconds: integer("idempotency_retention_seconds").notNull().default(604800),
});

export const serverSetupState = sqliteTable("server_setup_state", {
    id: integer("id").primaryKey().notNull(),
    schemaVersion: integer("schema_version").notNull().default(1),
    bootstrapAccountId: text("bootstrap_account_id").references(() => accounts.id, {
        onDelete: "restrict",
    }),
    bootstrapAdminUserId: text("bootstrap_admin_user_id").references(() => users.id, {
        onDelete: "restrict",
    }),
    registrationEnabled: integer("registration_enabled"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const serverSetupSteps = sqliteTable("server_setup_steps", {
    step: text("step").primaryKey().notNull(),
    state: text("state").notNull().default("pending"),
    metadataJson: text("metadata_json"),
    lastError: text("last_error"),
    startedAt: text("started_at"),
    completedAt: text("completed_at"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const serverSyncState = sqliteTable("server_sync_state", {
    id: integer("id").primaryKey({ autoIncrement: true }).notNull(),
    generation: text("generation").notNull(),
    sequence: integer("sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    automationEventSequence: integer("automation_event_sequence").notNull().default(0),
    minRecoverableSequence: integer("min_recoverable_sequence").notNull().default(0),
    lastCompactedAt: text("last_compacted_at"),
    compactionVersion: integer("compaction_version").notNull().default(0),
});

export const slashCommands = sqliteTable("slash_commands", {
    id: text("id").primaryKey().notNull(),
    integrationId: text("integration_id").notNull(),
    command: text("command").notNull(),
    description: text("description"),
    usageHint: text("usage_hint"),
    handlerUrl: text("handler_url").notNull(),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const syncCompactions = sqliteTable("sync_compactions", {
    id: text("id").primaryKey().notNull(),
    generation: text("generation").notNull(),
    previousMinSequence: integer("previous_min_sequence").notNull(),
    newMinSequence: integer("new_min_sequence").notNull(),
    eventsDeleted: integer("events_deleted").notNull().default(0),
    mutationsDeleted: integer("mutations_deleted").notNull().default(0),
    startedAt: text("started_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    completedAt: text("completed_at"),
    detailsJson: text("details_json"),
});

export const syncConsumers = sqliteTable("sync_consumers", {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    deviceId: text("device_id").notNull(),
    generation: text("generation").notNull(),
    sequence: integer("sequence").notNull().default(0),
    lastSeenAt: text("last_seen_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    revokedAt: text("revoked_at"),
});

export const syncEvents = sqliteTable("sync_events", {
    id: integer("id").primaryKey({ autoIncrement: true }),
    sequence: integer("sequence").notNull(),
    kind: text("kind").notNull(),
    chatId: text("chat_id"),
    chatPts: integer("chat_pts"),
    entityId: text("entity_id"),
    actorUserId: text("actor_user_id"),
    targetUserId: text("target_user_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const userBookmarks = sqliteTable("user_bookmarks", {
    id: text("id").primaryKey().notNull(),
    userId: text("user_id").notNull(),
    chatId: text("chat_id"),
    messageId: text("message_id"),
    fileId: text("file_id"),
    url: text("url"),
    title: text("title"),
    note: text("note"),
    sortOrder: integer("sort_order").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const userChatPreferences = sqliteTable("user_chat_preferences", {
    userId: text("user_id").notNull(),
    chatId: text("chat_id").notNull(),
    starred: integer("starred").notNull().default(0),
    sortOrder: integer("sort_order").notNull().default(0),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    notificationLevel: text("notification_level").notNull().default("all"),
    mutedUntil: text("muted_until"),
    showMessagePreviews: integer("show_message_previews").notNull().default(1),
});

export const userNotificationPreferences = sqliteTable("user_notification_preferences", {
    userId: text("user_id").primaryKey().notNull(),
    directMessages: text("direct_messages").notNull().default("all"),
    mentions: text("mentions").notNull().default("all"),
    reactions: text("reactions").notNull().default("all"),
    calls: text("calls").notNull().default("all"),
    emailNotifications: integer("email_notifications").notNull().default(0),
    desktopNotifications: integer("desktop_notifications").notNull().default(1),
    dndStartMinutes: integer("dnd_start_minutes"),
    dndEndMinutes: integer("dnd_end_minutes"),
    timezone: text("timezone"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const userOnboardingSteps = sqliteTable(
    "user_onboarding_steps",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        step: text("step").notNull(),
        state: text("state").notNull().default("pending"),
        metadataJson: text("metadata_json"),
        completedAt: text("completed_at"),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
        updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.userId, table.step] })],
);

export const userPresenceSettings = sqliteTable("user_presence_settings", {
    userId: text("user_id").primaryKey().notNull(),
    availability: text("availability").notNull().default("automatic"),
    customStatusText: text("custom_status_text"),
    customStatusEmoji: text("custom_status_emoji"),
    statusExpiresAt: text("status_expires_at"),
    dndUntil: text("dnd_until"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const userPermissions = sqliteTable(
    "user_permissions",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        permission: text("permission").notNull(),
        grantedByUserId: text("granted_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [primaryKey({ columns: [table.userId, table.permission] })],
);

export const userRoles = sqliteTable(
    "user_roles",
    {
        userId: text("user_id")
            .notNull()
            .references(() => users.id, { onDelete: "cascade" }),
        roleId: text("role_id")
            .notNull()
            .references(() => roles.id, { onDelete: "cascade" }),
        assignedByUserId: text("assigned_by_user_id").references(() => users.id, {
            onDelete: "set null",
        }),
        createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.roleId] }),
        index("user_roles_role_id_index").on(table.roleId),
    ],
);

export const userStorageQuotas = sqliteTable("user_storage_quotas", {
    userId: text("user_id").primaryKey().notNull(),
    quotaBytes: integer("quota_bytes"),
    usedBytes: integer("used_bytes").notNull().default(0),
    reservedBytes: integer("reserved_bytes").notNull().default(0),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const users = sqliteTable("users", {
    id: text("id").primaryKey().notNull(),
    accountId: text("account_id"),
    kind: text("kind").notNull().default("human"),
    agentImageId: text("agent_image_id"),
    agentEffort: text("agent_effort"),
    createdByUserId: text("created_by_user_id"),
    firstName: text("first_name").notNull(),
    lastName: text("last_name"),
    username: text("username").notNull(),
    email: text("email"),
    phone: text("phone"),
    photoFileId: text("photo_file_id"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    title: text("title"),
    role: text("role").notNull().default("member"),
    deletedAt: text("deleted_at"),
    lastAccessAt: text("last_access_at"),
    lastSeenAt: text("last_seen_at"),
    syncSequence: integer("sync_sequence").notNull().default(0),
    agentRole: text("agent_role"),
});

export const webhookDeliveries = sqliteTable("webhook_deliveries", {
    id: text("id").primaryKey().notNull(),
    subscriptionId: text("subscription_id").notNull(),
    eventId: text("event_id").notNull(),
    eventType: text("event_type").notNull(),
    payloadJson: text("payload_json").notNull(),
    status: text("status").notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: text("next_attempt_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    responseStatus: integer("response_status"),
    responseBody: text("response_body"),
    lastError: text("last_error"),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    deliveredAt: text("delivered_at"),
});

export const webhookSubscriptions = sqliteTable("webhook_subscriptions", {
    id: text("id").primaryKey().notNull(),
    integrationId: text("integration_id").notNull(),
    direction: text("direction").notNull(),
    chatId: text("chat_id"),
    url: text("url"),
    tokenHash: text("token_hash"),
    signingSecretCiphertext: text("signing_secret_ciphertext"),
    eventTypesJson: text("event_types_json").notNull().default("[]"),
    active: integer("active").notNull().default(1),
    createdAt: text("created_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
    updatedAt: text("updated_at").notNull().default(sql.raw("CURRENT_TIMESTAMP")),
});

export const schema = {
    accountBans,
    accounts,
    appPresentationPreferences,
    agentImages,
    agentImageSettings,
    agentTurns,
    agentRigBindings,
    agentSecretAgentAssignments,
    agentSecretChannelAssignments,
    apiCredentials,
    auditLogEntries,
    authDevTokens,
    authMagicLinks,
    authOidcStates,
    authSessionEvents,
    authSessions,
    automationRuns,
    automations,
    backupRecords,
    botIdentities,
    callCredentialLeases,
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
    dataExportJobs,
    documentUpdates,
    documents,
    drafts,
    fileAccessGrants,
    fileDerivatives,
    fileProcessingJobs,
    fileScanEvents,
    fileUploadParts,
    fileUploadSessions,
    files,
    idempotencyKeys,
    integrations,
    messageAttachments,
    messageForwardMetadata,
    messageMentions,
    messageReceipts,
    messageRevisions,
    messageSearchDocuments,
    messageSearchNgrams,
    messages,
    moderationActions,
    moderationReports,
    notifications,
    oidcIdentities,
    pluginInstallations,
    pluginInstallationVariables,
    pluginAppInstances,
    pluginContributions,
    pluginFunctionResults,
    pluginMcpAppCalls,
    pluginMcpAppResources,
    pluginMcpTools,
    pluginSkills,
    pluginManagementRequests,
    pluginUiAssets,
    plugins,
    portShares,
    rateLimitBuckets,
    reactions,
    retentionRuns,
    rigEventSyncState,
    rolePermissions,
    roles,
    scheduledMessageAttachments,
    scheduledMessages,
    searchIndexState,
    serverSettings,
    serverSetupState,
    serverSetupSteps,
    serverSyncState,
    slashCommands,
    syncCompactions,
    syncConsumers,
    syncEvents,
    userBookmarks,
    userChatPreferences,
    userNotificationPreferences,
    userOnboardingSteps,
    userPermissions,
    userPresenceSettings,
    userRoles,
    userStorageQuotas,
    users,
    webhookDeliveries,
    webhookSubscriptions,
} as const;

export type Schema = typeof schema;
