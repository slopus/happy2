import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentTurnWork } from "./impl/agentTurnWork.js";
import { agentTurnWorkSelection } from "./impl/agentTurnWorkSelection.js";
import { agentTurns, chats, messages } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";

/**
 * Claims the oldest eligible agentTurns item for one worker and records a bounded ownership lease.
 * The conditional state transition serializes competing workers so each queued turn has at most one active executor.
 */
export async function agentTurnTakeNext(
    executor: DrizzleExecutor,
    chatId: string,
    workerId: string,
): Promise<
    | {
          agentUserId: string;
          actorUserId: string;
          baselineMessageCount?: number;
          chatId: string;
          lastSessionEventId?: string;
          leaseExpiresAt?: string;
          runId?: string;
          sessionId: string;
          startedAt: string;
          streamCommittedText: string;
          text: string;
          userMessageId: string;
          workerId: string;
      }
    | undefined
> {
    return withTransaction(executor, async (tx) => {
        const leaseExpiresAt = new Date(Date.now() + 45_000).toISOString();
        const claimedAt = new Date().toISOString();
        const [chat] = await tx
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.id, chatId), isNull(chats.archivedAt), isNull(chats.deletedAt)))
            .limit(1);
        if (!chat) return undefined;
        const [active] = await tx
            .select(agentTurnWorkSelection)
            .from(agentTurns)
            .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
            .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "running")))
            .limit(1);
        if (active?.actorUserId) {
            if (
                active.workerId !== workerId &&
                active.leaseExpiresAt &&
                Date.parse(active.leaseExpiresAt) > Date.now()
            )
                return undefined;
            const claimed = await tx
                .update(agentTurns)
                .set({
                    workerId,
                    leaseExpiresAt,
                    startedAt: sql`coalesce(${agentTurns.startedAt}, ${claimedAt})`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentTurns.userMessageId, active.userMessageId),
                        eq(agentTurns.agentUserId, active.agentUserId),
                        eq(agentTurns.status, "running"),
                    ),
                )
                .returning({
                    id: agentTurns.userMessageId,
                    startedAt: agentTurns.startedAt,
                });
            return claimed.length === 1
                ? agentTurnWork({
                      ...active,
                      workerId,
                      leaseExpiresAt,
                      startedAt: claimed[0]!.startedAt ?? claimedAt,
                  })
                : undefined;
        }
        const [next] = await tx
            .select(agentTurnWorkSelection)
            .from(agentTurns)
            .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
            .where(and(eq(agentTurns.chatId, chatId), eq(agentTurns.status, "pending")))
            .orderBy(messages.sequence, agentTurns.agentUserId)
            .limit(1);
        if (!next?.actorUserId) return undefined;
        const claimed = await tx
            .update(agentTurns)
            .set({
                status: "running",
                workerId,
                leaseExpiresAt,
                startedAt: claimedAt,
                updatedAt: sql`CURRENT_TIMESTAMP`,
                lastError: null,
            })
            .where(
                and(
                    eq(agentTurns.userMessageId, next.userMessageId),
                    eq(agentTurns.agentUserId, next.agentUserId),
                    eq(agentTurns.status, "pending"),
                ),
            )
            .returning({
                id: agentTurns.userMessageId,
            });
        return claimed.length === 1
            ? agentTurnWork({
                  ...next,
                  workerId,
                  leaseExpiresAt,
                  startedAt: claimedAt,
              })
            : undefined;
    });
}
