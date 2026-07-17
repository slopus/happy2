import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { OperationsError, type RetentionRun } from "../operations/types.js";

import { eq, sql } from "drizzle-orm";
import { json } from "../operations/json.js";
import { retentionRuns } from "../schema.js";

import { auditAppend } from "../operations/auditAppend.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { retentionRunDb } from "./impl/retentionRunDb.js";

/**
 * Records the terminal outcome and deletion counts for an administrator-owned retentionRuns execution.
 * Completing the run with its audit entry makes retention results attributable and prevents later updates to an already closed execution.
 */
export async function retentionRunFinish(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        runId: string;
        status: "complete" | "failed";
        itemsExamined: number;
        itemsDeleted: number;
        details?: Record<string, unknown>;
        lastError?: string;
        context?: AuditContext;
    },
): Promise<RetentionRun> {
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const before = await retentionRunDb(tx, input.runId);
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
        const after = await retentionRunDb(tx, input.runId);
        await auditAppend(tx, {
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
