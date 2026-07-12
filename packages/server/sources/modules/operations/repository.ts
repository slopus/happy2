import { createClient, type Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gt, isNull, lt, lte, or, sql, type SQL } from "drizzle-orm";
import type { AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import type { RequestMetadata } from "../database.js";
import { createDatabase, type DrizzleExecutor, type DrizzleTransaction } from "../drizzle.js";
import {
    accountBans,
    accounts,
    auditLogEntries,
    authSessionEvents,
    authSessions,
    backupRecords,
    chatMembers,
    chatUpdates,
    chats,
    dataExportJobs,
    fileAccessGrants,
    files,
    messageAttachments,
    messageRevisions,
    messageSearchDocuments,
    messages,
    moderationActions,
    moderationReports,
    notifications,
    retentionRuns,
    serverSyncState,
    syncEvents,
    threadParticipants,
    threadUserStates,
    threads,
    users,
} from "../schema.js";
import {
    OperationsError,
    type AccountBan,
    type AuditLogEntry,
    type BackupRecord,
    type BackupStatus,
    type DataExportJob,
    type DataExportKind,
    type DataExportStatus,
    type ModerationAction,
    type ModerationActionKind,
    type ModerationReport,
    type ModerationReportStatus,
    type OperationsSyncHint,
    type Page,
    type RetentionRun,
    type RetentionScope,
    type UserAccessTelemetry,
} from "./types.js";

interface AuditContext {
    request?: RequestMetadata;
    metadata?: Record<string, unknown>;
}

interface AccountTarget {
    accountId: string;
    userId: string;
    username: string;
    bannedAt?: string;
    banExpiresAt?: string;
    banReason?: string;
    bannedByUserId?: string;
}

export interface ClaimedDataExport extends DataExportJob {
    claimStartedAt: string;
}

const auditSelection = {
    id: auditLogEntries.id,
    actor_user_id: auditLogEntries.actorUserId,
    actor_integration_id: auditLogEntries.actorIntegrationId,
    action: auditLogEntries.action,
    target_type: auditLogEntries.targetType,
    target_id: auditLogEntries.targetId,
    chat_id: auditLogEntries.chatId,
    before_json: auditLogEntries.beforeJson,
    after_json: auditLogEntries.afterJson,
    metadata_json: auditLogEntries.metadataJson,
    client_ip: auditLogEntries.clientIp,
    device: auditLogEntries.device,
    app_version: auditLogEntries.appVersion,
    user_agent: auditLogEntries.userAgent,
    created_at: auditLogEntries.createdAt,
};

const banSelection = {
    id: accountBans.id,
    account_id: accountBans.accountId,
    user_id: users.id,
    username: users.username,
    banned_by_user_id: accountBans.bannedByUserId,
    reason: accountBans.reason,
    banned_at: accountBans.bannedAt,
    expires_at: accountBans.expiresAt,
    revoked_at: accountBans.revokedAt,
    revoked_by_user_id: accountBans.revokedByUserId,
    revoke_reason: accountBans.revokeReason,
};

const reportSelection = {
    id: moderationReports.id,
    reported_by_user_id: moderationReports.reportedByUserId,
    target_user_id: moderationReports.targetUserId,
    chat_id: moderationReports.chatId,
    message_id: moderationReports.messageId,
    file_id: moderationReports.fileId,
    reason: moderationReports.reason,
    details: moderationReports.details,
    status: moderationReports.status,
    assigned_to_user_id: moderationReports.assignedToUserId,
    resolution: moderationReports.resolution,
    created_at: moderationReports.createdAt,
    updated_at: moderationReports.updatedAt,
    resolved_at: moderationReports.resolvedAt,
};

const moderationActionSelection = {
    id: moderationActions.id,
    report_id: moderationActions.reportId,
    actor_user_id: moderationActions.actorUserId,
    target_user_id: moderationActions.targetUserId,
    chat_id: moderationActions.chatId,
    message_id: moderationActions.messageId,
    file_id: moderationActions.fileId,
    action: moderationActions.action,
    reason: moderationActions.reason,
    metadata_json: moderationActions.metadataJson,
    expires_at: moderationActions.expiresAt,
    revoked_at: moderationActions.revokedAt,
    created_at: moderationActions.createdAt,
};

const exportSelection = {
    id: dataExportJobs.id,
    requested_by_user_id: dataExportJobs.requestedByUserId,
    kind: dataExportJobs.kind,
    target_id: dataExportJobs.targetId,
    status: dataExportJobs.status,
    output_file_id: dataExportJobs.outputFileId,
    options_json: dataExportJobs.optionsJson,
    last_error: dataExportJobs.lastError,
    expires_at: dataExportJobs.expiresAt,
    created_at: dataExportJobs.createdAt,
    started_at: dataExportJobs.startedAt,
    completed_at: dataExportJobs.completedAt,
};

const backupSelection = {
    id: backupRecords.id,
    storage_provider: backupRecords.storageProvider,
    storage_key: backupRecords.storageKey,
    checksum_sha256: backupRecords.checksumSha256,
    size: backupRecords.size,
    status: backupRecords.status,
    created_by_user_id: backupRecords.createdByUserId,
    metadata_json: backupRecords.metadataJson,
    last_error: backupRecords.lastError,
    created_at: backupRecords.createdAt,
    completed_at: backupRecords.completedAt,
    retention_until: backupRecords.retentionUntil,
};

const retentionSelection = {
    id: retentionRuns.id,
    scope: retentionRuns.scope,
    status: retentionRuns.status,
    items_examined: retentionRuns.itemsExamined,
    items_deleted: retentionRuns.itemsDeleted,
    details_json: retentionRuns.detailsJson,
    last_error: retentionRuns.lastError,
    started_at: retentionRuns.startedAt,
    completed_at: retentionRuns.completedAt,
};

/** Durable administrative and operational state. All authorization is rechecked in SQLite. */
export class OperationsRepository {
    private readonly client: Client;
    private readonly db;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
        this.db = createDatabase(this.client);
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    async listAuditLog(input: {
        actorUserId: string;
        action?: string;
        targetType?: string;
        targetId?: string;
        auditedActorUserId?: string;
        before?: string;
        limit: number;
    }): Promise<Page<AuditLogEntry>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const conditions: SQL[] = [];
        if (input.action) conditions.push(eq(auditLogEntries.action, input.action));
        if (input.targetType) conditions.push(eq(auditLogEntries.targetType, input.targetType));
        if (input.targetId) conditions.push(eq(auditLogEntries.targetId, input.targetId));
        if (input.auditedActorUserId)
            conditions.push(eq(auditLogEntries.actorUserId, input.auditedActorUserId));
        if (cursor)
            conditions.push(cursorCondition(auditLogEntries.createdAt, auditLogEntries.id, cursor));
        const rows = await this.db
            .select(auditSelection)
            .from(auditLogEntries)
            .where(and(...conditions))
            .orderBy(desc(auditLogEntries.createdAt), desc(auditLogEntries.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asAudit);
    }

    async applyBan(input: {
        actorUserId: string;
        targetUserId: string;
        reason?: string;
        expiresAt?: string;
        context?: AuditContext;
    }): Promise<AccountBan> {
        const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.actorUserId === input.targetUserId)
                throw new OperationsError("forbidden", "Administrators cannot ban themselves");
            const target = await this.accountTargetDb(tx, input.targetUserId);
            await this.closeElapsedBan(tx, target);
            if (
                target.bannedAt &&
                (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
            )
                throw new OperationsError("conflict", "User already has an active ban");
            const id = createId();
            await tx.insert(accountBans).values({
                id,
                accountId: target.accountId,
                bannedByUserId: input.actorUserId,
                reason: input.reason,
                expiresAt,
            });
            await tx
                .update(accounts)
                .set({
                    bannedAt: sql`CURRENT_TIMESTAMP`,
                    banExpiresAt: expiresAt ?? null,
                    banReason: input.reason ?? null,
                    bannedByUserId: input.actorUserId,
                })
                .where(eq(accounts.id, target.accountId));
            const sessions = await tx
                .update(authSessions)
                .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(authSessions.accountId, target.accountId),
                        isNull(authSessions.revokedAt),
                    ),
                )
                .returning({ id: authSessions.id });
            await this.syncUserMutation(tx, input.actorUserId, target.userId, "user.banned");
            const ban = await this.banDb(tx, id);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "user.ban_applied",
                targetType: "user",
                targetId: target.userId,
                before: accountTargetState(target),
                after: ban,
                context: mergeContext(input.context, {
                    revokedSessionCount: sessions.length,
                }),
            });
            return ban;
        });
    }

    async revokeBan(input: {
        actorUserId: string;
        targetUserId: string;
        reason?: string;
        context?: AuditContext;
    }): Promise<AccountBan> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const target = await this.accountTargetDb(tx, input.targetUserId);
            const [current] = await tx
                .select(banSelection)
                .from(accountBans)
                .leftJoin(users, eq(users.accountId, accountBans.accountId))
                .where(
                    and(eq(accountBans.accountId, target.accountId), isNull(accountBans.revokedAt)),
                )
                .orderBy(desc(accountBans.bannedAt), desc(accountBans.id))
                .limit(1);
            if (!current || !target.bannedAt)
                throw new OperationsError("conflict", "User does not have an active ban");
            await tx
                .update(accountBans)
                .set({
                    revokedAt: sql`CURRENT_TIMESTAMP`,
                    revokedByUserId: input.actorUserId,
                    revokeReason: input.reason ?? null,
                })
                .where(
                    and(eq(accountBans.accountId, target.accountId), isNull(accountBans.revokedAt)),
                );
            await tx
                .update(accounts)
                .set({ bannedAt: null, banExpiresAt: null, banReason: null, bannedByUserId: null })
                .where(eq(accounts.id, target.accountId));
            await this.syncUserMutation(tx, input.actorUserId, target.userId, "user.unbanned");
            const ban = await this.banDb(tx, text(current.id));
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "user.ban_revoked",
                targetType: "user",
                targetId: target.userId,
                before: accountTargetState(target),
                after: ban,
                context: input.context,
            });
            return ban;
        });
    }

    /** Clears elapsed bans durably. Safe for concurrent timers on multiple server instances. */
    async expireDueBans(input?: { actorUserId?: string; context?: AuditContext }): Promise<number> {
        return this.writeDb(async (tx) => {
            if (input?.actorUserId) await this.requireAdminDb(tx, input.actorUserId);
            const now = new Date().toISOString();
            const due = await tx
                .select({
                    accountId: accounts.id,
                    userId: users.id,
                    bannedAt: accounts.bannedAt,
                    banExpiresAt: accounts.banExpiresAt,
                    banReason: accounts.banReason,
                    bannedByUserId: accounts.bannedByUserId,
                })
                .from(accounts)
                .leftJoin(users, eq(users.accountId, accounts.id))
                .where(
                    and(
                        sql`${accounts.bannedAt} IS NOT NULL`,
                        sql`${accounts.banExpiresAt} IS NOT NULL`,
                        lte(accounts.banExpiresAt, now),
                    ),
                );
            for (const row of due) {
                await tx
                    .update(accountBans)
                    .set({
                        revokedAt: sql`coalesce(${accountBans.revokedAt}, ${now})`,
                        revokeReason: sql`coalesce(${accountBans.revokeReason}, 'expired')`,
                    })
                    .where(
                        and(
                            eq(accountBans.accountId, row.accountId),
                            isNull(accountBans.revokedAt),
                            lte(accountBans.expiresAt, now),
                        ),
                    );
                const updated = await tx
                    .update(accounts)
                    .set({
                        bannedAt: null,
                        banExpiresAt: null,
                        banReason: null,
                        bannedByUserId: null,
                    })
                    .where(
                        and(
                            eq(accounts.id, row.accountId),
                            sql`${accounts.bannedAt} IS NOT NULL`,
                            sql`${accounts.banExpiresAt} IS NOT NULL`,
                            lte(accounts.banExpiresAt, now),
                        ),
                    )
                    .returning({ id: accounts.id });
                if (!updated.length) continue;
                if (row.userId)
                    await this.syncUserMutation(
                        tx,
                        input?.actorUserId,
                        row.userId,
                        "user.unbanned",
                    );
                await this.appendAudit(tx, {
                    actorUserId: input?.actorUserId,
                    action: "user.ban_expired",
                    targetType: "user",
                    targetId: row.userId ?? undefined,
                    before: {
                        bannedAt: row.bannedAt ?? undefined,
                        expiresAt: row.banExpiresAt ?? undefined,
                        reason: row.banReason ?? undefined,
                        bannedByUserId: row.bannedByUserId ?? undefined,
                    },
                    after: { banned: false },
                    context: input?.context,
                });
            }
            return due.length;
        });
    }

    async listBans(input: {
        actorUserId: string;
        targetUserId?: string;
        status?: "active" | "expired" | "revoked";
        before?: string;
        limit: number;
    }): Promise<Page<AccountBan>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const conditions: SQL[] = [];
        if (input.targetUserId) conditions.push(eq(users.id, input.targetUserId));
        const now = new Date().toISOString();
        if (input.status === "active") {
            conditions.push(
                and(
                    isNull(accountBans.revokedAt),
                    or(isNull(accountBans.expiresAt), gt(accountBans.expiresAt, now)),
                )!,
            );
        } else if (input.status === "expired") {
            conditions.push(
                and(
                    isNull(accountBans.revokedAt),
                    sql`${accountBans.expiresAt} IS NOT NULL`,
                    lte(accountBans.expiresAt, now),
                )!,
            );
        } else if (input.status === "revoked") {
            conditions.push(sql`${accountBans.revokedAt} IS NOT NULL`);
        }
        if (cursor) conditions.push(cursorCondition(accountBans.bannedAt, accountBans.id, cursor));
        const rows = await this.db
            .select(banSelection)
            .from(accountBans)
            .leftJoin(users, eq(users.accountId, accountBans.accountId))
            .where(and(...conditions))
            .orderBy(desc(accountBans.bannedAt), desc(accountBans.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asBan, (item) => item.bannedAt);
    }

    async createReport(input: {
        actorUserId: string;
        targetUserId?: string;
        chatId?: string;
        messageId?: string;
        fileId?: string;
        reason: string;
        details?: string;
        context?: AuditContext;
    }): Promise<ModerationReport> {
        if (![input.targetUserId, input.chatId, input.messageId, input.fileId].some(Boolean))
            throw new OperationsError("invalid", "A report must identify at least one target");
        return this.writeDb(async (tx) => {
            await this.requireActiveUserDb(tx, input.actorUserId);
            await this.requireReportTargetAccess(tx, input);
            const id = createId();
            await tx.insert(moderationReports).values({
                id,
                reportedByUserId: input.actorUserId,
                targetUserId: input.targetUserId,
                chatId: input.chatId,
                messageId: input.messageId,
                fileId: input.fileId,
                reason: input.reason,
                details: input.details,
            });
            const report = await this.reportDb(tx, id);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "moderation.report_created",
                targetType: "moderation_report",
                targetId: id,
                chatId: input.chatId,
                after: report,
                context: input.context,
            });
            return report;
        });
    }

    async listReports(input: {
        actorUserId: string;
        status?: ModerationReportStatus;
        assignedToUserId?: string;
        before?: string;
        limit: number;
    }): Promise<Page<ModerationReport>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const conditions: SQL[] = [];
        if (input.status) conditions.push(eq(moderationReports.status, input.status));
        if (input.assignedToUserId)
            conditions.push(eq(moderationReports.assignedToUserId, input.assignedToUserId));
        if (cursor)
            conditions.push(
                cursorCondition(moderationReports.createdAt, moderationReports.id, cursor),
            );
        const rows = await this.db
            .select(reportSelection)
            .from(moderationReports)
            .where(and(...conditions))
            .orderBy(desc(moderationReports.createdAt), desc(moderationReports.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asReport);
    }

    async updateReport(input: {
        actorUserId: string;
        reportId: string;
        status?: ModerationReportStatus;
        assignedToUserId?: string | null;
        resolution?: string | null;
        context?: AuditContext;
    }): Promise<ModerationReport> {
        if (
            input.status === undefined &&
            input.assignedToUserId === undefined &&
            input.resolution === undefined
        )
            throw new OperationsError("invalid", "At least one report field is required");
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const before = await this.reportDb(tx, input.reportId);
            if (input.assignedToUserId) await this.requireAdminDb(tx, input.assignedToUserId);
            const status = input.status ?? before.status;
            const assigned =
                input.assignedToUserId === undefined
                    ? before.assignedToUserId
                    : input.assignedToUserId;
            const resolution =
                input.resolution === undefined ? before.resolution : input.resolution;
            await tx
                .update(moderationReports)
                .set({
                    status,
                    assignedToUserId: assigned ?? null,
                    resolution: resolution ?? null,
                    resolvedAt:
                        status === "resolved" || status === "dismissed"
                            ? sql`coalesce(${moderationReports.resolvedAt}, CURRENT_TIMESTAMP)`
                            : null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(moderationReports.id, input.reportId));
            const after = await this.reportDb(tx, input.reportId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "moderation.report_updated",
                targetType: "moderation_report",
                targetId: input.reportId,
                chatId: after.chatId,
                before,
                after,
                context: input.context,
            });
            return after;
        });
    }

    async takeModerationAction(input: {
        actorUserId: string;
        reportId: string;
        action: ModerationActionKind;
        automationRunId?: string;
        reason?: string;
        expiresAt?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    }): Promise<{
        report: ModerationReport;
        action: ModerationAction;
        sync?: OperationsSyncHint;
    }> {
        const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
        if (expiresAt && input.action !== "ban" && input.action !== "restrict")
            throw new OperationsError("invalid", `${input.action} does not support expiresAt`);
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.automationRunId) {
                const [existing] = await tx
                    .select(moderationActionSelection)
                    .from(moderationActions)
                    .where(eq(moderationActions.automationRunId, input.automationRunId))
                    .limit(1);
                if (existing) {
                    const action = asModerationAction(existing);
                    if (action.reportId !== input.reportId)
                        throw new OperationsError(
                            "conflict",
                            "Automation run is already bound to another moderation report",
                        );
                    return {
                        report: await this.reportDb(tx, input.reportId),
                        action,
                    };
                }
            }
            const before = await this.reportDb(tx, input.reportId);
            if (
                (input.action === "ban" ||
                    input.action === "unban" ||
                    input.action === "delete_user" ||
                    input.action === "warn" ||
                    input.action === "restrict") &&
                !before.targetUserId
            )
                throw new OperationsError("invalid", `${input.action} requires a reported user`);
            if (input.action === "remove_message" && !before.messageId)
                throw new OperationsError("invalid", "remove_message requires a reported message");
            if (input.action === "remove_file" && !before.fileId)
                throw new OperationsError("invalid", "remove_file requires a reported file");

            const actionId = createId();
            let actionChatId = before.chatId;
            let sync: OperationsSyncHint | undefined;
            if (input.action === "ban")
                sync = await this.applyBanInTransaction(
                    tx,
                    input.actorUserId,
                    before.targetUserId!,
                    input.reason,
                    expiresAt,
                );
            else if (input.action === "unban")
                sync = await this.revokeBanInTransaction(
                    tx,
                    input.actorUserId,
                    before.targetUserId!,
                    input.reason,
                );
            else if (input.action === "warn" || input.action === "restrict")
                sync = await this.createModerationNotification(tx, {
                    actorUserId: input.actorUserId,
                    targetUserId: before.targetUserId!,
                    chatId: before.chatId,
                    actionId,
                    reportId: input.reportId,
                    action: input.action,
                    reason: input.reason,
                    expiresAt,
                });
            else if (input.action === "remove_message") {
                const removed = await this.removeMessageInTransaction(
                    tx,
                    input.actorUserId,
                    before.messageId!,
                    input.reason,
                );
                actionChatId = removed.chatId;
                sync = removed.sync;
            } else if (input.action === "remove_file")
                sync = await this.removeFileInTransaction(
                    tx,
                    input.actorUserId,
                    before.fileId!,
                    input.reason,
                );
            else if (input.action === "delete_user")
                sync = await this.deleteUserInTransaction(
                    tx,
                    input.actorUserId,
                    before.targetUserId!,
                );

            await tx.insert(moderationActions).values({
                id: actionId,
                reportId: input.reportId,
                actorUserId: input.actorUserId,
                targetUserId: before.targetUserId,
                chatId: actionChatId,
                messageId: before.messageId,
                fileId: before.fileId,
                action: input.action,
                reason: input.reason,
                metadataJson: json(input.metadata),
                automationRunId: input.automationRunId,
                expiresAt,
            });
            await tx
                .update(moderationReports)
                .set({
                    status: "resolved",
                    assignedToUserId: input.actorUserId,
                    resolution: input.reason ?? input.action,
                    resolvedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(moderationReports.id, input.reportId));
            const report = await this.reportDb(tx, input.reportId);
            const action = await this.moderationActionDb(tx, actionId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: `moderation.${input.action}`,
                targetType: "moderation_report",
                targetId: input.reportId,
                chatId: report.chatId,
                before,
                after: { report, action },
                context: mergeContext(input.context, input.metadata),
            });
            return { report, action, sync };
        });
    }

    async revokeModerationAction(input: {
        actorUserId: string;
        actionId: string;
        reason?: string;
        context?: AuditContext;
    }): Promise<{ action: ModerationAction; sync: OperationsSyncHint }> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const before = await this.moderationActionDb(tx, input.actionId);
            if (before.revokedAt)
                throw new OperationsError("conflict", "Moderation action is already revoked");
            if (before.action !== "restrict")
                throw new OperationsError("conflict", "Only restrictions can be revoked");
            if (!before.targetUserId) throw new Error("Restriction is missing its target user");
            await tx
                .update(moderationActions)
                .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(moderationActions.id, input.actionId),
                        isNull(moderationActions.revokedAt),
                    ),
                );
            const sync = await this.createModerationNotification(tx, {
                actorUserId: input.actorUserId,
                targetUserId: before.targetUserId,
                chatId: before.chatId,
                actionId: input.actionId,
                reportId: before.reportId,
                action: "restrict_revoked",
                reason: input.reason,
            });
            const action = await this.moderationActionDb(tx, input.actionId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "moderation.action_revoked",
                targetType: "moderation_action",
                targetId: input.actionId,
                chatId: before.chatId,
                before,
                after: action,
                context: mergeContext(input.context, { reason: input.reason }),
            });
            return { action, sync };
        });
    }

    async requestDataExport(input: {
        actorUserId: string;
        kind: DataExportKind;
        targetId?: string;
        options?: Record<string, unknown>;
        expiresAt?: string;
        context?: AuditContext;
    }): Promise<DataExportJob> {
        const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
        return this.writeDb(async (tx) => {
            const actor = await this.requireActiveUserDb(tx, input.actorUserId);
            let targetId = input.targetId;
            if (input.kind === "user_data") {
                targetId ??= input.actorUserId;
                if (targetId !== input.actorUserId && actor.role !== "admin")
                    throw new OperationsError(
                        "forbidden",
                        "Only administrators can export another user",
                    );
                await this.requireExistingUserDb(tx, targetId);
            } else if (input.kind === "chat_history") {
                if (!targetId)
                    throw new OperationsError("invalid", "chat_history requires targetId");
                if (!(await this.canAccessChat(tx, input.actorUserId, targetId)))
                    throw new OperationsError("not_found", "Chat was not found");
            } else {
                if (actor.role !== "admin")
                    throw new OperationsError("forbidden", "This export requires an administrator");
                targetId = undefined;
            }
            const id = createId();
            await tx.insert(dataExportJobs).values({
                id,
                requestedByUserId: input.actorUserId,
                kind: input.kind,
                targetId,
                optionsJson: json(input.options),
                expiresAt,
            });
            const job = await this.exportJobDb(tx, id);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "data_export.requested",
                targetType: "data_export",
                targetId: id,
                chatId: input.kind === "chat_history" ? targetId : undefined,
                after: job,
                context: input.context,
            });
            return job;
        });
    }

    async getDataExport(actorUserId: string, jobId: string): Promise<DataExportJob> {
        const actor = await this.requireActiveUserDb(this.db, actorUserId);
        const job = await this.exportJobDb(this.db, jobId);
        if (actor.role !== "admin" && job.requestedByUserId !== actorUserId)
            throw new OperationsError("not_found", "Data export was not found");
        return job;
    }

    async listDataExports(input: {
        actorUserId: string;
        status?: DataExportStatus;
        requestedByUserId?: string;
        before?: string;
        limit: number;
        ownOnly?: boolean;
    }): Promise<Page<DataExportJob>> {
        const actor = await this.requireActiveUserDb(this.db, input.actorUserId);
        if (!input.ownOnly && actor.role !== "admin")
            throw new OperationsError("forbidden", "Administrator access is required");
        const conditions: SQL[] = [];
        if (input.ownOnly) conditions.push(eq(dataExportJobs.requestedByUserId, input.actorUserId));
        else if (input.requestedByUserId)
            conditions.push(eq(dataExportJobs.requestedByUserId, input.requestedByUserId));
        if (input.status) conditions.push(eq(dataExportJobs.status, input.status));
        const cursor = decodeCursor(input.before);
        if (cursor)
            conditions.push(cursorCondition(dataExportJobs.createdAt, dataExportJobs.id, cursor));
        const rows = await this.db
            .select(exportSelection)
            .from(dataExportJobs)
            .where(and(...conditions))
            .orderBy(desc(dataExportJobs.createdAt), desc(dataExportJobs.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asExport);
    }

    async cancelDataExport(input: {
        actorUserId: string;
        jobId: string;
        context?: AuditContext;
    }): Promise<DataExportJob> {
        return this.writeDb(async (tx) => {
            const actor = await this.requireActiveUserDb(tx, input.actorUserId);
            const before = await this.exportJobDb(tx, input.jobId);
            if (actor.role !== "admin" && before.requestedByUserId !== input.actorUserId)
                throw new OperationsError("not_found", "Data export was not found");
            if (before.status !== "pending" && before.status !== "running")
                throw new OperationsError("conflict", "Data export can no longer be cancelled");
            await tx
                .update(dataExportJobs)
                .set({ status: "cancelled", completedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(dataExportJobs.id, input.jobId));
            const after = await this.exportJobDb(tx, input.jobId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "data_export.cancelled",
                targetType: "data_export",
                targetId: input.jobId,
                before,
                after,
                context: input.context,
            });
            return after;
        });
    }

    async updateDataExport(input: {
        actorUserId: string;
        jobId: string;
        status: Exclude<DataExportStatus, "pending">;
        outputFileId?: string;
        lastError?: string;
        expiresAt?: string;
        context?: AuditContext;
    }): Promise<DataExportJob> {
        const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const before = await this.exportJobDb(tx, input.jobId);
            assertExportTransition(before.status, input.status);
            if (input.status === "complete") {
                if (!input.outputFileId)
                    throw new OperationsError(
                        "invalid",
                        "A completed export requires outputFileId",
                    );
                const [file] = await tx
                    .select({ id: files.id })
                    .from(files)
                    .where(
                        and(
                            eq(files.id, input.outputFileId),
                            isNull(files.deletedAt),
                            eq(files.uploadStatus, "complete"),
                        ),
                    );
                if (!file) throw new OperationsError("not_found", "Output file was not found");
                if (!before.requestedByUserId)
                    throw new OperationsError(
                        "conflict",
                        "Export requester no longer exists; the artifact cannot be granted safely",
                    );
                await tx
                    .insert(fileAccessGrants)
                    .values({
                        id: createId(),
                        fileId: input.outputFileId,
                        principalType: "user",
                        principalId: before.requestedByUserId,
                        grantedByUserId: input.actorUserId,
                        expiresAt: expiresAt ?? before.expiresAt,
                    })
                    .onConflictDoUpdate({
                        target: [
                            fileAccessGrants.fileId,
                            fileAccessGrants.principalType,
                            fileAccessGrants.principalId,
                        ],
                        targetWhere: isNull(fileAccessGrants.sourceMessageId),
                        set: {
                            expiresAt: sql`CASE WHEN ${fileAccessGrants.expiresAt} IS NULL OR excluded.expires_at IS NULL THEN NULL WHEN ${fileAccessGrants.expiresAt} > excluded.expires_at THEN ${fileAccessGrants.expiresAt} ELSE excluded.expires_at END`,
                        },
                    });
            }
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed export requires lastError");
            await tx
                .update(dataExportJobs)
                .set({
                    status: input.status,
                    outputFileId: input.outputFileId ?? sql`${dataExportJobs.outputFileId}`,
                    lastError: input.lastError ?? null,
                    expiresAt: expiresAt ?? sql`${dataExportJobs.expiresAt}`,
                    startedAt:
                        input.status === "running"
                            ? sql`coalesce(${dataExportJobs.startedAt}, CURRENT_TIMESTAMP)`
                            : sql`${dataExportJobs.startedAt}`,
                    completedAt: ["complete", "failed", "cancelled", "expired"].includes(
                        input.status,
                    )
                        ? sql`coalesce(${dataExportJobs.completedAt}, CURRENT_TIMESTAMP)`
                        : sql`${dataExportJobs.completedAt}`,
                })
                .where(eq(dataExportJobs.id, input.jobId));
            const after = await this.exportJobDb(tx, input.jobId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: `data_export.${input.status}`,
                targetType: "data_export",
                targetId: input.jobId,
                before,
                after,
                context: input.context,
            });
            return after;
        });
    }

    async claimPendingDataExports(limit = 5, leaseMs = 5 * 60_000): Promise<ClaimedDataExport[]> {
        const claimedAt = new Date().toISOString();
        const staleBefore = new Date(Date.now() - leaseMs).toISOString();
        return this.writeDb(async (tx) => {
            const claimable = or(
                eq(dataExportJobs.status, "pending"),
                and(
                    eq(dataExportJobs.status, "running"),
                    or(
                        isNull(dataExportJobs.startedAt),
                        lte(dataExportJobs.startedAt, staleBefore),
                    ),
                ),
            );
            const candidates = await tx
                .select({ id: dataExportJobs.id })
                .from(dataExportJobs)
                .where(claimable)
                .orderBy(dataExportJobs.createdAt, dataExportJobs.id)
                .limit(limit);
            const claimed: ClaimedDataExport[] = [];
            for (const candidate of candidates) {
                const [row] = await tx
                    .update(dataExportJobs)
                    .set({ status: "running", startedAt: claimedAt, lastError: null })
                    .where(and(eq(dataExportJobs.id, candidate.id), claimable))
                    .returning(exportSelection);
                if (row) claimed.push({ ...asExport(row), claimStartedAt: claimedAt });
            }
            return claimed;
        });
    }

    async buildDataExportArtifact(claim: ClaimedDataExport): Promise<Record<string, unknown>> {
        if (!claim.requestedByUserId) throw new Error("Data export requester no longer exists");
        const base = {
            schemaVersion: 1,
            exportId: claim.id,
            kind: claim.kind,
            requestedByUserId: claim.requestedByUserId,
            targetId: claim.targetId,
            createdAt: claim.createdAt,
            generatedAt: new Date().toISOString(),
            options: claim.options,
        };
        if (claim.kind === "user_data") {
            const targetId = claim.targetId ?? claim.requestedByUserId;
            const [profile] = await this.db
                .select({
                    id: users.id,
                    username: users.username,
                    firstName: users.firstName,
                    lastName: users.lastName,
                    title: users.title,
                    email: accounts.email,
                    phone: users.phone,
                    photoFileId: users.photoFileId,
                    createdAt: users.createdAt,
                })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(eq(users.id, targetId));
            if (!profile) throw new Error("Data export target no longer exists");
            const options = objectValue(claim.options);
            const exportedFiles = options.includeFiles
                ? await this.db
                      .select({
                          id: files.id,
                          kind: files.kind,
                          originalName: files.originalName,
                          contentType: files.contentType,
                          size: files.size,
                          createdAt: files.createdAt,
                      })
                      .from(files)
                      .where(and(eq(files.uploadedByUserId, targetId), isNull(files.deletedAt)))
                      .orderBy(files.createdAt, files.id)
                : [];
            return { ...base, data: { profile, files: exportedFiles } };
        }
        if (claim.kind === "chat_history") {
            if (
                !claim.targetId ||
                !(await this.canAccessChat(this.db, claim.requestedByUserId, claim.targetId))
            )
                throw new Error("Data export chat is no longer accessible");
            const [chat] = await this.db
                .select({ id: chats.id, kind: chats.kind, name: chats.name, topic: chats.topic })
                .from(chats)
                .where(eq(chats.id, claim.targetId));
            const exportedMessages = await this.db
                .select({
                    id: messages.id,
                    sequence: messages.sequence,
                    senderUserId: messages.senderUserId,
                    senderBotId: messages.senderBotId,
                    kind: messages.kind,
                    text: messages.text,
                    threadRootMessageId: messages.threadRootMessageId,
                    createdAt: messages.createdAt,
                    editedAt: messages.editedAt,
                    deletedAt: messages.deletedAt,
                })
                .from(messages)
                .where(eq(messages.chatId, claim.targetId))
                .orderBy(messages.sequence);
            return { ...base, data: { chat, messages: exportedMessages } };
        }
        await this.requireAdminDb(this.db, claim.requestedByUserId);
        if (claim.kind === "audit_log") {
            const entries = await this.db
                .select(auditSelection)
                .from(auditLogEntries)
                .orderBy(auditLogEntries.createdAt, auditLogEntries.id);
            return { ...base, data: { auditLog: entries.map(asAudit) } };
        }
        const [exportedUsers, exportedChats] = await Promise.all([
            this.db
                .select({
                    id: users.id,
                    username: users.username,
                    role: users.role,
                    createdAt: users.createdAt,
                    deletedAt: users.deletedAt,
                })
                .from(users)
                .orderBy(users.createdAt, users.id),
            this.db
                .select({
                    id: chats.id,
                    kind: chats.kind,
                    name: chats.name,
                    createdAt: chats.createdAt,
                    deletedAt: chats.deletedAt,
                })
                .from(chats)
                .orderBy(chats.createdAt, chats.id),
        ]);
        return { ...base, data: { users: exportedUsers, chats: exportedChats } };
    }

    async completeClaimedDataExport(
        claim: ClaimedDataExport,
        outputFileId: string,
    ): Promise<boolean> {
        const requesterId = claim.requestedByUserId;
        if (!requesterId) return false;
        return this.writeDb(async (tx) => {
            const [completed] = await tx
                .update(dataExportJobs)
                .set({
                    status: "complete",
                    outputFileId,
                    lastError: null,
                    completedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(dataExportJobs.id, claim.id),
                        eq(dataExportJobs.status, "running"),
                        eq(dataExportJobs.startedAt, claim.claimStartedAt),
                    ),
                )
                .returning({ id: dataExportJobs.id });
            if (!completed) return false;
            await tx
                .insert(fileAccessGrants)
                .values({
                    id: createId(),
                    fileId: outputFileId,
                    principalType: "user",
                    principalId: requesterId,
                    grantedByUserId: requesterId,
                    expiresAt: claim.expiresAt,
                })
                .onConflictDoUpdate({
                    target: [
                        fileAccessGrants.fileId,
                        fileAccessGrants.principalType,
                        fileAccessGrants.principalId,
                    ],
                    targetWhere: isNull(fileAccessGrants.sourceMessageId),
                    set: { expiresAt: claim.expiresAt ?? null },
                });
            await this.appendAudit(tx, {
                actorUserId: requesterId,
                action: "data_export.complete",
                targetType: "data_export",
                targetId: claim.id,
                after: { outputFileId },
            });
            return true;
        });
    }

    async failClaimedDataExport(claim: ClaimedDataExport, error: unknown): Promise<boolean> {
        const message = error instanceof Error ? error.message : String(error);
        const [failed] = await this.db
            .update(dataExportJobs)
            .set({
                status: "failed",
                lastError: message.slice(0, 2_000),
                completedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(dataExportJobs.id, claim.id),
                    eq(dataExportJobs.status, "running"),
                    eq(dataExportJobs.startedAt, claim.claimStartedAt),
                ),
            )
            .returning({ id: dataExportJobs.id });
        return Boolean(failed);
    }

    async createBackup(input: {
        actorUserId: string;
        storageProvider: string;
        storageKey: string;
        retentionUntil?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    }): Promise<BackupRecord> {
        const retentionUntil = futureTimestamp(input.retentionUntil, "retentionUntil");
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const id = createId();
            try {
                await tx.insert(backupRecords).values({
                    id,
                    storageProvider: input.storageProvider,
                    storageKey: input.storageKey,
                    createdByUserId: input.actorUserId,
                    metadataJson: json(input.metadata),
                    retentionUntil,
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new OperationsError("conflict", "Backup storage key is already recorded");
                throw error;
            }
            const backup = await this.backupDb(tx, id);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "backup.created",
                targetType: "backup",
                targetId: id,
                after: backup,
                context: input.context,
            });
            return backup;
        });
    }

    async listBackups(input: {
        actorUserId: string;
        status?: BackupStatus;
        before?: string;
        limit: number;
    }): Promise<Page<BackupRecord>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const conditions: SQL[] = [];
        if (input.status) conditions.push(eq(backupRecords.status, input.status));
        const cursor = decodeCursor(input.before);
        if (cursor)
            conditions.push(cursorCondition(backupRecords.createdAt, backupRecords.id, cursor));
        const rows = await this.db
            .select(backupSelection)
            .from(backupRecords)
            .where(and(...conditions))
            .orderBy(desc(backupRecords.createdAt), desc(backupRecords.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asBackup);
    }

    async updateBackup(input: {
        actorUserId: string;
        backupId: string;
        status: Exclude<BackupStatus, "pending">;
        checksumSha256?: string;
        size?: number;
        lastError?: string;
        retentionUntil?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    }): Promise<BackupRecord> {
        const retentionUntil = futureTimestamp(input.retentionUntil, "retentionUntil");
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const before = await this.backupDb(tx, input.backupId);
            assertBackupTransition(before.status, input.status);
            if (input.status === "complete" && (!input.checksumSha256 || input.size === undefined))
                throw new OperationsError(
                    "invalid",
                    "A completed backup requires checksumSha256 and size",
                );
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed backup requires lastError");
            await tx
                .update(backupRecords)
                .set({
                    status: input.status,
                    checksumSha256: input.checksumSha256 ?? sql`${backupRecords.checksumSha256}`,
                    size: input.size ?? sql`${backupRecords.size}`,
                    lastError: input.lastError ?? null,
                    retentionUntil: retentionUntil ?? sql`${backupRecords.retentionUntil}`,
                    metadataJson:
                        input.metadata === undefined
                            ? sql`${backupRecords.metadataJson}`
                            : json(input.metadata),
                    completedAt: ["complete", "failed", "deleted"].includes(input.status)
                        ? sql`coalesce(${backupRecords.completedAt}, CURRENT_TIMESTAMP)`
                        : sql`${backupRecords.completedAt}`,
                })
                .where(eq(backupRecords.id, input.backupId));
            const after = await this.backupDb(tx, input.backupId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: `backup.${input.status}`,
                targetType: "backup",
                targetId: input.backupId,
                before,
                after,
                context: input.context,
            });
            return after;
        });
    }

    async startRetentionRun(input: {
        actorUserId: string;
        scope: RetentionScope;
        details?: Record<string, unknown>;
        context?: AuditContext;
    }): Promise<RetentionRun> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const [active] = await tx
                .select({ id: retentionRuns.id })
                .from(retentionRuns)
                .where(
                    and(eq(retentionRuns.scope, input.scope), eq(retentionRuns.status, "running")),
                )
                .limit(1);
            if (active)
                throw new OperationsError(
                    "conflict",
                    "A retention run is already active for this scope",
                );
            const id = createId();
            await tx
                .insert(retentionRuns)
                .values({ id, scope: input.scope, detailsJson: json(input.details) });
            const run = await this.retentionRunDb(tx, id);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "retention.started",
                targetType: "retention_run",
                targetId: id,
                after: run,
                context: input.context,
            });
            return run;
        });
    }

    async listRetentionRuns(input: {
        actorUserId: string;
        scope?: RetentionScope;
        before?: string;
        limit: number;
    }): Promise<Page<RetentionRun>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const conditions: SQL[] = [];
        if (input.scope) conditions.push(eq(retentionRuns.scope, input.scope));
        const cursor = decodeCursor(input.before);
        if (cursor)
            conditions.push(cursorCondition(retentionRuns.startedAt, retentionRuns.id, cursor));
        const rows = await this.db
            .select(retentionSelection)
            .from(retentionRuns)
            .where(and(...conditions))
            .orderBy(desc(retentionRuns.startedAt), desc(retentionRuns.id))
            .limit(input.limit + 1);
        return page(rows, input.limit, asRetention, (item) => item.startedAt);
    }

    async finishRetentionRun(input: {
        actorUserId: string;
        runId: string;
        status: "complete" | "failed";
        itemsExamined: number;
        itemsDeleted: number;
        details?: Record<string, unknown>;
        lastError?: string;
        context?: AuditContext;
    }): Promise<RetentionRun> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const before = await this.retentionRunDb(tx, input.runId);
            if (before.status !== "running")
                throw new OperationsError("conflict", "Retention run is already finished");
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed retention run requires lastError");
            await tx
                .update(retentionRuns)
                .set({
                    status: input.status,
                    itemsExamined: input.itemsExamined,
                    itemsDeleted: input.itemsDeleted,
                    detailsJson:
                        input.details === undefined
                            ? sql`${retentionRuns.detailsJson}`
                            : json(input.details),
                    lastError: input.lastError ?? null,
                    completedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(retentionRuns.id, input.runId));
            const after = await this.retentionRunDb(tx, input.runId);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: `retention.${input.status}`,
                targetType: "retention_run",
                targetId: input.runId,
                before,
                after,
                context: input.context,
            });
            return after;
        });
    }

    async listUserAccess(input: {
        actorUserId: string;
        before?: string;
        limit: number;
    }): Promise<Page<UserAccessTelemetry>> {
        await this.requireAdminDb(this.db, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const recentEvent = (column: AnySQLiteColumn) =>
            this.db
                .select({ value: column })
                .from(authSessionEvents)
                .innerJoin(authSessions, eq(authSessions.id, authSessionEvents.sessionId))
                .where(eq(authSessions.accountId, accounts.id))
                .orderBy(desc(authSessionEvents.createdAt), desc(authSessionEvents.id))
                .limit(1);
        const conditions: SQL[] = [];
        const accessAt = sql`coalesce(${users.lastAccessAt}, '')`;
        if (cursor)
            conditions.push(
                or(lt(accessAt, cursor.at), and(eq(accessAt, cursor.at), lt(users.id, cursor.id)))!,
            );
        const result = await this.db
            .select({
                id: users.id,
                username: users.username,
                email: accounts.email,
                role: users.role,
                last_access_at: users.lastAccessAt,
                banned_at: accounts.bannedAt,
                ban_expires_at: accounts.banExpiresAt,
                deleted_at: accounts.deletedAt,
                last_session_access_at: sql<string | null>`max(${authSessions.lastSeenAt})`,
                active_session_count: sql<number>`sum(case when ${authSessions.revokedAt} is null and ${authSessions.expiresAt} > CURRENT_TIMESTAMP then 1 else 0 end)`,
                last_client_ip: sql<string | null>`(${recentEvent(authSessionEvents.ip)})`,
                last_device: sql<string | null>`(${recentEvent(authSessionEvents.device)})`,
                last_app_version: sql<
                    string | null
                >`(${recentEvent(authSessionEvents.appVersion)})`,
                last_user_agent: sql<string | null>`(${recentEvent(authSessionEvents.userAgent)})`,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .leftJoin(authSessions, eq(authSessions.accountId, accounts.id))
            .where(and(...conditions))
            .groupBy(
                users.id,
                users.username,
                accounts.email,
                users.role,
                users.lastAccessAt,
                accounts.bannedAt,
                accounts.banExpiresAt,
                accounts.deletedAt,
            )
            .orderBy(desc(accessAt), desc(users.id))
            .limit(input.limit + 1);
        return page(
            result,
            input.limit,
            asAccess,
            (item) => item.lastAccessAt ?? "",
            (item) => item.userId,
        );
    }

    private async requireActiveUserDb(executor: DrizzleExecutor, userId: string) {
        const [row] = await executor
            .select({ id: users.id, role: users.role })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!row) throw new OperationsError("not_found", "User was not found");
        return row;
    }

    private async requireAdminDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const user = await this.requireActiveUserDb(executor, userId);
        if (user.role !== "admin")
            throw new OperationsError("forbidden", "Administrator access is required");
    }

    private async requireExistingUserDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const [row] = await executor
            .select({ id: users.id })
            .from(users)
            .where(and(eq(users.id, userId), isNull(users.deletedAt)));
        if (!row) throw new OperationsError("not_found", "User was not found");
    }

    private async accountTargetDb(
        executor: DrizzleExecutor,
        userId: string,
    ): Promise<AccountTarget> {
        const [row] = await executor
            .select({
                accountId: accounts.id,
                userId: users.id,
                username: users.username,
                bannedAt: accounts.bannedAt,
                banExpiresAt: accounts.banExpiresAt,
                banReason: accounts.banReason,
                bannedByUserId: accounts.bannedByUserId,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(and(eq(users.id, userId), isNull(users.deletedAt), isNull(accounts.deletedAt)));
        if (!row) throw new OperationsError("not_found", "User was not found");
        return {
            accountId: row.accountId,
            userId: row.userId,
            username: row.username,
            bannedAt: row.bannedAt ?? undefined,
            banExpiresAt: row.banExpiresAt ?? undefined,
            banReason: row.banReason ?? undefined,
            bannedByUserId: row.bannedByUserId ?? undefined,
        };
    }

    private async applyBanInTransaction(
        tx: DrizzleTransaction,
        actorUserId: string,
        targetUserId: string,
        reason?: string,
        expiresAt?: string,
    ): Promise<OperationsSyncHint> {
        if (actorUserId === targetUserId)
            throw new OperationsError("forbidden", "Administrators cannot ban themselves");
        const target = await this.accountTargetDb(tx, targetUserId);
        await this.closeElapsedBan(tx, target);
        if (
            target.bannedAt &&
            (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
        )
            throw new OperationsError("conflict", "User already has an active ban");
        await tx.insert(accountBans).values({
            id: createId(),
            accountId: target.accountId,
            bannedByUserId: actorUserId,
            reason,
            expiresAt,
        });
        await tx
            .update(accounts)
            .set({
                bannedAt: sql`CURRENT_TIMESTAMP`,
                banExpiresAt: expiresAt ?? null,
                banReason: reason ?? null,
                bannedByUserId: actorUserId,
            })
            .where(eq(accounts.id, target.accountId));
        await tx
            .update(authSessions)
            .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
            .where(
                and(eq(authSessions.accountId, target.accountId), isNull(authSessions.revokedAt)),
            );
        return this.syncUserMutation(tx, actorUserId, target.userId, "user.banned");
    }

    private async revokeBanInTransaction(
        tx: DrizzleTransaction,
        actorUserId: string,
        targetUserId: string,
        reason?: string,
    ): Promise<OperationsSyncHint> {
        const target = await this.accountTargetDb(tx, targetUserId);
        if (!target.bannedAt)
            throw new OperationsError("conflict", "User does not have an active ban");
        await tx
            .update(accountBans)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
                revokedByUserId: actorUserId,
                revokeReason: reason ?? null,
            })
            .where(and(eq(accountBans.accountId, target.accountId), isNull(accountBans.revokedAt)));
        await tx
            .update(accounts)
            .set({ bannedAt: null, banExpiresAt: null, banReason: null, bannedByUserId: null })
            .where(eq(accounts.id, target.accountId));
        return this.syncUserMutation(tx, actorUserId, target.userId, "user.unbanned");
    }

    private async createModerationNotification(
        tx: DrizzleTransaction,
        input: {
            actorUserId: string;
            targetUserId: string;
            chatId?: string;
            actionId: string;
            reportId?: string;
            action: "warn" | "restrict" | "restrict_revoked";
            reason?: string;
            expiresAt?: string;
        },
    ): Promise<OperationsSyncHint> {
        await this.requireExistingUserDb(tx, input.targetUserId);
        const sequence = await this.nextSequence(tx);
        const notificationId = createId();
        await tx.insert(notifications).values({
            id: notificationId,
            userId: input.targetUserId,
            kind: "moderation",
            chatId: input.chatId,
            actorUserId: input.actorUserId,
            payloadJson: JSON.stringify({
                actionId: input.actionId,
                reportId: input.reportId,
                action: input.action,
                reason: input.reason,
                expiresAt: input.expiresAt,
            }),
            syncSequence: sequence,
        });
        await this.insertSyncEvent(tx, {
            sequence,
            kind: "notification.created",
            entityId: notificationId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
        return { sequence: String(sequence), chats: [], areas: ["notifications"] };
    }

    private async removeMessageInTransaction(
        tx: DrizzleTransaction,
        actorUserId: string,
        messageId: string,
        reason?: string,
    ): Promise<{ chatId: string; sync: OperationsSyncHint }> {
        const [message] = await tx
            .select({
                chatId: messages.chatId,
                deletedAt: messages.deletedAt,
                threadRootMessageId: messages.threadRootMessageId,
            })
            .from(messages)
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!message) throw new OperationsError("not_found", "Message was not found");
        if (message.deletedAt !== null)
            throw new OperationsError("conflict", "Message is already removed");
        const chatId = message.chatId;
        const sequence = await this.nextSequence(tx);
        const pts = await this.advanceChatMutation(tx, {
            sequence,
            chatId,
            kind: "message.deleted",
            entityId: messageId,
            actorUserId,
        });
        await tx
            .update(messages)
            .set({
                text: "",
                contentJson: null,
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: actorUserId,
                deleteReason: reason ?? "moderation",
                changePts: pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)));
        await tx
            .delete(messageSearchDocuments)
            .where(eq(messageSearchDocuments.messageId, messageId));
        await tx.delete(messageRevisions).where(eq(messageRevisions.messageId, messageId));
        await tx.delete(notifications).where(eq(notifications.messageId, messageId));
        if (message.threadRootMessageId) {
            const threadRootMessageId = message.threadRootMessageId;
            await this.recomputeThreadProjection(tx, threadRootMessageId, pts);
            await tx
                .update(messages)
                .set({ changePts: pts })
                .where(eq(messages.id, threadRootMessageId));
        }
        return {
            chatId,
            sync: { sequence: String(sequence), chats: [{ chatId, pts: String(pts) }], areas: [] },
        };
    }

    private async removeFileInTransaction(
        tx: DrizzleTransaction,
        actorUserId: string,
        fileId: string,
        reason?: string,
    ): Promise<OperationsSyncHint> {
        const [file] = await tx
            .select({ deletedAt: files.deletedAt })
            .from(files)
            .where(eq(files.id, fileId))
            .limit(1);
        if (!file) throw new OperationsError("not_found", "File was not found");
        if (file.deletedAt !== null)
            throw new OperationsError("conflict", "File is already removed");
        const affectedChats = await tx
            .selectDistinct({ chatId: messages.chatId })
            .from(messageAttachments)
            .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
            .innerJoin(chats, eq(chats.id, messages.chatId))
            .where(
                and(
                    eq(messageAttachments.fileId, fileId),
                    isNull(messages.deletedAt),
                    isNull(chats.deletedAt),
                ),
            )
            .orderBy(messages.chatId);
        const sequence = await this.nextSequence(tx);
        const chatPoints: Array<{ chatId: string; pts: string }> = [];
        for (const row of affectedChats) {
            const chatId = row.chatId;
            const pts = await this.advanceChatMutation(tx, {
                sequence,
                chatId,
                kind: "file.removed",
                entityId: fileId,
                actorUserId,
            });
            chatPoints.push({ chatId, pts: String(pts) });
        }
        await tx
            .update(files)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: actorUserId,
                deleteReason: reason ?? "moderation",
                accessScope: "private",
                isPublic: 0,
                orphanedAt: sql`coalesce(${files.orphanedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(and(eq(files.id, fileId), isNull(files.deletedAt)));
        await tx.delete(fileAccessGrants).where(eq(fileAccessGrants.fileId, fileId));
        await this.insertSyncEvent(tx, {
            sequence,
            kind: "file.removed",
            entityId: fileId,
            actorUserId,
        });
        return { sequence: String(sequence), chats: chatPoints, areas: ["files"] };
    }

    private async deleteUserInTransaction(
        tx: DrizzleTransaction,
        actorUserId: string,
        targetUserId: string,
    ): Promise<OperationsSyncHint> {
        if (actorUserId === targetUserId)
            throw new OperationsError("forbidden", "Administrators cannot delete themselves");
        const [target] = await tx
            .select({ role: users.role, accountId: users.accountId })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, targetUserId),
                    isNull(users.deletedAt),
                    isNull(accounts.deletedAt),
                ),
            )
            .limit(1);
        if (!target) throw new OperationsError("not_found", "User was not found");
        if (target.role === "admin") {
            const [otherAdmin] = await tx
                .select({ id: users.id })
                .from(users)
                .innerJoin(accounts, eq(accounts.id, users.accountId))
                .where(
                    and(
                        sql`${users.id} != ${targetUserId}`,
                        eq(users.role, "admin"),
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                )
                .limit(1);
            if (!otherAdmin)
                throw new OperationsError(
                    "forbidden",
                    "The last active administrator cannot be deleted",
                );
        }

        const sequence = await this.nextSequence(tx);
        const memberships = await tx
            .select({ chatId: chatMembers.chatId, role: chatMembers.role, kind: chats.kind })
            .from(chatMembers)
            .innerJoin(chats, eq(chats.id, chatMembers.chatId))
            .where(
                and(
                    eq(chatMembers.userId, targetUserId),
                    isNull(chatMembers.leftAt),
                    isNull(chats.deletedAt),
                ),
            );
        const chatPoints: Array<{ chatId: string; pts: string }> = [];
        for (const membership of memberships) {
            const chatId = membership.chatId;
            let eventKind = "member.deleted";
            if (membership.kind !== "dm" && membership.role === "owner") {
                const [successor] = await tx
                    .select({ userId: chatMembers.userId })
                    .from(chatMembers)
                    .innerJoin(users, eq(users.id, chatMembers.userId))
                    .innerJoin(accounts, eq(accounts.id, users.accountId))
                    .where(
                        and(
                            eq(chatMembers.chatId, chatId),
                            sql`${chatMembers.userId} != ${targetUserId}`,
                            isNull(chatMembers.leftAt),
                            isNull(users.deletedAt),
                            eq(accounts.active, 1),
                            isNull(accounts.bannedAt),
                            isNull(accounts.deletedAt),
                        ),
                    )
                    .orderBy(
                        sql`case ${chatMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
                        asc(chatMembers.joinedAt),
                        asc(chatMembers.userId),
                    )
                    .limit(1);
                if (successor) {
                    const successorId = successor.userId;
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
                                eq(chatMembers.userId, successorId),
                            ),
                        );
                    await tx
                        .update(chats)
                        .set({ ownerUserId: successorId })
                        .where(eq(chats.id, chatId));
                    eventKind = "member.deletedAndOwnershipTransferred";
                } else eventKind = "chat.deleted";
            }
            const pts = await this.advanceChatMutation(tx, {
                sequence,
                chatId,
                kind: eventKind,
                entityId: targetUserId,
                actorUserId,
            });
            chatPoints.push({ chatId, pts: String(pts) });
            if (membership.kind !== "dm")
                await tx
                    .update(chatMembers)
                    .set({
                        leftAt: sql`CURRENT_TIMESTAMP`,
                        removedByUserId: actorUserId,
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(
                            eq(chatMembers.chatId, chatId),
                            eq(chatMembers.userId, targetUserId),
                            isNull(chatMembers.leftAt),
                        ),
                    );
            if (eventKind === "chat.deleted")
                await tx
                    .update(chats)
                    .set({
                        deletedAt: sql`CURRENT_TIMESTAMP`,
                        deletedByUserId: actorUserId,
                        deleteReason: "last member deleted",
                        ownerUserId: null,
                    })
                    .where(eq(chats.id, chatId));
        }
        const accountId = target.accountId;
        await tx
            .update(authSessions)
            .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)));
        await tx
            .update(accounts)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                active: 0,
                passwordHash: null,
                bannedAt: null,
                banExpiresAt: null,
                banReason: null,
                bannedByUserId: null,
                email: sql`'deleted+' || ${accounts.id} || '@invalid.local'`,
            })
            .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)));
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
            .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)));
        await this.insertSyncEvent(tx, {
            sequence,
            kind: "user.deleted",
            entityId: targetUserId,
            actorUserId,
        });
        return { sequence: String(sequence), chats: chatPoints, areas: ["users"] };
    }

    private async recomputeThreadProjection(
        tx: DrizzleTransaction,
        threadRootMessageId: string,
        pts: number,
    ): Promise<void> {
        await tx
            .delete(threadParticipants)
            .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
        const participantRows = await tx
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
        if (participantRows.length)
            await tx.insert(threadParticipants).values(
                participantRows.map((row) => ({
                    threadRootMessageId,
                    userId: row.userId!,
                    replyCount: row.replyCount,
                    firstParticipatedAt: row.firstParticipatedAt,
                    lastParticipatedAt: row.lastParticipatedAt,
                })),
            );
        const activeReplies = and(
            eq(messages.threadRootMessageId, threadRootMessageId),
            isNull(messages.deletedAt),
            or(
                isNull(messages.expiresAt),
                sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
            ),
        );
        const [lastReply] = await tx
            .select({ id: messages.id, sequence: messages.sequence })
            .from(messages)
            .where(activeReplies)
            .orderBy(desc(messages.sequence))
            .limit(1);
        const [replyCount] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(messages)
            .where(activeReplies);
        const [participantCount] = await tx
            .select({ count: sql<number>`count(*)` })
            .from(threadParticipants)
            .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
        await tx
            .update(threads)
            .set({
                replyCount: replyCount?.count ?? 0,
                participantCount: participantCount?.count ?? 0,
                lastReplyMessageId: lastReply?.id ?? null,
                lastReplySequence: lastReply?.sequence ?? 0,
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

    private async nextSequence(tx: DrizzleTransaction): Promise<number> {
        const [state] = await tx
            .update(serverSyncState)
            .set({
                sequence: sql`${serverSyncState.sequence} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(serverSyncState.id, 1))
            .returning({ sequence: serverSyncState.sequence });
        if (!state) throw new Error("Sync state has not been initialized");
        return state.sequence;
    }

    private async advanceChatMutation(
        tx: DrizzleTransaction,
        input: {
            sequence: number;
            chatId: string;
            kind: string;
            entityId?: string;
            actorUserId?: string;
        },
    ): Promise<number> {
        const [chat] = await tx
            .update(chats)
            .set({
                pts: sql`${chats.pts} + 1`,
                lastChangeSequence: input.sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
            .returning({ pts: chats.pts });
        if (!chat) throw new OperationsError("not_found", "Chat was not found");
        const pts = chat.pts;
        await tx.insert(chatUpdates).values({
            chatId: input.chatId,
            pts,
            ptsCount: 1,
            kind: input.kind,
            entityId: input.entityId,
        });
        await this.insertSyncEvent(tx, { ...input, chatPts: pts });
        return pts;
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

    private async syncUserMutation(
        tx: DrizzleTransaction,
        actorUserId: string | undefined,
        targetUserId: string,
        kind: string,
    ): Promise<OperationsSyncHint> {
        const sequence = await this.nextSequence(tx);
        await tx.update(users).set({ syncSequence: sequence }).where(eq(users.id, targetUserId));
        await tx
            .insert(syncEvents)
            .values({ sequence, kind, entityId: targetUserId, actorUserId, targetUserId });
        return { sequence: String(sequence), chats: [], areas: ["users"] };
    }

    private async closeElapsedBan(tx: DrizzleTransaction, target: AccountTarget): Promise<void> {
        if (
            !target.bannedAt ||
            !target.banExpiresAt ||
            Date.parse(target.banExpiresAt) > Date.now()
        )
            return;
        const now = new Date().toISOString();
        await tx
            .update(accountBans)
            .set({
                revokedAt: sql`coalesce(${accountBans.revokedAt}, ${now})`,
                revokeReason: sql`coalesce(${accountBans.revokeReason}, 'expired')`,
            })
            .where(
                and(
                    eq(accountBans.accountId, target.accountId),
                    isNull(accountBans.revokedAt),
                    lte(accountBans.expiresAt, now),
                ),
            );
        await tx
            .update(accounts)
            .set({ bannedAt: null, banExpiresAt: null, banReason: null, bannedByUserId: null })
            .where(
                and(
                    eq(accounts.id, target.accountId),
                    sql`${accounts.banExpiresAt} IS NOT NULL`,
                    lte(accounts.banExpiresAt, now),
                ),
            );
    }

    private async requireReportTargetAccess(
        tx: DrizzleTransaction,
        input: {
            actorUserId: string;
            targetUserId?: string;
            chatId?: string;
            messageId?: string;
            fileId?: string;
        },
    ): Promise<void> {
        if (input.targetUserId) await this.requireExistingUserDb(tx, input.targetUserId);
        if (input.chatId && !(await this.canAccessChat(tx, input.actorUserId, input.chatId)))
            throw new OperationsError("not_found", "Chat was not found");
        if (input.messageId) {
            const [message] = await tx
                .select({ chatId: messages.chatId })
                .from(messages)
                .where(eq(messages.id, input.messageId))
                .limit(1);
            if (!message || !(await this.canAccessChat(tx, input.actorUserId, message.chatId)))
                throw new OperationsError("not_found", "Message was not found");
            if (input.chatId && input.chatId !== message.chatId)
                throw new OperationsError("invalid", "messageId does not belong to chatId");
        }
        if (input.fileId) {
            const grants = tx
                .select({ found: sql`1` })
                .from(fileAccessGrants)
                .where(
                    and(
                        eq(fileAccessGrants.fileId, files.id),
                        or(
                            and(
                                eq(fileAccessGrants.principalType, "user"),
                                eq(fileAccessGrants.principalId, input.actorUserId),
                            ),
                            eq(fileAccessGrants.principalType, "server"),
                            and(
                                eq(fileAccessGrants.principalType, "chat"),
                                sql`exists (select 1 from chats c left join chat_members cm on cm.chat_id = c.id and cm.user_id = ${input.actorUserId} and cm.left_at is null where c.id = ${fileAccessGrants.principalId} and c.deleted_at is null and (c.visibility = 'public' or cm.user_id is not null))`,
                            ),
                        ),
                        or(
                            isNull(fileAccessGrants.expiresAt),
                            gt(fileAccessGrants.expiresAt, sql`CURRENT_TIMESTAMP`),
                        ),
                    ),
                );
            const attachments = tx
                .select({ found: sql`1` })
                .from(messageAttachments)
                .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
                .innerJoin(chats, eq(chats.id, messages.chatId))
                .leftJoin(
                    chatMembers,
                    and(
                        eq(chatMembers.chatId, chats.id),
                        eq(chatMembers.userId, input.actorUserId),
                        isNull(chatMembers.leftAt),
                    ),
                )
                .where(
                    and(
                        eq(messageAttachments.fileId, files.id),
                        isNull(messages.deletedAt),
                        isNull(chats.deletedAt),
                        or(eq(chats.visibility, "public"), sql`${chatMembers.userId} IS NOT NULL`),
                    ),
                );
            const [accessible] = await tx
                .select({ id: files.id })
                .from(files)
                .where(
                    and(
                        eq(files.id, input.fileId),
                        isNull(files.deletedAt),
                        or(
                            eq(files.isPublic, 1),
                            eq(files.uploadedByUserId, input.actorUserId),
                            sql`exists ${grants}`,
                            sql`exists ${attachments}`,
                        ),
                    ),
                )
                .limit(1);
            if (!accessible) throw new OperationsError("not_found", "File was not found");
        }
    }

    private async canAccessChat(
        executor: DrizzleExecutor,
        userId: string,
        chatId: string,
    ): Promise<boolean> {
        const [row] = await executor
            .select({ id: chats.id })
            .from(chats)
            .leftJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, chats.id),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(
                and(
                    eq(chats.id, chatId),
                    isNull(chats.deletedAt),
                    or(eq(chats.visibility, "public"), sql`${chatMembers.userId} IS NOT NULL`),
                ),
            )
            .limit(1);
        return Boolean(row);
    }

    private async banDb(executor: DrizzleExecutor, id: string): Promise<AccountBan> {
        const [row] = await executor
            .select(banSelection)
            .from(accountBans)
            .leftJoin(users, eq(users.accountId, accountBans.accountId))
            .where(eq(accountBans.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Ban was not found");
        return asBan(row);
    }

    private async reportDb(executor: DrizzleExecutor, id: string): Promise<ModerationReport> {
        const [row] = await executor
            .select(reportSelection)
            .from(moderationReports)
            .where(eq(moderationReports.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Moderation report was not found");
        return asReport(row);
    }

    private async moderationActionDb(
        executor: DrizzleExecutor,
        id: string,
    ): Promise<ModerationAction> {
        const [row] = await executor
            .select(moderationActionSelection)
            .from(moderationActions)
            .where(eq(moderationActions.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Moderation action was not found");
        return asModerationAction(row);
    }

    private async exportJobDb(executor: DrizzleExecutor, id: string): Promise<DataExportJob> {
        const [row] = await executor
            .select(exportSelection)
            .from(dataExportJobs)
            .where(eq(dataExportJobs.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Data export was not found");
        return asExport(row);
    }

    private async backupDb(executor: DrizzleExecutor, id: string): Promise<BackupRecord> {
        const [row] = await executor
            .select(backupSelection)
            .from(backupRecords)
            .where(eq(backupRecords.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Backup was not found");
        return asBackup(row);
    }

    private async retentionRunDb(executor: DrizzleExecutor, id: string): Promise<RetentionRun> {
        const [row] = await executor
            .select(retentionSelection)
            .from(retentionRuns)
            .where(eq(retentionRuns.id, id))
            .limit(1);
        if (!row) throw new OperationsError("not_found", "Retention run was not found");
        return asRetention(row);
    }

    private async appendAudit(
        tx: DrizzleTransaction,
        input: {
            actorUserId?: string;
            action: string;
            targetType: string;
            targetId?: string;
            chatId?: string;
            before?: unknown;
            after?: unknown;
            context?: AuditContext;
        },
    ): Promise<void> {
        const request = input.context?.request;
        const metadata = {
            ...input.context?.metadata,
            ...(request?.forwardedFor ? { forwardedFor: request.forwardedFor } : {}),
            ...(request?.location ? { location: request.location } : {}),
        };
        await tx.insert(auditLogEntries).values({
            id: createId(),
            actorUserId: input.actorUserId,
            action: input.action,
            targetType: input.targetType,
            targetId: input.targetId,
            chatId: input.chatId,
            beforeJson: json(input.before),
            afterJson: json(input.after),
            metadataJson: Object.keys(metadata).length ? JSON.stringify(metadata) : null,
            clientIp: request?.ip,
            device: request?.device,
            appVersion: request?.appVersion,
            userAgent: request?.userAgent,
        });
    }

    private writeDb<T>(operation: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
        return this.db.transaction(operation);
    }
}

interface Cursor {
    at: string;
    id: string;
}

function cursorCondition(
    timestampColumn: AnySQLiteColumn,
    idColumn: AnySQLiteColumn,
    cursor: Cursor,
): SQL {
    return or(
        lt(timestampColumn, cursor.at),
        and(eq(timestampColumn, cursor.at), lt(idColumn, cursor.id)),
    )!;
}

function decodeCursor(value: string | undefined): Cursor | undefined {
    if (!value) return undefined;
    if (value.length > 1_024) throw new OperationsError("invalid", "Cursor is invalid");
    try {
        const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<
            string,
            unknown
        >;
        if (
            typeof parsed.at !== "string" ||
            typeof parsed.id !== "string" ||
            parsed.at.length > 64 ||
            parsed.id.length > 128
        )
            throw new Error("bad cursor");
        return { at: parsed.at, id: parsed.id };
    } catch {
        throw new OperationsError("invalid", "Cursor is invalid");
    }
}

function encodeCursor(at: string, id: string): string {
    return Buffer.from(JSON.stringify({ at, id }), "utf8").toString("base64url");
}

function page<R extends Record<string, unknown>, T>(
    rows: R[],
    limit: number,
    map: (row: R) => T,
    timestamp: (item: T) => string = (item) => (item as { createdAt: string }).createdAt,
    id: (item: T) => string = (item) => (item as { id: string }).id,
): Page<T> {
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(map);
    const last = items.at(-1);
    return {
        items,
        nextCursor: hasMore && last ? encodeCursor(timestamp(last), id(last)) : undefined,
    };
}

function asAudit(row: Record<string, unknown>): AuditLogEntry {
    return {
        id: text(row.id),
        actorUserId: optionalText(row.actor_user_id),
        actorIntegrationId: optionalText(row.actor_integration_id),
        action: text(row.action),
        targetType: text(row.target_type),
        targetId: optionalText(row.target_id),
        chatId: optionalText(row.chat_id),
        before: parseJson(row.before_json),
        after: parseJson(row.after_json),
        metadata: parseJson(row.metadata_json),
        clientIp: optionalText(row.client_ip),
        device: optionalText(row.device),
        appVersion: optionalText(row.app_version),
        userAgent: optionalText(row.user_agent),
        createdAt: text(row.created_at),
    };
}

function asBan(row: Record<string, unknown>): AccountBan {
    const revokedAt = optionalText(row.revoked_at);
    const expiresAt = optionalText(row.expires_at);
    return {
        id: text(row.id),
        accountId: text(row.account_id),
        userId: optionalText(row.user_id),
        username: optionalText(row.username),
        bannedByUserId: optionalText(row.banned_by_user_id),
        reason: optionalText(row.reason),
        bannedAt: text(row.banned_at),
        expiresAt,
        revokedAt,
        revokedByUserId: optionalText(row.revoked_by_user_id),
        revokeReason: optionalText(row.revoke_reason),
        status: revokedAt
            ? "revoked"
            : expiresAt && Date.parse(expiresAt) <= Date.now()
              ? "expired"
              : "active",
    };
}

function asReport(row: Record<string, unknown>): ModerationReport {
    return {
        id: text(row.id),
        reportedByUserId: optionalText(row.reported_by_user_id),
        targetUserId: optionalText(row.target_user_id),
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        fileId: optionalText(row.file_id),
        reason: text(row.reason),
        details: optionalText(row.details),
        status: text(row.status) as ModerationReportStatus,
        assignedToUserId: optionalText(row.assigned_to_user_id),
        resolution: optionalText(row.resolution),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        resolvedAt: optionalText(row.resolved_at),
    };
}

function asModerationAction(row: Record<string, unknown>): ModerationAction {
    return {
        id: text(row.id),
        reportId: optionalText(row.report_id),
        actorUserId: optionalText(row.actor_user_id),
        targetUserId: optionalText(row.target_user_id),
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        fileId: optionalText(row.file_id),
        action: text(row.action) as ModerationActionKind,
        reason: optionalText(row.reason),
        metadata: parseJson(row.metadata_json),
        expiresAt: optionalText(row.expires_at),
        revokedAt: optionalText(row.revoked_at),
        createdAt: text(row.created_at),
    };
}

function asExport(row: Record<string, unknown>): DataExportJob {
    return {
        id: text(row.id),
        requestedByUserId: optionalText(row.requested_by_user_id),
        kind: text(row.kind) as DataExportKind,
        targetId: optionalText(row.target_id),
        status: text(row.status) as DataExportStatus,
        outputFileId: optionalText(row.output_file_id),
        options: parseJson(row.options_json),
        lastError: optionalText(row.last_error),
        expiresAt: optionalText(row.expires_at),
        createdAt: text(row.created_at),
        startedAt: optionalText(row.started_at),
        completedAt: optionalText(row.completed_at),
    };
}

function asBackup(row: Record<string, unknown>): BackupRecord {
    return {
        id: text(row.id),
        storageProvider: text(row.storage_provider),
        storageKey: text(row.storage_key),
        checksumSha256: optionalText(row.checksum_sha256),
        size: optionalNumber(row.size),
        status: text(row.status) as BackupStatus,
        createdByUserId: optionalText(row.created_by_user_id),
        metadata: parseJson(row.metadata_json),
        lastError: optionalText(row.last_error),
        createdAt: text(row.created_at),
        completedAt: optionalText(row.completed_at),
        retentionUntil: optionalText(row.retention_until),
    };
}

function asRetention(row: Record<string, unknown>): RetentionRun {
    return {
        id: text(row.id),
        scope: text(row.scope) as RetentionScope,
        status: text(row.status) as RetentionRun["status"],
        itemsExamined: number(row.items_examined),
        itemsDeleted: number(row.items_deleted),
        details: parseJson(row.details_json),
        lastError: optionalText(row.last_error),
        startedAt: text(row.started_at),
        completedAt: optionalText(row.completed_at),
    };
}

function asAccess(row: Record<string, unknown>): UserAccessTelemetry {
    return {
        userId: text(row.id),
        username: text(row.username),
        email: text(row.email),
        role: text(row.role) as "member" | "admin",
        lastAccessAt: optionalText(row.last_access_at),
        lastSessionAccessAt: optionalText(row.last_session_access_at),
        activeSessionCount: number(row.active_session_count, 0),
        bannedAt: optionalText(row.banned_at),
        banExpiresAt: optionalText(row.ban_expires_at),
        deletedAt: optionalText(row.deleted_at),
        lastClientIp: optionalText(row.last_client_ip),
        lastDevice: optionalText(row.last_device),
        lastAppVersion: optionalText(row.last_app_version),
        lastUserAgent: optionalText(row.last_user_agent),
    };
}

function accountTargetState(target: AccountTarget): Record<string, unknown> {
    return {
        banned: Boolean(target.bannedAt),
        bannedAt: target.bannedAt,
        expiresAt: target.banExpiresAt,
        reason: target.banReason,
        bannedByUserId: target.bannedByUserId,
    };
}

function mergeContext(
    context: AuditContext | undefined,
    metadata: Record<string, unknown> | undefined,
): AuditContext {
    return { request: context?.request, metadata: { ...context?.metadata, ...metadata } };
}

function futureTimestamp(value: string | undefined, name: string): string | undefined {
    if (value === undefined) return undefined;
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= Date.now())
        throw new OperationsError("invalid", `${name} must be a future ISO timestamp`);
    return new Date(timestamp).toISOString();
}

function assertExportTransition(
    from: DataExportStatus,
    to: Exclude<DataExportStatus, "pending">,
): void {
    const allowed: Record<DataExportStatus, readonly DataExportStatus[]> = {
        pending: ["running", "failed", "cancelled"],
        running: ["complete", "failed", "cancelled"],
        complete: ["expired"],
        failed: [],
        cancelled: [],
        expired: [],
    };
    if (!allowed[from].includes(to))
        throw new OperationsError("conflict", `Cannot move a data export from ${from} to ${to}`);
}

function assertBackupTransition(from: BackupStatus, to: Exclude<BackupStatus, "pending">): void {
    const allowed: Record<BackupStatus, readonly BackupStatus[]> = {
        pending: ["running", "failed", "deleted"],
        running: ["complete", "failed", "deleted"],
        complete: ["deleted"],
        failed: ["deleted"],
        deleted: [],
    };
    if (!allowed[from].includes(to))
        throw new OperationsError("conflict", `Cannot move a backup from ${from} to ${to}`);
}

function json(value: unknown): string | null {
    return value === undefined ? null : JSON.stringify(value);
}

function parseJson(value: unknown): unknown {
    const raw = optionalText(value);
    if (raw === undefined) return undefined;
    try {
        return JSON.parse(raw) as unknown;
    } catch {
        return undefined;
    }
}

function objectValue(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value)
        ? (value as Record<string, unknown>)
        : {};
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
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

function optionalNumber(value: unknown): number | undefined {
    return value === null || value === undefined ? undefined : number(value);
}

function isUniqueConstraint(error: unknown): boolean {
    let current: unknown = error;
    for (let depth = 0; current && depth < 5; depth += 1) {
        const value = current as { code?: unknown; message?: unknown; cause?: unknown };
        const details = `${String(value.code ?? "")} ${String(value.message ?? "")}`.toLowerCase();
        if (details.includes("unique") || details.includes("constraint")) return true;
        current = value.cause;
    }
    return false;
}
