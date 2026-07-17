import { type AuditContext } from "../operations/auditContext.js";
import { type DataExportJob, OperationsError } from "../operations/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { dataExportJobs } from "../schema.js";
import { eq, sql } from "drizzle-orm";

import { auditAppend } from "../operations/auditAppend.js";
import { exportJobDb } from "./impl/exportJobDb.js";
import { userRequireOperationsActive } from "../operations/userRequireOperationsActive.js";

/**
 * Cancels a requester-visible dataExportJobs item only while its lifecycle still permits cancellation.
 * Persisting the terminal state with audit evidence gives workers an authoritative stop signal and explains who withdrew the export.
 */
export async function dataExportCancel(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        jobId: string;
        context?: AuditContext;
    },
): Promise<DataExportJob> {
    return withTransaction(executor, async (tx) => {
        const actor = await userRequireOperationsActive(tx, input.actorUserId);
        const before = await exportJobDb(tx, input.jobId);
        if (actor.role !== "admin" && before.requestedByUserId !== input.actorUserId)
            throw new OperationsError("not_found", "Data export was not found");
        if (before.status !== "pending" && before.status !== "running")
            throw new OperationsError("conflict", "Data export can no longer be cancelled");
        await tx
            .update(dataExportJobs)
            .set({
                status: "cancelled",
                completedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(dataExportJobs.id, input.jobId));
        const after = await exportJobDb(tx, input.jobId);
        await auditAppend(tx, {
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
