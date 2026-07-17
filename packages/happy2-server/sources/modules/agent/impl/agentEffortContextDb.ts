import { type AgentEffortContext } from "./agentEffortContext.js";
import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { agentRigBindings, users } from "../../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { userRequireActive } from "../../chat/userRequireActive.js";
/**
 * Loads a live agent's optional effort and chat-ordered session bindings for an active actor, with an optional creator-or-administrator management check.
 * Keeping that authorization beside the projection prevents effort reads and updates from disagreeing about who controls the agent.
 */
export async function agentEffortContextDb(
    executor: DrizzleExecutor,
    actorUserId: string,
    agentUserId: string,
    requireManagement: boolean,
): Promise<AgentEffortContext> {
    await userRequireActive(executor, actorUserId);
    const [[actor], [agent], bindings] = await Promise.all([
        executor
            .select({
                role: users.role,
            })
            .from(users)
            .where(eq(users.id, actorUserId))
            .limit(1),
        executor
            .select({
                createdByUserId: users.createdByUserId,
                effort: users.agentEffort,
                id: users.id,
            })
            .from(users)
            .where(and(eq(users.id, agentUserId), eq(users.kind, "agent"), isNull(users.deletedAt)))
            .limit(1),
        executor
            .select({
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(eq(agentRigBindings.userId, agentUserId))
            .orderBy(agentRigBindings.chatId),
    ]);
    if (!agent) throw new CollaborationError("not_found", "Agent was not found");
    if (requireManagement && actor?.role !== "admin" && agent.createdByUserId !== actorUserId)
        throw new CollaborationError(
            "forbidden",
            "Only the agent creator or a server admin can change its effort",
        );
    return {
        agentUserId: agent.id,
        ...(agent.effort
            ? {
                  effort: agent.effort,
              }
            : {}),
        sessionIds: bindings.map((binding) => binding.sessionId),
    };
}
