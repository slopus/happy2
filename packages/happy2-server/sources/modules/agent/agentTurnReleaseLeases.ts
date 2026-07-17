import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";

/**
 * Returns agentTurns leased by the departing worker to a claimable state without changing turns owned elsewhere.
 * This shutdown boundary prevents abandoned ownership from permanently blocking queued agent work.
 */
export async function agentTurnReleaseLeases(
    executor: DrizzleExecutor,
    workerId: string,
): Promise<void> {
    await withTransaction(executor, (tx) =>
        tx
            .update(agentTurns)
            .set({
                workerId: null,
                leaseExpiresAt: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(agentTurns.workerId, workerId), eq(agentTurns.status, "running"))),
    );
}
