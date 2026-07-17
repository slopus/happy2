import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns } from "../schema.js";
import { and, eq } from "drizzle-orm";

/**
 * Reports runnable work for a chat when a pending turn exists or a running turn has no live lease.
 * A currently leased running turn suppresses the result so competing workers do not treat queued work in the same chat as concurrently executable.
 */
export async function agentTurnHasRunnable(
    executor: DrizzleExecutor,
    chatId: string,
): Promise<boolean> {
    const [running] = await executor
        .select({
            leaseExpiresAt: agentTurns.leaseExpiresAt,
        })
        .from(agentTurns)
        .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "running")))
        .limit(1);
    if (running && running.leaseExpiresAt && Date.parse(running.leaseExpiresAt) > Date.now())
        return false;
    const [pending] = await executor
        .select({
            id: agentTurns.userMessageId,
        })
        .from(agentTurns)
        .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "pending")))
        .limit(1);
    return Boolean(running || pending);
}
