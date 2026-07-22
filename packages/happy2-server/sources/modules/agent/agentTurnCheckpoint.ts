import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { agentActiveExists } from "./impl/agentActiveExists.js";

/**
 * Stores the latest acknowledged Rig event position on an active agent's leased agentTurns row when the checkpoint moves forward.
 * Active identity, ownership, and monotonicity checks let an authorized resumed worker continue safely without an older callback rewinding progress.
 */
export async function agentTurnCheckpoint(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        baselineMessageCount: number;
        lastSessionEventId?: string;
        runId?: string;
        userMessageId: string;
        workerId: string;
    },
): Promise<boolean> {
    // Use the repository's transactional write boundary so checkpoint
    // persistence completes before session streaming begins.
    const changed = await withTransaction(executor, (tx) =>
        tx
            .update(agentTurns)
            .set({
                baselineMessageCount: input.baselineMessageCount,
                ...(input.lastSessionEventId === undefined
                    ? {}
                    : {
                          lastSessionEventId: input.lastSessionEventId,
                      }),
                ...(input.runId === undefined
                    ? {}
                    : {
                          runId: input.runId,
                      }),
                leaseExpiresAt: new Date(Date.now() + 45_000).toISOString(),
                updatedAt: sql`CURRENT_TIMESTAMP`,
                lastError: null,
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
