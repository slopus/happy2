import { type AgentEffortContext } from "./impl/agentEffortContext.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentEffortContextDb } from "./impl/agentEffortContextDb.js";
/**
 * Returns an active chat member's view of one live agent's chat-specific effort and Rig session, falling back to the agent-level default when needed.
 * Keeping chat access and binding selection on this boundary prevents callers from reading or changing another conversation's execution setting.
 */
export async function agentEffortGetContext(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    agentUserId: string,
): Promise<AgentEffortContext> {
    return agentEffortContextDb(executor, actorUserId, chatId, agentUserId);
}
