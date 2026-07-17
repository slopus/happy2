export type OperationsErrorCode = "invalid" | "forbidden" | "not_found" | "conflict";

export class OperationsError extends Error {
    constructor(
        readonly code: OperationsErrorCode,
        message: string,
    ) {
        super(message);
        this.name = "OperationsError";
    }
}

export interface Page<T> {
    items: T[];
    nextCursor?: string;
}

export interface OperationsSyncHint {
    sequence: string;
    chats: Array<{ chatId: string; pts: string }>;
    areas: string[];
}

export interface ClaimedDataExport extends DataExportJob {
    claimStartedAt: string;
}

export interface AuditLogEntry {
    id: string;
    actorUserId?: string;
    actorIntegrationId?: string;
    action: string;
    targetType: string;
    targetId?: string;
    chatId?: string;
    before?: unknown;
    after?: unknown;
    metadata?: unknown;
    clientIp?: string;
    device?: string;
    appVersion?: string;
    userAgent?: string;
    createdAt: string;
}

export type BanStatus = "active" | "expired" | "revoked";

export interface AccountBan {
    id: string;
    accountId: string;
    userId?: string;
    username?: string;
    bannedByUserId?: string;
    reason?: string;
    bannedAt: string;
    expiresAt?: string;
    revokedAt?: string;
    revokedByUserId?: string;
    revokeReason?: string;
    status: BanStatus;
}

export type ModerationReportStatus = "open" | "reviewing" | "resolved" | "dismissed";
export type ModerationActionKind =
    | "warn"
    | "restrict"
    | "remove_message"
    | "remove_file"
    | "ban"
    | "unban"
    | "delete_user";

export interface ModerationReport {
    id: string;
    reportedByUserId?: string;
    targetUserId?: string;
    chatId?: string;
    messageId?: string;
    fileId?: string;
    reason: string;
    details?: string;
    status: ModerationReportStatus;
    assignedToUserId?: string;
    resolution?: string;
    createdAt: string;
    updatedAt: string;
    resolvedAt?: string;
}

export interface ModerationAction {
    id: string;
    reportId?: string;
    actorUserId?: string;
    targetUserId?: string;
    chatId?: string;
    messageId?: string;
    fileId?: string;
    action: ModerationActionKind;
    reason?: string;
    metadata?: unknown;
    expiresAt?: string;
    revokedAt?: string;
    createdAt: string;
}

export type DataExportKind = "user_data" | "server_data" | "audit_log" | "chat_history";
export type DataExportStatus =
    | "pending"
    | "running"
    | "complete"
    | "failed"
    | "cancelled"
    | "expired";

/** Deliberately exposes an opaque file id, never a storage path or provider credential. */
export interface DataExportJob {
    id: string;
    requestedByUserId?: string;
    kind: DataExportKind;
    targetId?: string;
    status: DataExportStatus;
    outputFileId?: string;
    options?: unknown;
    lastError?: string;
    expiresAt?: string;
    createdAt: string;
    startedAt?: string;
    completedAt?: string;
}

export type BackupStatus = "pending" | "running" | "complete" | "failed" | "deleted";

export interface BackupRecord {
    id: string;
    storageProvider: string;
    storageKey: string;
    checksumSha256?: string;
    size?: number;
    status: BackupStatus;
    createdByUserId?: string;
    metadata?: unknown;
    lastError?: string;
    createdAt: string;
    completedAt?: string;
    retentionUntil?: string;
}

export type RetentionScope = "messages" | "files" | "sync" | "idempotency" | "audit" | "backups";
export type RetentionRunStatus = "running" | "complete" | "failed";

export interface RetentionRun {
    id: string;
    scope: RetentionScope;
    status: RetentionRunStatus;
    itemsExamined: number;
    itemsDeleted: number;
    details?: unknown;
    lastError?: string;
    startedAt: string;
    completedAt?: string;
}

export interface UserAccessTelemetry {
    userId: string;
    username: string;
    email: string;
    role: "member" | "admin";
    lastAccessAt?: string;
    lastSessionAccessAt?: string;
    activeSessionCount: number;
    bannedAt?: string;
    banExpiresAt?: string;
    deletedAt?: string;
    lastClientIp?: string;
    lastDevice?: string;
    lastAppVersion?: string;
    lastUserAgent?: string;
}
