import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurnWork } from "./impl/agentTurnWork.js";
import { agentTurnWorkSelection } from "./impl/agentTurnWorkSelection.js";
import { agentTurns, messages } from "../schema.js";
import { and, eq } from "drizzle-orm";

/**
 * Returns the running turn for a Rig session when its stored run identifier is absent or matches the callback and the actor projection is complete.
 * Rejecting callbacks for a different attached run prevents event ingestion from resuming work owned by another Rig execution.
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
        .where(and(eq(agentTurns.sessionId, sessionId), eq(agentTurns.status, "running")))
        .limit(1);
    if (turn?.runId && turn.runId !== runId) return undefined;
    return turn?.actorUserId ? agentTurnWork(turn) : undefined;
}
