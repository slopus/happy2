import { type ClaimedDataExport } from "./impl/claimedDataExport.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, sql } from "drizzle-orm";
import { dataExportJobs } from "../schema.js";

/**
 * Marks dataExportJobs failed only while the same running claim still owns its startedAt fence and stores a bounded error message.
 * Returning false tells the worker that a newer claimant won, so stale execution cannot overwrite the replacement job state.
 */
export async function dataExportFailClaim(
    executor: DrizzleExecutor,
    claim: ClaimedDataExport,
    error: unknown,
): Promise<boolean> {
    const message = error instanceof Error ? error.message : String(error);
    const [failed] = await executor
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
        .returning({
            id: dataExportJobs.id,
        });
    return Boolean(failed);
}
