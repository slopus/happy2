import { type ClaimedDataExport } from "./impl/claimedDataExport.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { dataExportJobs, fileAccessGrants } from "../schema.js";

import { auditAppend } from "../operations/auditAppend.js";

/**
 * Completes a leased dataExportJobs build and grants its requester access through fileAccessGrants to the produced archive.
 * Verifying lease ownership and committing the file grant with completion prevents a ready export from pointing at an inaccessible or unrelated file.
 */
export async function dataExportCompleteClaim(
    executor: DrizzleExecutor,
    claim: ClaimedDataExport,
    outputFileId: string,
): Promise<boolean> {
    const requesterId = claim.requestedByUserId;
    if (!requesterId) return false;
    return withTransaction(executor, async (tx) => {
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
            .returning({
                id: dataExportJobs.id,
            });
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
                set: {
                    expiresAt: claim.expiresAt ?? null,
                },
            });
        await auditAppend(tx, {
            actorUserId: requesterId,
            action: "data_export.complete",
            targetType: "data_export",
            targetId: claim.id,
            after: {
                outputFileId,
            },
        });
        return true;
    });
}
