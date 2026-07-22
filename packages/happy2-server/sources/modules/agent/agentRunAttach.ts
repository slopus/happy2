import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurns, messages, users } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Attaches the durable Rig run identifier to the matching active agent's agentTurns record once the turn is in an attachable state.
 * The guarded write prevents callbacks from reviving an inactive identity, associating a run with the wrong chat turn, or overwriting an existing run.
 */
export async function agentRunAttach(
    executor: DrizzleExecutor,
    input: {
        runId: string;
        sessionId: string;
        text: string;
    },
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        const [turn] = await tx
            .select({
                userMessageId: agentTurns.userMessageId,
            })
            .from(agentTurns)
            .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
            .innerJoin(users, eq(users.id, agentTurns.agentUserId))
            .where(
                and(
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.status, "running"),
                    isNull(agentTurns.runId),
                    eq(messages.text, input.text),
                    eq(users.kind, "agent"),
                    eq(users.active, 1),
                    isNull(users.deletedAt),
                ),
            )
            .orderBy(agentTurns.createdAt, agentTurns.userMessageId)
            .limit(1);
        if (!turn) return;
        await tx
            .update(agentTurns)
            .set({
                runId: input.runId,
                updatedAt: sql`CURRENT_TIMESTAMP`,
                lastError: null,
            })
            .where(
                and(
                    eq(agentTurns.userMessageId, turn.userMessageId),
                    eq(agentTurns.status, "running"),
                    isNull(agentTurns.runId),
                ),
            );
    });
}
