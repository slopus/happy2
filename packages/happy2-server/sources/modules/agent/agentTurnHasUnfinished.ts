import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq, inArray } from "drizzle-orm";

/**
 * Reports whether a chat contains any pending or running agent turn, regardless of current lease state.
 * This broader unfinished predicate protects lifecycle changes that must wait for all queued and active work to reach a terminal status.
 */
export async function agentTurnHasUnfinished(
    executor: DrizzleExecutor,
    chatId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({
            id: agentTurns.userMessageId,
        })
        .from(agentTurns)
        .where(
            and(eq(agentTurns.chatId, chatId), inArray(agentTurns.status, ["pending", "running"])),
        )
        .limit(1);
    return Boolean(row);
}
