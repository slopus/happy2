import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq, inArray } from "drizzle-orm";

/** Lists every durable Rig session/run that may still execute work for a chat. */
export async function agentTurnListAbortTargets(
    executor: DrizzleExecutor,
    chatId: string,
): Promise<Array<{ sessionId: string; runId?: string }>> {
    const rows = await executor
        .selectDistinct({ sessionId: agentTurns.sessionId, runId: agentTurns.runId })
        .from(agentTurns)
        .where(
            and(eq(agentTurns.chatId, chatId), inArray(agentTurns.status, ["pending", "running"])),
        );
    return rows.map((row) => ({
        sessionId: row.sessionId,
        ...(row.runId ? { runId: row.runId } : {}),
    }));
}
