import { type AgentEffortContext } from "./agentEffortContext.js";
import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { agentRigBindings, chatMembers, users } from "../../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { chatGetAccess } from "../../chat/chatGetAccess.js";

/**
 * Loads one accessible chat's active agent membership, durable effort override, profile default, and bound Rig session.
 * Requiring both memberships and the exact chat-agent binding keeps a chat-level selection isolated from every other conversation using the agent.
 */
export async function agentEffortContextDb(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    agentUserId: string,
): Promise<AgentEffortContext> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new CollaborationError("not_found", "Agent conversation was not found");
    const [agent] = await executor
        .select({
            defaultEffort: users.agentEffort,
            effort: agentRigBindings.effort,
            id: users.id,
            sessionId: agentRigBindings.sessionId,
            username: users.username,
        })
        .from(chatMembers)
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .innerJoin(
            agentRigBindings,
            and(
                eq(agentRigBindings.userId, users.id),
                eq(agentRigBindings.chatId, chatMembers.chatId),
            ),
        )
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                eq(chatMembers.userId, agentUserId),
                isNull(chatMembers.leftAt),
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
            ),
        )
        .limit(1);
    if (!agent)
        throw new CollaborationError(
            "conflict",
            "Agent does not have an active Rig session in this chat",
        );
    return {
        agentUserId: agent.id,
        agentUsername: agent.username,
        chatId,
        ...(agent.defaultEffort ? { defaultEffort: agent.defaultEffort } : {}),
        ...(agent.effort ? { effort: agent.effort } : {}),
        sessionId: agent.sessionId,
    };
}
