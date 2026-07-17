import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurns, messages } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Attaches the durable Rig run identifier to the matching agentTurns record once the turn is in an attachable state.
 * The guarded write prevents callbacks from associating a run with the wrong chat turn or overwriting an existing run.
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
            .where(
                and(
                    eq(agentTurns.sessionId, input.sessionId),
                    eq(agentTurns.status, "running"),
                    isNull(agentTurns.runId),
                    eq(messages.text, input.text),
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
