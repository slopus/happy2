import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { agentActiveExists } from "./impl/agentActiveExists.js";

/**
 * Extends the deadline on an agentTurns lease only while its agent remains active and the current worker owns it.
 * The guarded heartbeat aborts deactivated execution and prevents a stale process from prolonging work that has already been reassigned.
 */
export async function agentTurnRenewLease(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        userMessageId: string;
        workerId: string;
    },
): Promise<boolean> {
    const changed = await withTransaction(executor, (tx) =>
        tx
            .update(agentTurns)
            .set({
                leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(),
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentTurns.userMessageId, input.userMessageId),
                    eq(agentTurns.agentUserId, input.agentUserId),
                    eq(agentTurns.workerId, input.workerId),
                    eq(agentTurns.status, "running"),
                    agentActiveExists(tx, input.agentUserId),
                ),
            )
            .returning({
                id: agentTurns.userMessageId,
            }),
    );
    return changed.length === 1;
}
