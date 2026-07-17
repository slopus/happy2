import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { inArray } from "drizzle-orm";
/**
 * Lists distinct chat identifiers that still have pending or running agent turns.
 * Collapsing multiple turns per chat gives startup recovery a minimal set of conversations whose workers may need rescheduling.
 */
export async function agentChatListUnfinishedIds(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .selectDistinct({
            chatId: agentTurns.chatId,
        })
        .from(agentTurns)
        .where(inArray(agentTurns.status, ["pending", "running"]));
    return rows.map((row) => row.chatId);
}
