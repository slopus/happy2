import { type AuditContext } from "../operations/auditContext.js";
import { type DataExportJob, type DataExportStatus, OperationsError } from "../operations/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { assertExportTransition } from "./impl/assertExportTransition.js";
import { createId } from "@paralleldrive/cuid2";
import { dataExportJobs, fileAccessGrants, files } from "../schema.js";

import { futureTimestamp } from "../operations/futureTimestamp.js";

import { auditAppend } from "../operations/auditAppend.js";
import { exportJobDb } from "./impl/exportJobDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";

/**
 * Applies an administrator-reported progress, failure, or completion transition to dataExportJobs and manages any resulting fileAccessGrants.
 * The transaction keeps the job lifecycle, archive visibility, and audit history consistent when operations staff repair or finalize an export.
 */
export async function dataExportUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        jobId: string;
        status: Exclude<DataExportStatus, "pending">;
        outputFileId?: string;
        lastError?: string;
        expiresAt?: string;
        context?: AuditContext;
    },
): Promise<DataExportJob> {
    const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const before = await exportJobDb(tx, input.jobId);
        assertExportTransition(before.status, input.status);
        if (input.status === "complete") {
            if (!input.outputFileId)
                throw new OperationsError("invalid", "A completed export requires outputFileId");
            const [file] = await tx
                .select({
                    id: files.id,
                })
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
                completedAt: ["complete", "failed", "cancelled", "expired"].includes(input.status)
                    ? sql`coalesce(${dataExportJobs.completedAt}, CURRENT_TIMESTAMP)`
                    : sql`${dataExportJobs.completedAt}`,
            })
            .where(eq(dataExportJobs.id, input.jobId));
        const after = await exportJobDb(tx, input.jobId);
        await auditAppend(tx, {
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
