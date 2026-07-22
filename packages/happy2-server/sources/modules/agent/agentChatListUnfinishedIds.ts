import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns, users } from "../schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
/**
 * Lists distinct chat identifiers that still have pending or running turns for active agents.
 * Collapsing multiple turns per chat gives startup recovery a minimal set of conversations whose authorized workers may need rescheduling without reviving inactive identities.
 */
export async function agentChatListUnfinishedIds(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .selectDistinct({
            chatId: agentTurns.chatId,
        })
        .from(agentTurns)
        .innerJoin(users, eq(users.id, agentTurns.agentUserId))
        .where(
            and(
                inArray(agentTurns.status, ["pending", "running"]),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        );
    return rows.map((row) => row.chatId);
}
