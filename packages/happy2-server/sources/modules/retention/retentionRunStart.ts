import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { OperationsError, type RetentionRun, type RetentionScope } from "../operations/types.js";

import { and, eq } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

import { json } from "../operations/json.js";
import { retentionRuns } from "../schema.js";
import { auditAppend } from "../operations/auditAppend.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { retentionRunDb } from "./impl/retentionRunDb.js";

/**
 * Opens a retentionRuns record with the requested policy snapshot after operations-administrator authorization.
 * Capturing the immutable scope and audit evidence before deletion begins gives the asynchronous cleanup a reviewable execution boundary.
 */
export async function retentionRunStart(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        scope: RetentionScope;
        details?: Record<string, unknown>;
        context?: AuditContext;
    },
): Promise<RetentionRun> {
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const [active] = await tx
            .select({
                id: retentionRuns.id,
            })
            .from(retentionRuns)
            .where(and(eq(retentionRuns.scope, input.scope), eq(retentionRuns.status, "running")))
            .limit(1);
        if (active)
            throw new OperationsError(
                "conflict",
                "A retention run is already active for this scope",
            );
        const id = createId();
        await tx.insert(retentionRuns).values({
            id,
            scope: input.scope,
            detailsJson: json(input.details),
        });
        const run = await retentionRunDb(tx, id);
        await auditAppend(tx, {
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
