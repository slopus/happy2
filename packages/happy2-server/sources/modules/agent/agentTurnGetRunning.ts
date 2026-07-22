import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurnWork } from "./impl/agentTurnWork.js";
import { agentTurnWorkSelection } from "./impl/agentTurnWorkSelection.js";
import { agentTurns, messages, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Returns an active agent's running turn when its stored run identifier is absent or matches the Rig callback and the actor projection is complete.
 * Rejecting inactive identities and callbacks for a different attached run prevents event ingestion from resuming unauthorized or unrelated execution.
 */
export async function agentTurnGetRunning(
    executor: DrizzleExecutor,
    sessionId: string,
    runId: string,
) {
    const [turn] = await executor
        .select(agentTurnWorkSelection)
        .from(agentTurns)
        .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
        .innerJoin(users, eq(users.id, agentTurns.agentUserId))
        .where(
            and(
                eq(agentTurns.sessionId, sessionId),
                eq(agentTurns.status, "running"),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    if (turn?.runId && turn.runId !== runId) return undefined;
    return turn?.actorUserId ? agentTurnWork(turn) : undefined;
}
