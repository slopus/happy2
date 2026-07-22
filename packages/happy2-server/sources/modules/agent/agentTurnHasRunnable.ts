import { type DrizzleExecutor } from "../drizzle.js";
import { agentTurns, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Reports runnable work for a chat when an active agent has a pending turn or a running turn without a live lease.
 * Inactive identities are not rescheduled, while a currently leased active turn suppresses competing workers from treating queued work in the same chat as concurrently executable.
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
        .innerJoin(users, eq(users.id, agentTurns.agentUserId))
        .where(
            and(
                eq(agentTurns.chatId, chatId),
                eq(agentTurns.status, "running"),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    if (running && running.leaseExpiresAt && Date.parse(running.leaseExpiresAt) > Date.now())
        return false;
    const [pending] = await executor
        .select({
            id: agentTurns.userMessageId,
        })
        .from(agentTurns)
        .innerJoin(users, eq(users.id, agentTurns.agentUserId))
        .where(
            and(
                eq(agentTurns.chatId, chatId),
                eq(agentTurns.status, "pending"),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    return Boolean(running || pending);
}
