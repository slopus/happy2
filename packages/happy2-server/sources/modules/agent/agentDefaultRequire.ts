import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Reads users to return the one live default product agent without changing durable state.
 * Centralizing the role predicate prevents channel and conversation actions from selecting another executable agent.
 */
export async function agentDefaultRequire(executor: DrizzleExecutor): Promise<string> {
    const [defaultAgent] = await executor
        .select({ id: users.id })
        .from(users)
        .where(
            and(eq(users.agentRole, "default"), eq(users.kind, "agent"), isNull(users.deletedAt)),
        )
        .limit(1);
    if (!defaultAgent) throw new CollaborationError("conflict", "The default agent is unavailable");
    return defaultAgent.id;
}
