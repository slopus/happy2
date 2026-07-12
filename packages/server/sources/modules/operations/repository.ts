import {
    createClient,
    type Client,
    type InArgs,
    type InValue,
    type Row,
    type Transaction,
} from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import type { RequestMetadata } from "../database.js";
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

type Executor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

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

const AUDIT_SELECT = `
    SELECT id, actor_user_id, actor_integration_id, action, target_type, target_id,
           chat_id, before_json, after_json, metadata_json, client_ip, device,
           app_version, user_agent, created_at
      FROM audit_log_entries
`;

const BAN_SELECT = `
    SELECT b.id, b.account_id, u.id AS user_id, u.username,
           b.banned_by_user_id, b.reason, b.banned_at, b.expires_at,
           b.revoked_at, b.revoked_by_user_id, b.revoke_reason
      FROM account_bans b
      LEFT JOIN users u ON u.account_id = b.account_id
`;

const REPORT_SELECT = `
    SELECT id, reported_by_user_id, target_user_id, chat_id, message_id, file_id,
           reason, details, status, assigned_to_user_id, resolution,
           created_at, updated_at, resolved_at
      FROM moderation_reports
`;

const MODERATION_ACTION_SELECT = `
    SELECT id, report_id, actor_user_id, target_user_id, chat_id, message_id,
           file_id, action, reason, metadata_json, expires_at, revoked_at, created_at
      FROM moderation_actions
`;

const EXPORT_SELECT = `
    SELECT id, requested_by_user_id, kind, target_id, status, output_file_id,
           options_json, last_error, expires_at, created_at, started_at, completed_at
      FROM data_export_jobs
`;

const BACKUP_SELECT = `
    SELECT id, storage_provider, storage_key, checksum_sha256, size, status,
           created_by_user_id, metadata_json, last_error, created_at,
           completed_at, retention_until
      FROM backup_records
`;

const RETENTION_SELECT = `
    SELECT id, scope, status, items_examined, items_deleted, details_json,
           last_error, started_at, completed_at
      FROM retention_runs
`;

/** Durable administrative and operational state. All authorization is rechecked in SQLite. */
export class OperationsRepository {
    private readonly client: Client;
    private readonly ownsClient: boolean;

    constructor(source: string | Client, authToken?: string) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string" ? createClient({ url: source, authToken }) : source;
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
        await this.requireAdmin(this.client, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.action) addFilter(clauses, args, "action = ?", input.action);
        if (input.targetType) addFilter(clauses, args, "target_type = ?", input.targetType);
        if (input.targetId) addFilter(clauses, args, "target_id = ?", input.targetId);
        if (input.auditedActorUserId)
            addFilter(clauses, args, "actor_user_id = ?", input.auditedActorUserId);
        addCursor(clauses, args, cursor);
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${AUDIT_SELECT}${where(clauses)}
                  ORDER BY created_at DESC, id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asAudit);
    }

    async applyBan(input: {
        actorUserId: string;
        targetUserId: string;
        reason?: string;
        expiresAt?: string;
        context?: AuditContext;
    }): Promise<AccountBan> {
        const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.actorUserId === input.targetUserId)
                throw new OperationsError("forbidden", "Administrators cannot ban themselves");
            const target = await this.accountTarget(tx, input.targetUserId);
            await this.closeElapsedBan(tx, target);
            if (
                target.bannedAt &&
                (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
            )
                throw new OperationsError("conflict", "User already has an active ban");
            const id = createId();
            await tx.execute({
                sql: `INSERT INTO account_bans
                        (id, account_id, banned_by_user_id, reason, expires_at)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [
                    id,
                    target.accountId,
                    input.actorUserId,
                    input.reason ?? null,
                    expiresAt ?? null,
                ],
            });
            await tx.execute({
                sql: `UPDATE accounts
                         SET banned_at = CURRENT_TIMESTAMP, ban_expires_at = ?, ban_reason = ?,
                             banned_by_user_id = ?
                       WHERE id = ?`,
                args: [
                    expiresAt ?? null,
                    input.reason ?? null,
                    input.actorUserId,
                    target.accountId,
                ],
            });
            const sessions = await tx.execute({
                sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                       WHERE account_id = ? AND revoked_at IS NULL`,
                args: [target.accountId],
            });
            await this.syncUserMutation(tx, input.actorUserId, target.userId, "user.banned");
            const ban = await requiredRow(tx, `${BAN_SELECT} WHERE b.id = ?`, [id], asBan);
            await this.appendAudit(tx, {
                actorUserId: input.actorUserId,
                action: "user.ban_applied",
                targetType: "user",
                targetId: target.userId,
                before: accountTargetState(target),
                after: ban,
                context: mergeContext(input.context, {
                    revokedSessionCount: sessions.rowsAffected,
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const target = await this.accountTarget(tx, input.targetUserId);
            const current = await one(
                tx,
                `${BAN_SELECT}
                 WHERE b.account_id = ? AND b.revoked_at IS NULL
                 ORDER BY b.banned_at DESC, b.id DESC LIMIT 1`,
                [target.accountId],
            );
            if (!current || !target.bannedAt)
                throw new OperationsError("conflict", "User does not have an active ban");
            await tx.execute({
                sql: `UPDATE account_bans
                         SET revoked_at = CURRENT_TIMESTAMP, revoked_by_user_id = ?, revoke_reason = ?
                       WHERE account_id = ? AND revoked_at IS NULL`,
                args: [input.actorUserId, input.reason ?? null, target.accountId],
            });
            await tx.execute({
                sql: `UPDATE accounts
                         SET banned_at = NULL, ban_expires_at = NULL, ban_reason = NULL,
                             banned_by_user_id = NULL
                       WHERE id = ?`,
                args: [target.accountId],
            });
            await this.syncUserMutation(tx, input.actorUserId, target.userId, "user.unbanned");
            const ban = await requiredRow(
                tx,
                `${BAN_SELECT} WHERE b.id = ?`,
                [text(current.id)],
                asBan,
            );
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
        return this.write(async (tx) => {
            if (input?.actorUserId) await this.requireAdmin(tx, input.actorUserId);
            const now = new Date().toISOString();
            const due = await tx.execute({
                sql: `SELECT a.id AS account_id, u.id AS user_id, a.banned_at,
                             a.ban_expires_at, a.ban_reason, a.banned_by_user_id
                        FROM accounts a
                        LEFT JOIN users u ON u.account_id = a.id
                       WHERE a.banned_at IS NOT NULL AND a.ban_expires_at IS NOT NULL
                         AND a.ban_expires_at <= ?`,
                args: [now],
            });
            for (const row of due.rows) {
                const accountId = text(row.account_id);
                await tx.execute({
                    sql: `UPDATE account_bans
                             SET revoked_at = COALESCE(revoked_at, ?),
                                 revoke_reason = COALESCE(revoke_reason, 'expired')
                           WHERE account_id = ? AND revoked_at IS NULL AND expires_at <= ?`,
                    args: [now, accountId, now],
                });
                const updated = await tx.execute({
                    sql: `UPDATE accounts
                             SET banned_at = NULL, ban_expires_at = NULL, ban_reason = NULL,
                                 banned_by_user_id = NULL
                           WHERE id = ? AND banned_at IS NOT NULL
                             AND ban_expires_at IS NOT NULL AND ban_expires_at <= ?`,
                    args: [accountId, now],
                });
                if (!updated.rowsAffected) continue;
                if (row.user_id)
                    await this.syncUserMutation(
                        tx,
                        input?.actorUserId,
                        text(row.user_id),
                        "user.unbanned",
                    );
                await this.appendAudit(tx, {
                    actorUserId: input?.actorUserId,
                    action: "user.ban_expired",
                    targetType: "user",
                    targetId: optionalText(row.user_id),
                    before: {
                        bannedAt: optionalText(row.banned_at),
                        expiresAt: optionalText(row.ban_expires_at),
                        reason: optionalText(row.ban_reason),
                        bannedByUserId: optionalText(row.banned_by_user_id),
                    },
                    after: { banned: false },
                    context: input?.context,
                });
            }
            return due.rows.length;
        });
    }

    async listBans(input: {
        actorUserId: string;
        targetUserId?: string;
        status?: "active" | "expired" | "revoked";
        before?: string;
        limit: number;
    }): Promise<Page<AccountBan>> {
        await this.requireAdmin(this.client, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.targetUserId) addFilter(clauses, args, "u.id = ?", input.targetUserId);
        const now = new Date().toISOString();
        if (input.status === "active") {
            clauses.push("b.revoked_at IS NULL AND (b.expires_at IS NULL OR b.expires_at > ?)");
            args.push(now);
        } else if (input.status === "expired") {
            clauses.push("b.revoked_at IS NULL AND b.expires_at IS NOT NULL AND b.expires_at <= ?");
            args.push(now);
        } else if (input.status === "revoked") {
            clauses.push("b.revoked_at IS NOT NULL");
        }
        addCursor(clauses, args, cursor, "b.banned_at", "b.id");
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${BAN_SELECT}${where(clauses)} ORDER BY b.banned_at DESC, b.id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asBan, (item) => item.bannedAt);
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
        return this.write(async (tx) => {
            await this.requireActiveUser(tx, input.actorUserId);
            await this.requireReportTargetAccess(tx, input);
            const id = createId();
            await tx.execute({
                sql: `INSERT INTO moderation_reports
                        (id, reported_by_user_id, target_user_id, chat_id, message_id,
                         file_id, reason, details)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.actorUserId,
                    input.targetUserId ?? null,
                    input.chatId ?? null,
                    input.messageId ?? null,
                    input.fileId ?? null,
                    input.reason,
                    input.details ?? null,
                ],
            });
            const report = await requiredRow(tx, `${REPORT_SELECT} WHERE id = ?`, [id], asReport);
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
        await this.requireAdmin(this.client, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.status) addFilter(clauses, args, "status = ?", input.status);
        if (input.assignedToUserId)
            addFilter(clauses, args, "assigned_to_user_id = ?", input.assignedToUserId);
        addCursor(clauses, args, cursor);
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${REPORT_SELECT}${where(clauses)} ORDER BY created_at DESC, id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asReport);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const before = await this.report(tx, input.reportId);
            if (input.assignedToUserId) await this.requireAdmin(tx, input.assignedToUserId);
            const status = input.status ?? before.status;
            const assigned =
                input.assignedToUserId === undefined
                    ? before.assignedToUserId
                    : input.assignedToUserId;
            const resolution =
                input.resolution === undefined ? before.resolution : input.resolution;
            await tx.execute({
                sql: `UPDATE moderation_reports
                         SET status = ?, assigned_to_user_id = ?, resolution = ?,
                             resolved_at = CASE WHEN ? IN ('resolved', 'dismissed')
                                                THEN COALESCE(resolved_at, CURRENT_TIMESTAMP)
                                                ELSE NULL END,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [status, assigned ?? null, resolution ?? null, status, input.reportId],
            });
            const after = await this.report(tx, input.reportId);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.automationRunId) {
                const existing = await one(
                    tx,
                    `${MODERATION_ACTION_SELECT} WHERE automation_run_id = ?`,
                    [input.automationRunId],
                );
                if (existing) {
                    const action = asModerationAction(existing);
                    if (action.reportId !== input.reportId)
                        throw new OperationsError(
                            "conflict",
                            "Automation run is already bound to another moderation report",
                        );
                    return {
                        report: await this.report(tx, input.reportId),
                        action,
                    };
                }
            }
            const before = await this.report(tx, input.reportId);
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

            await tx.execute({
                sql: `INSERT INTO moderation_actions
                        (id, report_id, actor_user_id, target_user_id, chat_id, message_id,
                         file_id, action, reason, metadata_json, automation_run_id, expires_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    actionId,
                    input.reportId,
                    input.actorUserId,
                    before.targetUserId ?? null,
                    actionChatId ?? null,
                    before.messageId ?? null,
                    before.fileId ?? null,
                    input.action,
                    input.reason ?? null,
                    json(input.metadata),
                    input.automationRunId ?? null,
                    expiresAt ?? null,
                ],
            });
            await tx.execute({
                sql: `UPDATE moderation_reports
                         SET status = 'resolved', assigned_to_user_id = ?,
                             resolution = ?, resolved_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [input.actorUserId, input.reason ?? input.action, input.reportId],
            });
            const report = await this.report(tx, input.reportId);
            const action = await requiredRow(
                tx,
                `${MODERATION_ACTION_SELECT} WHERE id = ?`,
                [actionId],
                asModerationAction,
            );
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const before = await requiredRow(
                tx,
                `${MODERATION_ACTION_SELECT} WHERE id = ?`,
                [input.actionId],
                asModerationAction,
                "Moderation action was not found",
            );
            if (before.revokedAt)
                throw new OperationsError("conflict", "Moderation action is already revoked");
            if (before.action !== "restrict")
                throw new OperationsError("conflict", "Only restrictions can be revoked");
            if (!before.targetUserId) throw new Error("Restriction is missing its target user");
            await tx.execute({
                sql: `UPDATE moderation_actions SET revoked_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND revoked_at IS NULL`,
                args: [input.actionId],
            });
            const sync = await this.createModerationNotification(tx, {
                actorUserId: input.actorUserId,
                targetUserId: before.targetUserId,
                chatId: before.chatId,
                actionId: input.actionId,
                reportId: before.reportId,
                action: "restrict_revoked",
                reason: input.reason,
            });
            const action = await requiredRow(
                tx,
                `${MODERATION_ACTION_SELECT} WHERE id = ?`,
                [input.actionId],
                asModerationAction,
            );
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
        return this.write(async (tx) => {
            const actor = await this.requireActiveUser(tx, input.actorUserId);
            let targetId = input.targetId;
            if (input.kind === "user_data") {
                targetId ??= input.actorUserId;
                if (targetId !== input.actorUserId && actor.role !== "admin")
                    throw new OperationsError(
                        "forbidden",
                        "Only administrators can export another user",
                    );
                await this.requireExistingUser(tx, targetId);
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
            await tx.execute({
                sql: `INSERT INTO data_export_jobs
                        (id, requested_by_user_id, kind, target_id, options_json, expires_at)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.actorUserId,
                    input.kind,
                    targetId ?? null,
                    json(input.options),
                    expiresAt ?? null,
                ],
            });
            const job = await this.exportJob(tx, id);
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
        const actor = await this.requireActiveUser(this.client, actorUserId);
        const job = await this.exportJob(this.client, jobId);
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
        const actor = await this.requireActiveUser(this.client, input.actorUserId);
        if (!input.ownOnly && actor.role !== "admin")
            throw new OperationsError("forbidden", "Administrator access is required");
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.ownOnly) addFilter(clauses, args, "requested_by_user_id = ?", input.actorUserId);
        else if (input.requestedByUserId)
            addFilter(clauses, args, "requested_by_user_id = ?", input.requestedByUserId);
        if (input.status) addFilter(clauses, args, "status = ?", input.status);
        addCursor(clauses, args, decodeCursor(input.before));
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${EXPORT_SELECT}${where(clauses)} ORDER BY created_at DESC, id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asExport);
    }

    async cancelDataExport(input: {
        actorUserId: string;
        jobId: string;
        context?: AuditContext;
    }): Promise<DataExportJob> {
        return this.write(async (tx) => {
            const actor = await this.requireActiveUser(tx, input.actorUserId);
            const before = await this.exportJob(tx, input.jobId);
            if (actor.role !== "admin" && before.requestedByUserId !== input.actorUserId)
                throw new OperationsError("not_found", "Data export was not found");
            if (before.status !== "pending" && before.status !== "running")
                throw new OperationsError("conflict", "Data export can no longer be cancelled");
            await tx.execute({
                sql: `UPDATE data_export_jobs
                         SET status = 'cancelled', completed_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [input.jobId],
            });
            const after = await this.exportJob(tx, input.jobId);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const before = await this.exportJob(tx, input.jobId);
            assertExportTransition(before.status, input.status);
            if (input.status === "complete") {
                if (!input.outputFileId)
                    throw new OperationsError(
                        "invalid",
                        "A completed export requires outputFileId",
                    );
                const file = await one(
                    tx,
                    `SELECT id FROM files
                      WHERE id = ? AND deleted_at IS NULL AND upload_status = 'complete'`,
                    [input.outputFileId],
                );
                if (!file) throw new OperationsError("not_found", "Output file was not found");
                if (!before.requestedByUserId)
                    throw new OperationsError(
                        "conflict",
                        "Export requester no longer exists; the artifact cannot be granted safely",
                    );
                await tx.execute({
                    sql: `INSERT INTO file_access_grants
                            (id, file_id, principal_type, principal_id, granted_by_user_id,
                             expires_at)
                          VALUES (?, ?, 'user', ?, ?, ?)
                          ON CONFLICT(file_id, principal_type, principal_id)
                            WHERE source_message_id IS NULL
                          DO UPDATE SET
                            expires_at = CASE
                              WHEN file_access_grants.expires_at IS NULL OR excluded.expires_at IS NULL
                                THEN NULL
                              WHEN file_access_grants.expires_at > excluded.expires_at
                                THEN file_access_grants.expires_at
                              ELSE excluded.expires_at
                            END`,
                    args: [
                        createId(),
                        input.outputFileId,
                        before.requestedByUserId,
                        input.actorUserId,
                        expiresAt ?? before.expiresAt ?? null,
                    ],
                });
            }
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed export requires lastError");
            await tx.execute({
                sql: `UPDATE data_export_jobs
                         SET status = ?, output_file_id = COALESCE(?, output_file_id),
                             last_error = ?, expires_at = COALESCE(?, expires_at),
                             started_at = CASE WHEN ? = 'running' THEN COALESCE(started_at, CURRENT_TIMESTAMP)
                                               ELSE started_at END,
                             completed_at = CASE WHEN ? IN ('complete', 'failed', 'cancelled', 'expired')
                                                 THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                                                 ELSE completed_at END
                       WHERE id = ?`,
                args: [
                    input.status,
                    input.outputFileId ?? null,
                    input.lastError ?? null,
                    expiresAt ?? null,
                    input.status,
                    input.status,
                    input.jobId,
                ],
            });
            const after = await this.exportJob(tx, input.jobId);
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

    async createBackup(input: {
        actorUserId: string;
        storageProvider: string;
        storageKey: string;
        retentionUntil?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    }): Promise<BackupRecord> {
        const retentionUntil = futureTimestamp(input.retentionUntil, "retentionUntil");
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const id = createId();
            try {
                await tx.execute({
                    sql: `INSERT INTO backup_records
                            (id, storage_provider, storage_key, created_by_user_id,
                             metadata_json, retention_until)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        input.storageProvider,
                        input.storageKey,
                        input.actorUserId,
                        json(input.metadata),
                        retentionUntil ?? null,
                    ],
                });
            } catch (error) {
                if (isUniqueConstraint(error))
                    throw new OperationsError("conflict", "Backup storage key is already recorded");
                throw error;
            }
            const backup = await this.backup(tx, id);
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
        await this.requireAdmin(this.client, input.actorUserId);
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.status) addFilter(clauses, args, "status = ?", input.status);
        addCursor(clauses, args, decodeCursor(input.before));
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${BACKUP_SELECT}${where(clauses)} ORDER BY created_at DESC, id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asBackup);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const before = await this.backup(tx, input.backupId);
            assertBackupTransition(before.status, input.status);
            if (input.status === "complete" && (!input.checksumSha256 || input.size === undefined))
                throw new OperationsError(
                    "invalid",
                    "A completed backup requires checksumSha256 and size",
                );
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed backup requires lastError");
            await tx.execute({
                sql: `UPDATE backup_records
                         SET status = ?, checksum_sha256 = COALESCE(?, checksum_sha256),
                             size = COALESCE(?, size), last_error = ?,
                             retention_until = COALESCE(?, retention_until),
                             metadata_json = COALESCE(?, metadata_json),
                             completed_at = CASE WHEN ? IN ('complete', 'failed', 'deleted')
                                                 THEN COALESCE(completed_at, CURRENT_TIMESTAMP)
                                                 ELSE completed_at END
                       WHERE id = ?`,
                args: [
                    input.status,
                    input.checksumSha256 ?? null,
                    input.size ?? null,
                    input.lastError ?? null,
                    retentionUntil ?? null,
                    json(input.metadata),
                    input.status,
                    input.backupId,
                ],
            });
            const after = await this.backup(tx, input.backupId);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const active = await one(
                tx,
                `SELECT id FROM retention_runs WHERE scope = ? AND status = 'running'`,
                [input.scope],
            );
            if (active)
                throw new OperationsError(
                    "conflict",
                    "A retention run is already active for this scope",
                );
            const id = createId();
            await tx.execute({
                sql: `INSERT INTO retention_runs (id, scope, details_json) VALUES (?, ?, ?)`,
                args: [id, input.scope, json(input.details)],
            });
            const run = await this.retentionRun(tx, id);
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
        await this.requireAdmin(this.client, input.actorUserId);
        const clauses: string[] = [];
        const args: InValue[] = [];
        if (input.scope) addFilter(clauses, args, "scope = ?", input.scope);
        addCursor(clauses, args, decodeCursor(input.before), "started_at", "id");
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `${RETENTION_SELECT}${where(clauses)} ORDER BY started_at DESC, id DESC LIMIT ?`,
            args,
        });
        return page(result.rows, input.limit, asRetention, (item) => item.startedAt);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const before = await this.retentionRun(tx, input.runId);
            if (before.status !== "running")
                throw new OperationsError("conflict", "Retention run is already finished");
            if (input.status === "failed" && !input.lastError)
                throw new OperationsError("invalid", "A failed retention run requires lastError");
            await tx.execute({
                sql: `UPDATE retention_runs
                         SET status = ?, items_examined = ?, items_deleted = ?,
                             details_json = COALESCE(?, details_json), last_error = ?,
                             completed_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [
                    input.status,
                    input.itemsExamined,
                    input.itemsDeleted,
                    json(input.details),
                    input.lastError ?? null,
                    input.runId,
                ],
            });
            const after = await this.retentionRun(tx, input.runId);
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
        await this.requireAdmin(this.client, input.actorUserId);
        const cursor = decodeCursor(input.before);
        const clauses = ["1 = 1"];
        const args: InValue[] = [];
        addCursor(clauses, args, cursor, "COALESCE(u.last_access_at, '')", "u.id");
        args.push(input.limit + 1);
        const result = await this.client.execute({
            sql: `SELECT u.id, u.username, a.email, u.role, u.last_access_at,
                         a.banned_at, a.ban_expires_at, a.deleted_at,
                         MAX(s.last_seen_at) AS last_session_access_at,
                         SUM(CASE WHEN s.revoked_at IS NULL AND s.expires_at > CURRENT_TIMESTAMP
                                  THEN 1 ELSE 0 END) AS active_session_count,
                         (SELECT e.ip FROM auth_session_events e
                           JOIN auth_sessions recent ON recent.id = e.session_id
                          WHERE recent.account_id = a.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_client_ip,
                         (SELECT e.device FROM auth_session_events e
                           JOIN auth_sessions recent ON recent.id = e.session_id
                          WHERE recent.account_id = a.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_device,
                         (SELECT e.app_version FROM auth_session_events e
                           JOIN auth_sessions recent ON recent.id = e.session_id
                          WHERE recent.account_id = a.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_app_version,
                         (SELECT e.user_agent FROM auth_session_events e
                           JOIN auth_sessions recent ON recent.id = e.session_id
                          WHERE recent.account_id = a.id ORDER BY e.created_at DESC, e.id DESC LIMIT 1) AS last_user_agent
                    FROM users u JOIN accounts a ON a.id = u.account_id
                    LEFT JOIN auth_sessions s ON s.account_id = a.id
                   ${where(clauses)}
                   GROUP BY u.id, u.username, a.email, u.role, u.last_access_at,
                            a.banned_at, a.ban_expires_at, a.deleted_at
                   ORDER BY COALESCE(u.last_access_at, '') DESC, u.id DESC LIMIT ?`,
            args,
        });
        return page(
            result.rows,
            input.limit,
            asAccess,
            (item) => item.lastAccessAt ?? "",
            (item) => item.userId,
        );
    }

    private async requireActiveUser(
        executor: Executor,
        userId: string,
    ): Promise<{ role: "member" | "admin" }> {
        const row = await one(
            executor,
            `SELECT u.role FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.deleted_at IS NULL AND a.active = 1
                AND a.deleted_at IS NULL AND a.banned_at IS NULL`,
            [userId],
        );
        if (!row) throw new OperationsError("forbidden", "An active user is required");
        return { role: text(row.role) as "member" | "admin" };
    }

    private async requireAdmin(executor: Executor, userId: string): Promise<void> {
        const actor = await this.requireActiveUser(executor, userId);
        if (actor.role !== "admin")
            throw new OperationsError("forbidden", "Administrator access is required");
    }

    private async requireExistingUser(executor: Executor, userId: string): Promise<void> {
        if (!(await one(executor, `SELECT id FROM users WHERE id = ?`, [userId])))
            throw new OperationsError("not_found", "User was not found");
    }

    private async accountTarget(executor: Executor, userId: string): Promise<AccountTarget> {
        const row = await one(
            executor,
            `SELECT a.id AS account_id, u.id AS user_id, u.username, a.banned_at,
                    a.ban_expires_at, a.ban_reason, a.banned_by_user_id
               FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.deleted_at IS NULL AND a.deleted_at IS NULL`,
            [userId],
        );
        if (!row) throw new OperationsError("not_found", "User was not found");
        return {
            accountId: text(row.account_id),
            userId: text(row.user_id),
            username: text(row.username),
            bannedAt: optionalText(row.banned_at),
            banExpiresAt: optionalText(row.ban_expires_at),
            banReason: optionalText(row.ban_reason),
            bannedByUserId: optionalText(row.banned_by_user_id),
        };
    }

    private async applyBanInTransaction(
        tx: Transaction,
        actorUserId: string,
        targetUserId: string,
        reason?: string,
        expiresAt?: string,
    ): Promise<OperationsSyncHint> {
        if (actorUserId === targetUserId)
            throw new OperationsError("forbidden", "Administrators cannot ban themselves");
        const target = await this.accountTarget(tx, targetUserId);
        await this.closeElapsedBan(tx, target);
        if (
            target.bannedAt &&
            (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
        )
            throw new OperationsError("conflict", "User already has an active ban");
        await tx.execute({
            sql: `INSERT INTO account_bans
                    (id, account_id, banned_by_user_id, reason, expires_at)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [createId(), target.accountId, actorUserId, reason ?? null, expiresAt ?? null],
        });
        await tx.execute({
            sql: `UPDATE accounts SET banned_at = CURRENT_TIMESTAMP, ban_expires_at = ?,
                         ban_reason = ?, banned_by_user_id = ? WHERE id = ?`,
            args: [expiresAt ?? null, reason ?? null, actorUserId, target.accountId],
        });
        await tx.execute({
            sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                   WHERE account_id = ? AND revoked_at IS NULL`,
            args: [target.accountId],
        });
        return this.syncUserMutation(tx, actorUserId, target.userId, "user.banned");
    }

    private async revokeBanInTransaction(
        tx: Transaction,
        actorUserId: string,
        targetUserId: string,
        reason?: string,
    ): Promise<OperationsSyncHint> {
        const target = await this.accountTarget(tx, targetUserId);
        if (!target.bannedAt)
            throw new OperationsError("conflict", "User does not have an active ban");
        await tx.execute({
            sql: `UPDATE account_bans SET revoked_at = CURRENT_TIMESTAMP,
                         revoked_by_user_id = ?, revoke_reason = ?
                   WHERE account_id = ? AND revoked_at IS NULL`,
            args: [actorUserId, reason ?? null, target.accountId],
        });
        await tx.execute({
            sql: `UPDATE accounts SET banned_at = NULL, ban_expires_at = NULL,
                         ban_reason = NULL, banned_by_user_id = NULL WHERE id = ?`,
            args: [target.accountId],
        });
        return this.syncUserMutation(tx, actorUserId, target.userId, "user.unbanned");
    }

    private async createModerationNotification(
        tx: Transaction,
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
        await this.requireExistingUser(tx, input.targetUserId);
        const sequence = await this.nextSequence(tx);
        const notificationId = createId();
        await tx.execute({
            sql: `INSERT INTO notifications
                    (id, user_id, kind, chat_id, actor_user_id, payload_json, sync_sequence)
                  VALUES (?, ?, 'moderation', ?, ?, ?, ?)`,
            args: [
                notificationId,
                input.targetUserId,
                input.chatId ?? null,
                input.actorUserId,
                JSON.stringify({
                    actionId: input.actionId,
                    reportId: input.reportId,
                    action: input.action,
                    reason: input.reason,
                    expiresAt: input.expiresAt,
                }),
                sequence,
            ],
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
        tx: Transaction,
        actorUserId: string,
        messageId: string,
        reason?: string,
    ): Promise<{ chatId: string; sync: OperationsSyncHint }> {
        const message = await one(
            tx,
            `SELECT chat_id, deleted_at, thread_root_message_id FROM messages WHERE id = ?`,
            [messageId],
        );
        if (!message) throw new OperationsError("not_found", "Message was not found");
        if (message.deleted_at !== null)
            throw new OperationsError("conflict", "Message is already removed");
        const chatId = text(message.chat_id);
        const sequence = await this.nextSequence(tx);
        const pts = await this.advanceChatMutation(tx, {
            sequence,
            chatId,
            kind: "message.deleted",
            entityId: messageId,
            actorUserId,
        });
        await tx.execute({
            sql: `UPDATE messages
                     SET text = '', content_json = NULL, deleted_at = CURRENT_TIMESTAMP,
                         deleted_by_user_id = ?, delete_reason = ?, change_pts = ?,
                         updated_at = CURRENT_TIMESTAMP
                   WHERE id = ? AND deleted_at IS NULL`,
            args: [actorUserId, reason ?? "moderation", pts, messageId],
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
        if (message.thread_root_message_id) {
            const threadRootMessageId = text(message.thread_root_message_id);
            await this.recomputeThreadProjection(tx, threadRootMessageId, pts);
            await tx.execute({
                sql: `UPDATE messages SET change_pts = ? WHERE id = ?`,
                args: [pts, threadRootMessageId],
            });
        }
        return {
            chatId,
            sync: { sequence: String(sequence), chats: [{ chatId, pts: String(pts) }], areas: [] },
        };
    }

    private async removeFileInTransaction(
        tx: Transaction,
        actorUserId: string,
        fileId: string,
        reason?: string,
    ): Promise<OperationsSyncHint> {
        const file = await one(tx, `SELECT deleted_at FROM files WHERE id = ?`, [fileId]);
        if (!file) throw new OperationsError("not_found", "File was not found");
        if (file.deleted_at !== null)
            throw new OperationsError("conflict", "File is already removed");
        const chats = await tx.execute({
            sql: `SELECT DISTINCT m.chat_id
                    FROM message_attachments ma
                    JOIN messages m ON m.id = ma.message_id
                    JOIN chats c ON c.id = m.chat_id
                   WHERE ma.file_id = ? AND m.deleted_at IS NULL AND c.deleted_at IS NULL
                   ORDER BY m.chat_id`,
            args: [fileId],
        });
        const sequence = await this.nextSequence(tx);
        const chatPoints: Array<{ chatId: string; pts: string }> = [];
        for (const row of chats.rows) {
            const chatId = text(row.chat_id);
            const pts = await this.advanceChatMutation(tx, {
                sequence,
                chatId,
                kind: "file.removed",
                entityId: fileId,
                actorUserId,
            });
            chatPoints.push({ chatId, pts: String(pts) });
        }
        await tx.execute({
            sql: `UPDATE files
                     SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?,
                         delete_reason = ?, access_scope = 'private', is_public = 0,
                         orphaned_at = COALESCE(orphaned_at, CURRENT_TIMESTAMP)
                   WHERE id = ? AND deleted_at IS NULL`,
            args: [actorUserId, reason ?? "moderation", fileId],
        });
        await tx.execute({
            sql: `DELETE FROM file_access_grants WHERE file_id = ?`,
            args: [fileId],
        });
        await this.insertSyncEvent(tx, {
            sequence,
            kind: "file.removed",
            entityId: fileId,
            actorUserId,
        });
        return { sequence: String(sequence), chats: chatPoints, areas: ["files"] };
    }

    private async deleteUserInTransaction(
        tx: Transaction,
        actorUserId: string,
        targetUserId: string,
    ): Promise<OperationsSyncHint> {
        if (actorUserId === targetUserId)
            throw new OperationsError("forbidden", "Administrators cannot delete themselves");
        const target = await one(
            tx,
            `SELECT u.role, u.account_id
               FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.deleted_at IS NULL AND a.deleted_at IS NULL`,
            [targetUserId],
        );
        if (!target) throw new OperationsError("not_found", "User was not found");
        if (target.role === "admin") {
            const otherAdmin = await one(
                tx,
                `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
                  WHERE u.id != ? AND u.role = 'admin' AND u.deleted_at IS NULL
                    AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL LIMIT 1`,
                [targetUserId],
            );
            if (!otherAdmin)
                throw new OperationsError(
                    "forbidden",
                    "The last active administrator cannot be deleted",
                );
        }

        const sequence = await this.nextSequence(tx);
        const memberships = await tx.execute({
            sql: `SELECT cm.chat_id, cm.role, c.kind
                    FROM chat_members cm JOIN chats c ON c.id = cm.chat_id
                   WHERE cm.user_id = ? AND cm.left_at IS NULL AND c.deleted_at IS NULL`,
            args: [targetUserId],
        });
        const chatPoints: Array<{ chatId: string; pts: string }> = [];
        for (const membership of memberships.rows) {
            const chatId = text(membership.chat_id);
            let eventKind = "member.deleted";
            if (membership.kind !== "dm" && membership.role === "owner") {
                const successor = await one(
                    tx,
                    `SELECT cm.user_id
                       FROM chat_members cm
                       JOIN users u ON u.id = cm.user_id
                       JOIN accounts a ON a.id = u.account_id
                      WHERE cm.chat_id = ? AND cm.user_id != ? AND cm.left_at IS NULL
                        AND u.deleted_at IS NULL AND a.active = 1
                        AND a.banned_at IS NULL AND a.deleted_at IS NULL
                      ORDER BY CASE cm.role WHEN 'owner' THEN 0 WHEN 'admin' THEN 1 ELSE 2 END,
                               cm.joined_at, cm.user_id LIMIT 1`,
                    [chatId, targetUserId],
                );
                if (successor) {
                    const successorId = text(successor.user_id);
                    await tx.execute({
                        sql: `UPDATE chat_members
                                 SET role = 'owner', sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                               WHERE chat_id = ? AND user_id = ?`,
                        args: [sequence, chatId, successorId],
                    });
                    await tx.execute({
                        sql: `UPDATE chats SET owner_user_id = ? WHERE id = ?`,
                        args: [successorId, chatId],
                    });
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
                await tx.execute({
                    sql: `UPDATE chat_members
                             SET left_at = CURRENT_TIMESTAMP, removed_by_user_id = ?,
                                 sync_sequence = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE chat_id = ? AND user_id = ? AND left_at IS NULL`,
                    args: [actorUserId, sequence, chatId, targetUserId],
                });
            if (eventKind === "chat.deleted")
                await tx.execute({
                    sql: `UPDATE chats
                             SET deleted_at = CURRENT_TIMESTAMP, deleted_by_user_id = ?,
                                 delete_reason = 'last member deleted', owner_user_id = NULL
                           WHERE id = ?`,
                    args: [actorUserId, chatId],
                });
        }
        const accountId = text(target.account_id);
        await tx.execute({
            sql: `UPDATE auth_sessions SET revoked_at = CURRENT_TIMESTAMP
                   WHERE account_id = ? AND revoked_at IS NULL`,
            args: [accountId],
        });
        await tx.execute({
            sql: `UPDATE accounts
                     SET deleted_at = CURRENT_TIMESTAMP, active = 0, password_hash = NULL,
                         banned_at = NULL, ban_expires_at = NULL, ban_reason = NULL,
                         banned_by_user_id = NULL,
                         email = 'deleted+' || id || '@invalid.local'
                   WHERE id = ? AND deleted_at IS NULL`,
            args: [accountId],
        });
        await tx.execute({
            sql: `UPDATE users
                     SET deleted_at = CURRENT_TIMESTAMP, sync_sequence = ?,
                         first_name = 'Deleted', last_name = NULL, title = NULL,
                         username = 'deleted_' || id, email = NULL, phone = NULL,
                         photo_file_id = NULL
                   WHERE id = ? AND deleted_at IS NULL`,
            args: [sequence, targetUserId],
        });
        await this.insertSyncEvent(tx, {
            sequence,
            kind: "user.deleted",
            entityId: targetUserId,
            actorUserId,
        });
        return { sequence: String(sequence), chats: chatPoints, areas: ["users"] };
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

    private async nextSequence(tx: Transaction): Promise<number> {
        const state = await one(
            tx,
            `UPDATE server_sync_state SET sequence = sequence + 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = 1 RETURNING sequence`,
        );
        if (!state) throw new Error("Sync state has not been initialized");
        return number(state.sequence);
    }

    private async advanceChatMutation(
        tx: Transaction,
        input: {
            sequence: number;
            chatId: string;
            kind: string;
            entityId?: string;
            actorUserId?: string;
        },
    ): Promise<number> {
        const chat = await one(
            tx,
            `UPDATE chats
                SET pts = pts + 1, last_change_sequence = ?, updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL RETURNING pts`,
            [input.sequence, input.chatId],
        );
        if (!chat) throw new OperationsError("not_found", "Chat was not found");
        const pts = number(chat.pts);
        await tx.execute({
            sql: `INSERT INTO chat_updates (chat_id, pts, pts_count, kind, entity_id)
                  VALUES (?, ?, 1, ?, ?)`,
            args: [input.chatId, pts, input.kind, input.entityId ?? null],
        });
        await this.insertSyncEvent(tx, { ...input, chatPts: pts });
        return pts;
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

    private async syncUserMutation(
        tx: Transaction,
        actorUserId: string | undefined,
        targetUserId: string,
        kind: string,
    ): Promise<OperationsSyncHint> {
        const state = await one(
            tx,
            `UPDATE server_sync_state SET sequence = sequence + 1, updated_at = CURRENT_TIMESTAMP
              WHERE id = 1 RETURNING sequence`,
        );
        if (!state) throw new Error("Sync state has not been initialized");
        const sequence = number(state.sequence);
        await tx.execute({
            sql: `UPDATE users SET sync_sequence = ? WHERE id = ?`,
            args: [sequence, targetUserId],
        });
        await tx.execute({
            sql: `INSERT INTO sync_events
                    (sequence, kind, entity_id, actor_user_id, target_user_id)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [sequence, kind, targetUserId, actorUserId ?? null, targetUserId],
        });
        return { sequence: String(sequence), chats: [], areas: ["users"] };
    }

    private async closeElapsedBan(tx: Transaction, target: AccountTarget): Promise<void> {
        if (
            !target.bannedAt ||
            !target.banExpiresAt ||
            Date.parse(target.banExpiresAt) > Date.now()
        )
            return;
        const now = new Date().toISOString();
        await tx.execute({
            sql: `UPDATE account_bans
                     SET revoked_at = COALESCE(revoked_at, ?),
                         revoke_reason = COALESCE(revoke_reason, 'expired')
                   WHERE account_id = ? AND revoked_at IS NULL AND expires_at <= ?`,
            args: [now, target.accountId, now],
        });
        await tx.execute({
            sql: `UPDATE accounts
                     SET banned_at = NULL, ban_expires_at = NULL, ban_reason = NULL,
                         banned_by_user_id = NULL
                   WHERE id = ? AND ban_expires_at IS NOT NULL AND ban_expires_at <= ?`,
            args: [target.accountId, now],
        });
    }

    private async requireReportTargetAccess(
        tx: Transaction,
        input: {
            actorUserId: string;
            targetUserId?: string;
            chatId?: string;
            messageId?: string;
            fileId?: string;
        },
    ): Promise<void> {
        if (input.targetUserId) await this.requireExistingUser(tx, input.targetUserId);
        if (input.chatId && !(await this.canAccessChat(tx, input.actorUserId, input.chatId)))
            throw new OperationsError("not_found", "Chat was not found");
        if (input.messageId) {
            const message = await one(tx, `SELECT chat_id FROM messages WHERE id = ?`, [
                input.messageId,
            ]);
            if (
                !message ||
                !(await this.canAccessChat(tx, input.actorUserId, text(message.chat_id)))
            )
                throw new OperationsError("not_found", "Message was not found");
            if (input.chatId && input.chatId !== text(message.chat_id))
                throw new OperationsError("invalid", "messageId does not belong to chatId");
        }
        if (input.fileId) {
            const accessible = await one(
                tx,
                `SELECT f.id FROM files f
                  WHERE f.id = ? AND f.deleted_at IS NULL AND (
                    f.is_public = 1 OR f.uploaded_by_user_id = ? OR
                    EXISTS (SELECT 1 FROM file_access_grants g
                             WHERE g.file_id = f.id AND
                               ((g.principal_type = 'user' AND g.principal_id = ?) OR
                                (g.principal_type = 'server') OR
                                (g.principal_type = 'chat' AND EXISTS (
                                  SELECT 1 FROM chats c LEFT JOIN chat_members cm
                                    ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                                   WHERE c.id = g.principal_id AND c.deleted_at IS NULL
                                     AND (c.visibility = 'public' OR cm.user_id IS NOT NULL))))
                               AND (g.expires_at IS NULL OR g.expires_at > CURRENT_TIMESTAMP)) OR
                    EXISTS (SELECT 1 FROM message_attachments ma JOIN messages m ON m.id = ma.message_id
                              JOIN chats c ON c.id = m.chat_id LEFT JOIN chat_members cm
                                ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                             WHERE ma.file_id = f.id AND m.deleted_at IS NULL AND c.deleted_at IS NULL
                               AND (c.visibility = 'public' OR cm.user_id IS NOT NULL))
                  )`,
                [
                    input.fileId,
                    input.actorUserId,
                    input.actorUserId,
                    input.actorUserId,
                    input.actorUserId,
                ],
            );
            if (!accessible) throw new OperationsError("not_found", "File was not found");
        }
    }

    private async canAccessChat(
        executor: Executor,
        userId: string,
        chatId: string,
    ): Promise<boolean> {
        return Boolean(
            await one(
                executor,
                `SELECT c.id FROM chats c LEFT JOIN chat_members cm
                   ON cm.chat_id = c.id AND cm.user_id = ? AND cm.left_at IS NULL
                 WHERE c.id = ? AND c.deleted_at IS NULL
                   AND (c.visibility = 'public' OR cm.user_id IS NOT NULL)`,
                [userId, chatId],
            ),
        );
    }

    private report(executor: Executor, id: string): Promise<ModerationReport> {
        return requiredRow(
            executor,
            `${REPORT_SELECT} WHERE id = ?`,
            [id],
            asReport,
            "Moderation report was not found",
        );
    }

    private exportJob(executor: Executor, id: string): Promise<DataExportJob> {
        return requiredRow(
            executor,
            `${EXPORT_SELECT} WHERE id = ?`,
            [id],
            asExport,
            "Data export was not found",
        );
    }

    private backup(executor: Executor, id: string): Promise<BackupRecord> {
        return requiredRow(
            executor,
            `${BACKUP_SELECT} WHERE id = ?`,
            [id],
            asBackup,
            "Backup was not found",
        );
    }

    private retentionRun(executor: Executor, id: string): Promise<RetentionRun> {
        return requiredRow(
            executor,
            `${RETENTION_SELECT} WHERE id = ?`,
            [id],
            asRetention,
            "Retention run was not found",
        );
    }

    private async appendAudit(
        tx: Transaction,
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
        await tx.execute({
            sql: `INSERT INTO audit_log_entries
                    (id, actor_user_id, action, target_type, target_id, chat_id,
                     before_json, after_json, metadata_json, client_ip, device,
                     app_version, user_agent)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                createId(),
                input.actorUserId ?? null,
                input.action,
                input.targetType,
                input.targetId ?? null,
                input.chatId ?? null,
                json(input.before),
                json(input.after),
                Object.keys(metadata).length ? JSON.stringify(metadata) : null,
                request?.ip ?? null,
                request?.device ?? null,
                request?.appVersion ?? null,
                request?.userAgent ?? null,
            ],
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

async function requiredRow<T>(
    executor: Executor,
    sql: string,
    args: InArgs,
    map: (row: Row) => T,
    message = "Record was not found",
): Promise<T> {
    const row = await one(executor, sql, args);
    if (!row) throw new OperationsError("not_found", message);
    return map(row);
}

function addFilter(clauses: string[], args: InValue[], sql: string, value: string): void {
    clauses.push(sql);
    args.push(value);
}

function where(clauses: readonly string[]): string {
    return clauses.length ? ` WHERE ${clauses.join(" AND ")}` : "";
}

interface Cursor {
    at: string;
    id: string;
}

function addCursor(
    clauses: string[],
    args: InValue[],
    cursor: Cursor | undefined,
    timestampColumn = "created_at",
    idColumn = "id",
): void {
    if (!cursor) return;
    clauses.push(`(${timestampColumn} < ? OR (${timestampColumn} = ? AND ${idColumn} < ?))`);
    args.push(cursor.at, cursor.at, cursor.id);
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

function page<T>(
    rows: Row[],
    limit: number,
    map: (row: Row) => T,
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

function asAudit(row: Row): AuditLogEntry {
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

function asBan(row: Row): AccountBan {
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

function asReport(row: Row): ModerationReport {
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

function asModerationAction(row: Row): ModerationAction {
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

function asExport(row: Row): DataExportJob {
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

function asBackup(row: Row): BackupRecord {
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

function asRetention(row: Row): RetentionRun {
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

function asAccess(row: Row): UserAccessTelemetry {
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
    return (
        String((error as { code?: unknown }).code ?? "").includes("CONSTRAINT") ||
        String((error as { message?: unknown }).message ?? "").includes("UNIQUE constraint")
    );
}
