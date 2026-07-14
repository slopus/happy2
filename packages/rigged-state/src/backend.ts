import { ApiResponseError } from "./api.js";
import type { ClientTransport, HttpRequest } from "./transport.js";
import type {
    CallSummary,
    ChatBookmarkSummary,
    ChatPinSummary,
    ChatSummary,
    FileSummary,
    MessageSummary,
    NotificationSummary,
    PresenceSettingsSummary,
    PresenceSnapshot,
    ThreadSummary,
    UserSummary,
} from "./types.js";
import type {
    AccountBan,
    AdminUserSummary,
    ApiCredentialSummary,
    AuditLogEntry,
    AutomationSummary,
    BackupRecord,
    BotSummary,
    ClientUser,
    DataExportJob,
    IntegrationSummary,
    MessageRevision,
    ModerationAction,
    ModerationReport,
    NotificationPreferences,
    ResumableUploadSummary,
    RetentionRun,
    SearchResultSummary,
    ScheduledMessageSummary,
    SlashCommandSummary,
    UploadedFile,
    UserAccessTelemetry,
    WebhookDeliverySummary,
    WebhookSubscriptionSummary,
} from "./resources.js";

export type JsonObject = Readonly<Record<string, unknown>>;
export type BackendInput = JsonObject | undefined;

interface OperationSpec {
    readonly method: "GET" | "POST";
    readonly path: string;
    readonly query?: readonly string[];
    readonly rawBodyKey?: string;
    readonly idempotency?: false;
}

const get = <P extends string, Q extends readonly string[] | undefined = undefined>(
    path: P,
    query?: Q,
): OperationSpec & { readonly path: P; readonly query?: Q } => ({
    method: "GET",
    path,
    query,
});
const post = <P extends string>(
    path: P,
    rawBodyKey?: string,
): OperationSpec & { readonly path: P } => ({
    method: "POST",
    path,
    rawBodyKey,
});
const secretPost = <P extends string>(
    path: P,
): OperationSpec & { readonly path: P; readonly idempotency: false } => ({
    method: "POST",
    path,
    idempotency: false,
});

/** Every non-authentication HTTP capability exposed by the backend. */
export const backendOperations = {
    getServiceStatus: get("/"),
    getHealth: get("/v0/health"),
    getMe: get("/v0/me"),
    updateProfile: post("/v0/me/updateProfile"),
    uploadAvatarFile: post("/v0/me/uploadAvatarFile", "body"),
    updateAvatar: post("/v0/me/updateAvatar"),

    getChats: get("/v0/chats"),
    getChat: get("/v0/chats/:chatId"),
    getChatMembers: get("/v0/chats/:chatId/members"),
    getMessages: get("/v0/chats/:chatId/messages", ["beforeSequence", "afterSequence", "limit"]),
    getMessage: get("/v0/messages/:messageId"),
    getThread: get("/v0/messages/:messageId/thread", ["beforeSequence", "afterSequence", "limit"]),
    getThreads: get("/v0/threads", ["before", "unreadOnly", "limit"]),
    getNotifications: get("/v0/notifications", ["before", "unreadOnly", "limit"]),
    markNotificationsRead: post("/v0/notifications/markRead"),
    createDirectMessage: post("/v0/chats/createDirectMessage"),
    createGroupDirectMessage: post("/v0/chats/createGroupDirectMessage"),
    createAgent: post("/v0/chats/createAgent"),
    createChannel: post("/v0/chats/createChannel"),
    updateChatTopic: post("/v0/chats/:chatId/updateTopic"),
    updateChannel: post("/v0/chats/:chatId/updateChannel"),
    updateChannelPolicies: post("/v0/chats/:chatId/updatePolicies"),
    archiveChannel: post("/v0/chats/:chatId/archiveChannel"),
    unarchiveChannel: post("/v0/chats/:chatId/unarchiveChannel"),
    deleteChannel: post("/v0/chats/:chatId/deleteChannel"),
    joinChat: post("/v0/chats/:chatId/join"),
    leaveChat: post("/v0/chats/:chatId/leave"),
    addChatMember: post("/v0/chats/:chatId/addMember"),
    removeChatMember: post("/v0/chats/:chatId/removeMember"),
    setChatMemberRole: post("/v0/chats/:chatId/setMemberRole"),
    setChatStar: post("/v0/chats/:chatId/setStar"),
    markChatRead: post("/v0/chats/:chatId/markRead"),
    updateChatNotificationPreferences: post("/v0/chats/:chatId/updateNotificationPreferences"),
    reorderStarredChats: post("/v0/chats/reorderStarred"),
    sendMessage: post("/v0/chats/:chatId/sendMessage"),
    sendThreadMessage: post("/v0/messages/:messageId/sendThreadMessage"),
    updateThreadSubscription: post("/v0/messages/:messageId/updateThreadSubscription"),
    markThreadRead: post("/v0/messages/:messageId/markThreadRead"),
    deleteMessage: post("/v0/messages/:messageId/deleteMessage"),
    editMessage: post("/v0/messages/:messageId/editMessage"),
    getMessageRevisions: get("/v0/messages/:messageId/revisions"),
    forwardMessage: post("/v0/messages/:messageId/forwardMessage"),
    addReaction: post("/v0/messages/:messageId/addReaction"),
    removeReaction: post("/v0/messages/:messageId/removeReaction"),
    pinMessage: post("/v0/messages/:messageId/pinMessage"),
    unpinMessage: post("/v0/messages/:messageId/unpinMessage"),
    getChatPins: get("/v0/chats/:chatId/pins"),
    getChatBookmarks: get("/v0/chats/:chatId/bookmarks"),
    createChatBookmark: post("/v0/chats/:chatId/createBookmark"),
    deleteChatBookmark: post("/v0/chats/:chatId/deleteBookmark"),

    getContacts: get("/v0/contacts"),
    getDirectoryUsers: get("/v0/directory/users"),
    getDirectory: get("/v0/directory"),
    getPresence: get("/v0/presence"),
    updateStatus: post("/v0/me/updateStatus"),
    getNotificationPreferences: get("/v0/me/notificationPreferences"),
    updateNotificationPreferences: post("/v0/me/updateNotificationPreferences"),
    getDirectoryChannels: get("/v0/directory/channels"),
    search: get("/v0/search", ["q", "cursor", "limit"]),
    getFiles: get("/v0/files", ["kind", "before", "limit"]),

    getCalls: get("/v0/calls", ["chatId", "limit"]),
    getCall: get("/v0/calls/:callId"),
    createCall: post("/v0/chats/:chatId/createCall"),
    joinCall: post("/v0/calls/:callId/joinCall"),
    declineCall: post("/v0/calls/:callId/declineCall"),
    leaveCall: post("/v0/calls/:callId/leaveCall"),
    endCall: post("/v0/calls/:callId/endCall"),
    sendCallSignal: post("/v0/calls/:callId/sendSignal"),

    getCustomEmoji: get("/v0/customEmoji"),
    createCustomEmoji: post("/v0/customEmoji/createCustomEmoji"),
    deleteCustomEmoji: post("/v0/customEmoji/:emojiId/deleteCustomEmoji"),
    getServer: get("/v0/server"),
    getAdminUsers: get("/v0/admin/users"),
    updateAdminUser: post("/v0/admin/users/:userId/updateUser"),
    banUser: post("/v0/admin/users/:userId/banUser"),
    unbanUser: post("/v0/admin/users/:userId/unbanUser"),
    deleteUser: post("/v0/admin/users/:userId/deleteUser"),
    updateServer: post("/v0/admin/updateServer"),
    sendAutomatedMessage: post("/v0/admin/sendAutomatedMessage"),

    getSyncState: get("/v0/sync/state"),
    getDifference: post("/v0/sync/getDifference"),
    acknowledgeSync: post("/v0/sync/acknowledge"),
    getChatDifference: post("/v0/chats/:chatId/getDifference"),
    setTyping: post("/v0/chats/:chatId/setTyping"),
    updatePresence: post("/v0/me/updatePresence"),

    uploadFile: post("/v0/files/upload", "body"),
    createUpload: post("/v0/files/createUpload"),
    getUploadState: get("/v0/files/:uploadId/uploadState"),
    appendUpload: post("/v0/files/:uploadId/appendUpload", "body"),
    completeUpload: post("/v0/files/:uploadId/completeUpload"),
    cancelUpload: post("/v0/files/:uploadId/cancelUpload"),
    deleteFile: post("/v0/files/:fileId/deleteFile"),
    createFileSignedUrl: post("/v0/files/:fileId/createSignedUrl"),
    downloadFile: get("/v0/files/:fileId", ["token"]),
    downloadFileThumbnail: get("/v0/files/:fileId/thumbnail", ["token"]),
    downloadFilePreview: get("/v0/files/:fileId/preview", ["token"]),

    getScheduledMessages: get("/v0/scheduledMessages"),
    scheduleMessage: post("/v0/chats/:chatId/scheduleMessage"),
    cancelScheduledMessage: post("/v0/scheduledMessages/:messageId/cancelScheduledMessage"),
    getAutomations: get("/v0/admin/automations"),
    createAutomation: post("/v0/admin/automations/createAutomation"),
    updateAutomation: post("/v0/admin/automations/:automationId/updateAutomation"),
    deleteAutomation: post("/v0/admin/automations/:automationId/deleteAutomation"),
    runAutomation: post("/v0/admin/automations/:automationId/runAutomation"),
    invokeAutomationWebhook: post("/v0/automations/invokeWebhook"),

    getBots: get("/v0/admin/bots"),
    createBot: post("/v0/admin/bots/createBot"),
    updateBot: post("/v0/admin/bots/:botId/updateBot"),
    revokeBot: post("/v0/admin/bots/:botId/revokeBot"),
    getIntegrations: get("/v0/admin/integrations"),
    createIntegration: post("/v0/admin/integrations/createIntegration"),
    revokeIntegration: post("/v0/admin/integrations/:integrationId/revokeIntegration"),
    getIntegrationCredentials: get("/v0/admin/integrations/:integrationId/credentials"),
    createIntegrationCredential: secretPost(
        "/v0/admin/integrations/:integrationId/createCredential",
    ),
    revokeIntegrationCredential: post("/v0/admin/credentials/:credentialId/revokeCredential"),
    createIncomingWebhook: secretPost("/v0/admin/integrations/createIncomingWebhook"),
    createOutgoingWebhook: secretPost("/v0/admin/integrations/createOutgoingWebhook"),
    getWebhookSubscriptions: get("/v0/admin/integrations/:integrationId/webhookSubscriptions", [
        "direction",
        "active",
    ]),
    getWebhookDeliveries: get("/v0/admin/integrations/:integrationId/webhookDeliveries", [
        "status",
        "limit",
    ]),
    createSlashCommand: secretPost("/v0/admin/integrations/createSlashCommand"),
    getSlashCommands: get("/v0/slashCommands"),
    invokeSlashCommand: post("/v0/slashCommands/invoke"),
    invokeIncomingWebhook: post("/v0/integrations/incomingWebhook"),
    sendIntegrationMessage: post("/v0/integrations/sendMessage"),

    getAuditLogs: get("/v0/admin/auditLogs", [
        "action",
        "targetType",
        "targetId",
        "actorUserId",
        "before",
        "limit",
    ]),
    getBans: get("/v0/admin/bans", ["userId", "status", "before", "limit"]),
    applyBan: post("/v0/admin/users/:userId/applyBan"),
    revokeBan: post("/v0/admin/users/:userId/revokeBan"),
    expireBans: post("/v0/admin/expireBans"),
    createReport: post("/v0/reports/createReport"),
    getReports: get("/v0/admin/reports", ["status", "assignedToUserId", "before", "limit"]),
    updateReport: post("/v0/admin/reports/:reportId/updateReport"),
    takeReportAction: post("/v0/admin/reports/:reportId/takeAction"),
    revokeModerationAction: post("/v0/admin/moderationActions/:actionId/revokeAction"),
    requestMyDataExport: post("/v0/me/requestDataExport"),
    requestChatExport: post("/v0/dataExports/requestChatExport"),
    getDataExports: get("/v0/dataExports", ["status", "before", "limit"]),
    getDataExport: get("/v0/dataExports/:exportId"),
    cancelDataExport: post("/v0/dataExports/:exportId/cancelDataExport"),
    getAdminDataExports: get("/v0/admin/dataExports", [
        "status",
        "requestedByUserId",
        "before",
        "limit",
    ]),
    requestAdminDataExport: post("/v0/admin/requestDataExport"),
    updateDataExport: post("/v0/admin/dataExports/:exportId/updateDataExport"),
    getBackups: get("/v0/admin/backups", ["status", "before", "limit"]),
    createBackupRecord: post("/v0/admin/backups/createBackupRecord"),
    updateBackupRecord: post("/v0/admin/backups/:backupId/updateBackupRecord"),
    getRetentionRuns: get("/v0/admin/retentionRuns", ["scope", "before", "limit"]),
    startRetentionRun: post("/v0/admin/retentionRuns/startRetentionRun"),
    finishRetentionRun: post("/v0/admin/retentionRuns/:runId/finishRetentionRun"),
    getUserAccess: get("/v0/admin/userAccess", ["before", "limit"]),
} as const satisfies Record<string, OperationSpec>;

export type BackendOperation = keyof typeof backendOperations;

export function backendOperationSupportsIdempotency(operation: BackendOperation): boolean {
    const spec: OperationSpec = backendOperations[operation];
    return spec.method === "POST" && spec.rawBodyKey === undefined && spec.idempotency !== false;
}

type PathParameterNames<P extends string> = P extends `${string}:${infer Parameter}/${infer Rest}`
    ? Parameter | PathParameterNames<`/${Rest}`>
    : P extends `${string}:${infer Parameter}`
      ? Parameter
      : never;

type PathInputs<P extends string> = {
    readonly [K in PathParameterNames<P>]: string;
};

type QueryInputs<Q> = Q extends readonly string[]
    ? { readonly [K in Q[number]]?: string | number | boolean }
    : object;

type DerivedBackendInput<K extends BackendOperation> = (typeof backendOperations)[K] extends {
    readonly path: infer P extends string;
}
    ? PathInputs<P> &
          QueryInputs<
              (typeof backendOperations)[K] extends { readonly query?: infer Q } ? Q : never
          > &
          ((typeof backendOperations)[K]["method"] extends "POST" ? JsonObject : object)
    : never;

export interface KnownBackendInputs {
    updateProfile: {
        readonly firstName?: string;
        readonly lastName?: string | null;
        readonly username?: string;
        readonly email?: string | null;
        readonly phone?: string | null;
    };
    updateAvatar: { readonly fileId: string };
    markNotificationsRead: { readonly notificationIds?: readonly string[]; readonly all?: boolean };
    createDirectMessage: { readonly userId: string };
    createGroupDirectMessage: { readonly userIds: readonly string[]; readonly name?: string };
    createChannel: {
        readonly kind: "public_channel" | "private_channel";
        readonly name: string;
        readonly slug: string;
        readonly topic?: string | null;
    };
    createAgent: { readonly name: string; readonly username: string };
    updateChatTopic: { readonly chatId: string; readonly topic: string | null };
    updateChannel: {
        readonly chatId: string;
        readonly name?: string;
        readonly slug?: string;
        readonly topic?: string | null;
        readonly kind?: "public_channel" | "private_channel";
        readonly photoFileId?: string | null;
        readonly isListed?: boolean;
    };
    updateChannelPolicies: {
        readonly chatId: string;
        readonly retentionMode?: "inherit" | "forever" | "duration";
        readonly retentionSeconds?: number | null;
        readonly defaultExpiryMode?: "none" | "after_send" | "after_read";
        readonly defaultSelfDestructSeconds?: number | null;
        readonly defaultAfterReadScope?: "any_reader" | "all_readers";
    };
    archiveChannel: { readonly chatId: string; readonly reason?: string | null };
    unarchiveChannel: { readonly chatId: string; readonly reason?: string | null };
    deleteChannel: { readonly chatId: string; readonly reason?: string | null };
    joinChat: { readonly chatId: string };
    leaveChat: { readonly chatId: string };
    addChatMember: {
        readonly chatId: string;
        readonly userId: string;
        readonly role?: "owner" | "admin" | "member";
    };
    removeChatMember: { readonly chatId: string; readonly userId: string };
    setChatMemberRole: {
        readonly chatId: string;
        readonly userId: string;
        readonly role: "owner" | "admin" | "member";
    };
    setChatStar: { readonly chatId: string; readonly starred: boolean };
    markChatRead: { readonly chatId: string; readonly messageId?: string };
    updateChatNotificationPreferences: {
        readonly chatId: string;
        readonly notificationLevel?: "all" | "mentions" | "none";
        readonly mutedUntil?: string | null;
        readonly notifyThreadReplies?: boolean;
        readonly showMessagePreviews?: boolean;
    };
    reorderStarredChats: { readonly chatIds: readonly string[] };
    sendMessage: {
        readonly chatId: string;
        readonly text?: string;
        readonly attachmentFileIds?: readonly string[];
        readonly quotedMessageId?: string;
        readonly threadRootMessageId?: string;
        readonly expiryMode?: "none" | "after_send" | "after_read";
        readonly selfDestructSeconds?: number;
        readonly afterReadScope?: "any_reader" | "all_readers";
        readonly clientMutationId?: string;
    };
    sendThreadMessage: Omit<KnownBackendInputs["sendMessage"], "chatId" | "threadRootMessageId"> & {
        readonly messageId: string;
    };
    updateThreadSubscription: {
        readonly messageId: string;
        readonly subscribed: boolean;
        readonly notificationLevel?: "all" | "mentions" | "none";
    };
    markThreadRead: { readonly messageId: string; readonly throughMessageId?: string };
    deleteMessage: { readonly messageId: string };
    editMessage: {
        readonly messageId: string;
        readonly text: string;
        readonly reason?: string | null;
        readonly expectedRevision?: number;
    };
    forwardMessage: {
        readonly messageId: string;
        readonly targetChatIds: readonly string[];
        readonly clientMutationId?: string;
    };
    addReaction: ReactionInput;
    removeReaction: ReactionInput;
    pinMessage: { readonly messageId: string };
    unpinMessage: { readonly messageId: string };
    createChatBookmark: {
        readonly chatId: string;
        readonly kind: "link" | "message" | "file";
        readonly title: string;
        readonly url?: string;
        readonly messageId?: string;
        readonly fileId?: string;
        readonly emoji?: string | null;
    };
    deleteChatBookmark: { readonly chatId: string; readonly bookmarkId: string };
    updateStatus: {
        readonly availability?: "automatic" | "online" | "away" | "dnd";
        readonly customStatusText?: string | null;
        readonly customStatusEmoji?: string | null;
        readonly statusExpiresAt?: string | null;
        readonly dndUntil?: string | null;
    };
    updateNotificationPreferences: NotificationPreferencesInput;
    createCall: {
        readonly chatId: string;
        readonly kind: "audio" | "video";
        readonly invitedUserIds?: readonly string[];
    };
    joinCall: { readonly callId: string };
    declineCall: { readonly callId: string };
    leaveCall: { readonly callId: string };
    endCall: { readonly callId: string; readonly reason?: string | null };
    setTyping: { readonly chatId: string; readonly active: boolean; readonly ttlMs?: number };
    updatePresence: { readonly connectionId: string };
    sendCallSignal: {
        readonly callId: string;
        readonly chatId: string;
        readonly recipientUserId: string;
        readonly signal: JsonObject;
    };
    createCustomEmoji: { readonly name: string; readonly fileId: string };
    deleteCustomEmoji: { readonly emojiId: string };
    updateAdminUser: {
        readonly userId: string;
        readonly title?: string | null;
        readonly role?: "member" | "admin";
    };
    banUser: { readonly userId: string };
    unbanUser: { readonly userId: string };
    deleteUser: { readonly userId: string };
    updateServer: {
        readonly name?: string;
        readonly title?: string | null;
        readonly photoFileId?: string | null;
        readonly defaultRetentionMode?: "forever" | "duration";
        readonly defaultRetentionSeconds?: number | null;
    };
    sendAutomatedMessage: {
        readonly chatId: string;
        readonly text?: string;
        readonly attachmentFileIds?: readonly string[];
        readonly botId?: string;
        readonly clientMutationId?: string;
    };
    getDifference: {
        readonly state: JsonObject;
        readonly untilSequence?: string;
        readonly limit?: number;
    };
    acknowledgeSync: { readonly state: JsonObject; readonly deviceId: string };
    getChatDifference: {
        readonly chatId: string;
        readonly state: JsonObject;
        readonly untilPts?: string;
        readonly limit?: number;
    };
    uploadAvatarFile: { readonly body: unknown };
    uploadFile: { readonly body: unknown };
    appendUpload: {
        readonly uploadId: string;
        readonly body: unknown;
        readonly headers: { readonly "upload-offset": string };
    };
    createUpload: {
        readonly filename?: string;
        readonly contentType?: string;
        readonly size: number;
    };
    completeUpload: { readonly uploadId: string };
    cancelUpload: { readonly uploadId: string };
    deleteFile: { readonly fileId: string; readonly force?: boolean };
    createFileSignedUrl: { readonly fileId: string };
    downloadFile: {
        readonly fileId: string;
        readonly token?: string;
        readonly headers?: { readonly range?: string };
    };
    downloadFileThumbnail: { readonly fileId: string; readonly token?: string };
    downloadFilePreview: { readonly fileId: string; readonly token?: string };
    scheduleMessage: ScheduledMessageInput & { readonly chatId: string };
    cancelScheduledMessage: { readonly messageId: string };
    createAutomation: AutomationInput;
    updateAutomation: {
        readonly automationId: string;
        readonly active?: boolean;
        readonly name?: string;
        readonly triggerConfig?: JsonObject;
        readonly actionConfig?: JsonObject;
        readonly nextRunAt?: string | null;
    };
    deleteAutomation: { readonly automationId: string };
    runAutomation: { readonly automationId: string; readonly triggerEventId?: string };
    invokeAutomationWebhook: { readonly headers: Readonly<Record<string, string>> };
    createBot: BotInput;
    updateBot: Partial<BotInput> & { readonly botId: string };
    revokeBot: { readonly botId: string };
    createIntegration: IntegrationInput;
    revokeIntegration: { readonly integrationId: string };
    createIntegrationCredential: {
        readonly integrationId: string;
        readonly name: string;
        readonly scopes?: readonly string[];
        readonly expiresAt?: string;
    };
    revokeIntegrationCredential: { readonly credentialId: string };
    createIncomingWebhook: {
        readonly name: string;
        readonly description?: string;
        readonly botId: string;
        readonly chatId: string;
    };
    createOutgoingWebhook: {
        readonly name: string;
        readonly description?: string;
        readonly url: string;
        readonly eventTypes: readonly string[];
        readonly chatId?: string;
    };
    createSlashCommand: {
        readonly integrationId: string;
        readonly command: string;
        readonly description?: string;
        readonly usageHint?: string;
    };
    invokeSlashCommand: {
        readonly command: string;
        readonly chatId: string;
        readonly text?: string;
    };
    invokeIncomingWebhook: {
        readonly text: string;
        readonly headers: Readonly<Record<string, string>>;
    };
    sendIntegrationMessage: {
        readonly chatId: string;
        readonly text?: string;
        readonly attachmentFileIds?: readonly string[];
        readonly headers?: Readonly<Record<string, string>>;
    };
    applyBan: { readonly userId: string; readonly reason?: string; readonly expiresAt?: string };
    revokeBan: { readonly userId: string; readonly reason?: string };
    expireBans: JsonObject;
    createReport: {
        readonly targetUserId?: string;
        readonly chatId?: string;
        readonly messageId?: string;
        readonly fileId?: string;
        readonly reason: string;
        readonly details?: string;
    };
    updateReport: {
        readonly reportId: string;
        readonly status?: "open" | "reviewing" | "resolved" | "dismissed";
        readonly assignedToUserId?: string | null;
        readonly resolution?: string | null;
    };
    takeReportAction: ModerationActionInput & { readonly reportId: string };
    revokeModerationAction: { readonly actionId: string; readonly reason?: string };
    requestMyDataExport: ExportRequestInput;
    requestChatExport: ExportRequestInput & { readonly chatId: string };
    cancelDataExport: { readonly exportId: string };
    requestAdminDataExport: ExportRequestInput & {
        readonly kind: "user_data" | "server_data" | "audit_log" | "chat_history";
        readonly targetId?: string;
    };
    updateDataExport: {
        readonly exportId: string;
        readonly status: "running" | "complete" | "failed" | "cancelled" | "expired";
        readonly outputFileId?: string;
        readonly lastError?: string;
        readonly expiresAt?: string;
    };
    createBackupRecord: {
        readonly storageProvider: string;
        readonly storageKey: string;
        readonly retentionUntil?: string;
        readonly metadata?: JsonObject;
    };
    updateBackupRecord: {
        readonly backupId: string;
        readonly status: "running" | "complete" | "failed" | "deleted";
        readonly checksumSha256?: string;
        readonly size?: number;
        readonly lastError?: string;
        readonly retentionUntil?: string;
        readonly metadata?: JsonObject;
    };
    startRetentionRun: { readonly scope: RetentionScope; readonly details?: JsonObject };
    finishRetentionRun: {
        readonly runId: string;
        readonly status: "complete" | "failed";
        readonly itemsExamined: number;
        readonly itemsDeleted: number;
        readonly details?: JsonObject;
        readonly lastError?: string;
    };
}

interface ReactionInput {
    readonly messageId: string;
    readonly emoji?: string;
    readonly customEmojiId?: string;
}

interface NotificationPreferencesInput {
    readonly directMessages?: "all" | "none";
    readonly mentions?: "all" | "none";
    readonly threadReplies?: "all" | "mentions" | "none";
    readonly reactions?: "all" | "none";
    readonly calls?: "all" | "none";
    readonly emailNotifications?: boolean;
    readonly desktopNotifications?: boolean;
    readonly dndStartMinutes?: number | null;
    readonly dndEndMinutes?: number | null;
    readonly timezone?: string | null;
}

interface ScheduledMessageInput {
    readonly text?: string;
    readonly attachmentFileIds?: readonly string[];
    readonly scheduledFor: string;
    readonly timezone?: string;
    readonly quotedMessageId?: string;
    readonly threadRootMessageId?: string;
    readonly clientMutationId?: string;
}

interface AutomationInput {
    readonly name: string;
    readonly chatId?: string;
    readonly botId?: string;
    readonly triggerType: "schedule" | "event" | "webhook";
    readonly triggerConfig: JsonObject;
    readonly actionType: "send_message" | "call_webhook" | "moderate";
    readonly actionConfig: JsonObject;
    readonly timezone?: string;
    readonly nextRunAt?: string;
}

interface BotInput {
    readonly name: string;
    readonly username: string;
    readonly description?: string | null;
    readonly photoFileId?: string | null;
    readonly ownerUserId?: string | null;
}

interface IntegrationInput {
    readonly kind: "app" | "service_account";
    readonly name: string;
    readonly description?: string;
    readonly botId?: string;
    readonly scopes: readonly string[];
}

interface ModerationActionInput {
    readonly action:
        | "warn"
        | "restrict"
        | "remove_message"
        | "remove_file"
        | "ban"
        | "unban"
        | "delete_user";
    readonly reason?: string;
    readonly expiresAt?: string;
    readonly metadata?: JsonObject;
}

interface ExportRequestInput {
    readonly options?: JsonObject;
    readonly expiresAt?: string;
}

type RetentionScope = "messages" | "files" | "sync" | "idempotency" | "audit" | "backups";

export type BackendOperationInput<K extends BackendOperation> = K extends keyof KnownBackendInputs
    ? KnownBackendInputs[K]
    : DerivedBackendInput<K>;

export interface KnownBackendResults {
    getServiceStatus: { readonly service: "rigged"; readonly status: "ok" };
    getHealth: { readonly status: "ok" };
    getMe: { readonly user: ClientUser };
    updateProfile: { readonly user: ClientUser };
    uploadAvatarFile: { readonly file: UploadedFile };
    updateAvatar: { readonly user: ClientUser };
    getChats: { readonly chats: readonly ChatSummary[] };
    getChat: { readonly chat: ChatSummary };
    getChatMembers: {
        readonly users: readonly UserSummary[];
        readonly memberships: readonly JsonObject[];
    };
    getMessages: MessagePage;
    getMessage: { readonly message: MessageSummary };
    getThread: MessagePage & { readonly root: MessageSummary };
    getThreads: { readonly threads: readonly ThreadSummary[]; readonly nextCursor?: string };
    getNotifications: {
        readonly notifications: readonly NotificationSummary[];
        readonly nextCursor?: string;
    };
    getChatPins: { readonly pins: readonly ChatPinSummary[] };
    getChatBookmarks: { readonly bookmarks: readonly ChatBookmarkSummary[] };
    getContacts: DirectoryUsersResult;
    getDirectoryUsers: DirectoryUsersResult;
    getDirectoryChannels: { readonly channels: readonly ChatSummary[] };
    search: { readonly results: readonly SearchResultSummary[]; readonly nextCursor?: string };
    getPresence: Pick<DirectoryUsersResult, "presence" | "statuses">;
    updateStatus: { readonly status: PresenceSettingsSummary; readonly sync: unknown };
    getNotificationPreferences: { readonly preferences: NotificationPreferences };
    updateNotificationPreferences: {
        readonly preferences: NotificationPreferences;
        readonly sync: unknown;
    };
    getFiles: { readonly files: readonly FileSummary[]; readonly nextCursor?: string };
    getAdminUsers: { readonly users: readonly AdminUserSummary[] };
    updateAdminUser: { readonly user: AdminUserSummary; readonly sync?: unknown };
    getCalls: { readonly calls: readonly CallSummary[] };
    getCall: { readonly call: CallSummary };
    getMessageRevisions: { readonly revisions: readonly MessageRevision[] };
    getScheduledMessages: { readonly messages: readonly ScheduledMessageSummary[] };
    getAutomations: { readonly automations: readonly AutomationSummary[] };
    getBots: { readonly bots: readonly BotSummary[] };
    getIntegrations: { readonly integrations: readonly IntegrationSummary[] };
    getIntegrationCredentials: { readonly credentials: readonly ApiCredentialSummary[] };
    getWebhookSubscriptions: { readonly subscriptions: readonly WebhookSubscriptionSummary[] };
    getWebhookDeliveries: { readonly deliveries: readonly WebhookDeliverySummary[] };
    getSlashCommands: { readonly commands: readonly SlashCommandSummary[] };
    getAuditLogs: PageResult<"auditLogs", AuditLogEntry>;
    getBans: PageResult<"bans", AccountBan>;
    getReports: PageResult<"reports", ModerationReport>;
    getDataExports: PageResult<"dataExports", DataExportJob>;
    getAdminDataExports: PageResult<"dataExports", DataExportJob>;
    getBackups: PageResult<"backups", BackupRecord>;
    getRetentionRuns: PageResult<"retentionRuns", RetentionRun>;
    getUserAccess: PageResult<"users", UserAccessTelemetry>;
    createDirectMessage: ChatResult;
    createGroupDirectMessage: ChatResult;
    createChannel: ChatResult;
    createAgent: ChatResult;
    updateChatTopic: ChatResult;
    updateChannel: ChatResult;
    updateChannelPolicies: ChatResult;
    archiveChannel: ChatResult;
    unarchiveChannel: ChatResult;
    joinChat: ChatResult;
    markChatRead: ChatResult;
    updateChatNotificationPreferences: ChatResult;
    sendMessage: MessageResult;
    sendThreadMessage: MessageResult;
    deleteMessage: MessageResult;
    editMessage: MessageResult;
    addReaction: MessageResult;
    removeReaction: MessageResult;
    sendAutomatedMessage: MessageResult;
    createCall: CallResult;
    joinCall: CallResult;
    declineCall: CallResult;
    leaveCall: CallResult;
    endCall: CallResult;
    uploadFile: { readonly file: UploadedFile };
    createUpload: { readonly upload: ResumableUploadSummary };
    getUploadState: { readonly upload: ResumableUploadSummary };
    completeUpload: { readonly file: UploadedFile };
    createFileSignedUrl: {
        readonly signedUrl: { readonly url: string; readonly expiresAt: string };
    };
    createBot: { readonly bot: BotSummary; readonly sync: unknown };
    updateBot: { readonly bot: BotSummary; readonly sync: unknown };
    createIntegration: { readonly integration: IntegrationSummary; readonly sync: unknown };
    createIntegrationCredential: {
        readonly credential: ApiCredentialSummary;
        readonly token: string;
    };
    createReport: { readonly report: ModerationReport };
    updateReport: { readonly report: ModerationReport };
    takeReportAction: { readonly action: ModerationAction; readonly sync?: unknown };
    revokeModerationAction: { readonly action: ModerationAction; readonly sync?: unknown };
    requestMyDataExport: { readonly dataExport: DataExportJob };
    requestChatExport: { readonly dataExport: DataExportJob };
    getDataExport: { readonly dataExport: DataExportJob };
    cancelDataExport: { readonly dataExport: DataExportJob };
    requestAdminDataExport: { readonly dataExport: DataExportJob };
    updateDataExport: { readonly dataExport: DataExportJob };
    applyBan: { readonly ban: AccountBan };
    revokeBan: { readonly ban: AccountBan };
    createBackupRecord: { readonly backup: BackupRecord };
    updateBackupRecord: { readonly backup: BackupRecord };
    startRetentionRun: { readonly retentionRun: RetentionRun };
    finishRetentionRun: { readonly retentionRun: RetentionRun };
    downloadFile: ArrayBuffer;
    downloadFileThumbnail: ArrayBuffer;
    downloadFilePreview: ArrayBuffer;
}

type PageResult<K extends string, T> = { readonly [P in K]: readonly T[] } & {
    readonly nextCursor?: string;
};

interface ChatResult {
    readonly chat: ChatSummary;
    readonly sync?: unknown;
}

interface MessageResult {
    readonly message: MessageSummary;
    readonly sync?: unknown;
}

interface CallResult {
    readonly call: CallSummary;
    readonly sync?: unknown;
}

interface MessagePage {
    readonly messages: readonly MessageSummary[];
    readonly chatPts: string;
    readonly hasMore: boolean;
}

interface DirectoryUsersResult {
    readonly users: readonly UserSummary[];
    readonly presence: readonly PresenceSnapshot[];
    readonly statuses: readonly PresenceSettingsSummary[];
}

export type BackendOperationResult<K extends BackendOperation> = K extends keyof KnownBackendResults
    ? KnownBackendResults[K]
    : JsonObject;

export async function executeBackendOperation<K extends BackendOperation>(
    transport: ClientTransport,
    operation: K,
    input: BackendOperationInput<K> | undefined,
    idempotencyKey?: string,
): Promise<BackendOperationResult<K>> {
    const spec: OperationSpec = backendOperations[operation];
    const request = operationRequest(spec, input as BackendInput, idempotencyKey);
    const response = await transport.request<BackendOperationResult<K>>(request);
    if (response.status < 200 || response.status >= 300) {
        const body = asObject(response.body);
        throw new ApiResponseError(
            response,
            typeof body.message === "string"
                ? body.message
                : typeof body.error === "string"
                  ? body.error
                  : "The server request failed.",
        );
    }
    return response.body;
}

function operationRequest(
    spec: OperationSpec,
    input: BackendInput,
    idempotencyKey?: string,
): HttpRequest {
    const values = { ...input };
    const inputHeaders = asStringRecord(values.headers);
    delete values.headers;
    let path = spec.path.replaceAll(/:([A-Za-z][A-Za-z0-9]*)/g, (_match, name: string) => {
        const value = values[name];
        if (typeof value !== "string" || value === "")
            throw new TypeError(`${name} is required for ${spec.path}`);
        delete values[name];
        return encodeURIComponent(value);
    });
    if (spec.query) {
        const query = new URLSearchParams();
        for (const name of spec.query) {
            const value = values[name];
            delete values[name];
            if (value !== undefined && value !== null) query.set(name, String(value));
        }
        const encoded = query.toString();
        if (encoded) path += `?${encoded}`;
    }
    const rawBody = spec.rawBodyKey ? values[spec.rawBodyKey] : undefined;
    if (spec.rawBodyKey) delete values[spec.rawBodyKey];
    const body = spec.method === "POST" ? (spec.rawBodyKey ? rawBody : values) : undefined;
    return {
        method: spec.method,
        path,
        body,
        headers:
            idempotencyKey || inputHeaders
                ? {
                      ...inputHeaders,
                      ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}),
                  }
                : undefined,
    };
}

function asObject(value: unknown): Record<string, unknown> {
    return value !== null && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function asStringRecord(value: unknown): Record<string, string> | undefined {
    if (value === undefined) return undefined;
    const object = asObject(value);
    const entries = Object.entries(object);
    if (entries.some((entry) => typeof entry[1] !== "string"))
        throw new TypeError("Operation headers must contain only string values");
    return Object.fromEntries(entries) as Record<string, string>;
}
