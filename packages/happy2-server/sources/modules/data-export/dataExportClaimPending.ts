import { type ClaimedDataExport } from "./impl/claimedDataExport.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { and, eq, isNull, lte, or } from "drizzle-orm";
import { asExport } from "./impl/asExport.js";
import { dataExportJobs } from "../schema.js";

import { exportSelection } from "./impl/exportSelection.js";

/**
 * Claims the oldest eligible dataExportJobs item for a worker by moving it from pending to a leased running state.
 * The conditional claim serializes competing exporters so a user's archive is built once even when several workers poll concurrently.
 */
export async function dataExportClaimPending(
    executor: DrizzleExecutor,
    limit = 5,
    leaseMs = 5 * 60_000,
): Promise<ClaimedDataExport[]> {
    const claimedAt = new Date().toISOString();
    const staleBefore = new Date(Date.now() - leaseMs).toISOString();
    const claimable = or(
        eq(dataExportJobs.status, "pending"),
        and(
            eq(dataExportJobs.status, "running"),
            or(isNull(dataExportJobs.startedAt), lte(dataExportJobs.startedAt, staleBefore)),
        ),
    );
    const [candidate] = await executor
        .select({
            id: dataExportJobs.id,
        })
        .from(dataExportJobs)
        .where(claimable)
        .limit(1);
    if (!candidate) return [];
    return withTransaction(executor, async (tx) => {
        const candidates = await tx
            .select({
                id: dataExportJobs.id,
            })
            .from(dataExportJobs)
            .where(claimable)
            .orderBy(dataExportJobs.createdAt, dataExportJobs.id)
            .limit(limit);
        const claimed: ClaimedDataExport[] = [];
        for (const candidate of candidates) {
            const [row] = await tx
                .update(dataExportJobs)
                .set({
                    status: "running",
                    startedAt: claimedAt,
                    lastError: null,
                })
                .where(and(eq(dataExportJobs.id, candidate.id), claimable))
                .returning(exportSelection);
            if (row)
                claimed.push({
                    ...asExport(row),
                    claimStartedAt: claimedAt,
                });
        }
        return claimed;
    });
}
