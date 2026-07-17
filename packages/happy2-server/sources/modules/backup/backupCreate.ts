import { type AuditContext } from "../operations/auditContext.js";
import { type BackupRecord, OperationsError } from "../operations/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { backupRecords } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { futureTimestamp } from "../operations/futureTimestamp.js";
import { isUniqueConstraint } from "./impl/isUniqueConstraint.js";
import { json } from "../operations/json.js";
import { auditAppend } from "../operations/auditAppend.js";
import { backupDb } from "./impl/backupDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";

/**
 * Opens a backupRecords job for an authorized operations administrator with its requested scope and initial running state.
 * Creating the job and audit evidence together gives the external backup worker an attributable unit of work to complete.
 */
export async function backupCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        storageProvider: string;
        storageKey: string;
        retentionUntil?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    },
): Promise<BackupRecord> {
    const retentionUntil = futureTimestamp(input.retentionUntil, "retentionUntil");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
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
        const backup = await backupDb(tx, id);
        await auditAppend(tx, {
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
