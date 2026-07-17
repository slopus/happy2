import { type AuditContext } from "../operations/auditContext.js";
import { type BackupRecord, type BackupStatus, OperationsError } from "../operations/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { assertBackupTransition } from "./impl/assertBackupTransition.js";
import { backupRecords } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { futureTimestamp } from "../operations/futureTimestamp.js";
import { json } from "../operations/json.js";

import { auditAppend } from "../operations/auditAppend.js";
import { backupDb } from "./impl/backupDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";

/**
 * Applies an allowed progress or terminal transition to backupRecords after verifying operations-administrator authority.
 * Persisting the status change with its audit entry prevents a backup result from appearing without a record of who reported it.
 */
export async function backupUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        backupId: string;
        status: Exclude<BackupStatus, "pending">;
        checksumSha256?: string;
        size?: number;
        lastError?: string;
        retentionUntil?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    },
): Promise<BackupRecord> {
    const retentionUntil = futureTimestamp(input.retentionUntil, "retentionUntil");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const before = await backupDb(tx, input.backupId);
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
        const after = await backupDb(tx, input.backupId);
        await auditAppend(tx, {
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
