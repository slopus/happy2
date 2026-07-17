import { type AgentEffortContext } from "./impl/agentEffortContext.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentEffortContextDb } from "./impl/agentEffortContextDb.js";
/**
 * Returns an active actor's view of a live agent's effort and chat-ordered Rig session bindings, optionally requiring creator or administrator control.
 * Keeping the optional management check on this public boundary prevents configuration callers from reading a context they are not allowed to change.
 */
export async function agentEffortGetContext(
    executor: DrizzleExecutor,
    actorUserId: string,
    agentUserId: string,
    requireManagement = false,
): Promise<AgentEffortContext> {
    return agentEffortContextDb(executor, actorUserId, agentUserId, requireManagement);
}
