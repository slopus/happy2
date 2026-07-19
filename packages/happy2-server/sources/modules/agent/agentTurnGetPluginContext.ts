import { and, eq, isNull, or } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentTurns, messageMentions, messages, users } from "../schema.js";

export interface AgentPluginReferencedUser {
    id: string;
    username: string;
    firstName: string;
    lastName?: string;
    kind: "human" | "agent";
    triggeredTurn: boolean;
}

/**
 * Resolves the exact running agent turn, its triggering sender, and every concrete user mention recorded on that message.
 * This read-only boundary keeps plugin capabilities tied to durable turn provenance instead of inferring authority from a reusable Rig session.
 */
export async function agentTurnGetPluginContext(
    executor: DrizzleExecutor,
    input: { runId: string; sessionId: string },
): Promise<
    | {
          agentUserId: string;
          chatId: string;
          triggeredByUserId: string;
          users: AgentPluginReferencedUser[];
      }
    | undefined
> {
    const turns = await executor
        .select({
            agentUserId: agentTurns.agentUserId,
            chatId: agentTurns.chatId,
            userMessageId: agentTurns.userMessageId,
            triggeredByUserId: messages.senderUserId,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            kind: users.kind,
        })
        .from(agentTurns)
        .innerJoin(messages, eq(messages.id, agentTurns.userMessageId))
        .innerJoin(users, eq(users.id, messages.senderUserId))
        .where(
            and(
                eq(agentTurns.sessionId, input.sessionId),
                eq(agentTurns.status, "running"),
                or(isNull(agentTurns.runId), eq(agentTurns.runId, input.runId)),
            ),
        )
        .limit(2);
    if (turns.length !== 1) return undefined;
    const turn = turns[0]!;
    if (!turn.triggeredByUserId || (turn.kind !== "human" && turn.kind !== "agent"))
        return undefined;
    const mentioned = await executor
        .select({
            id: users.id,
            username: users.username,
            firstName: users.firstName,
            lastName: users.lastName,
            kind: users.kind,
        })
        .from(messageMentions)
        .innerJoin(users, eq(users.id, messageMentions.mentionedUserId))
        .where(
            and(
                eq(messageMentions.messageId, turn.userMessageId),
                eq(messageMentions.kind, "user"),
            ),
        )
        .orderBy(messageMentions.startOffset, messageMentions.id);
    const referenced = new Map<string, AgentPluginReferencedUser>();
    referenced.set(turn.triggeredByUserId, {
        id: turn.triggeredByUserId,
        username: turn.username,
        firstName: turn.firstName,
        ...(turn.lastName ? { lastName: turn.lastName } : {}),
        kind: turn.kind,
        triggeredTurn: true,
    });
    for (const user of mentioned) {
        if (user.kind !== "human" && user.kind !== "agent") continue;
        const existing = referenced.get(user.id);
        referenced.set(user.id, {
            id: user.id,
            username: user.username,
            firstName: user.firstName,
            ...(user.lastName ? { lastName: user.lastName } : {}),
            kind: user.kind,
            triggeredTurn: existing?.triggeredTurn ?? false,
        });
    }
    return {
        agentUserId: turn.agentUserId,
        chatId: turn.chatId,
        triggeredByUserId: turn.triggeredByUserId,
        users: [...referenced.values()],
    };
}
