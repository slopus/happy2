import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq, isNull } from "drizzle-orm";

import { users } from "../../schema.js";
/**
 * Returns the non-deleted agent identity reserved for Happy's service role and fails when bootstrap has not initialized it.
 * Centralizing this singleton lookup prevents default-channel workflows from silently substituting an ordinary agent.
 */
export async function requireHappyServiceAgentDb(executor: DrizzleExecutor): Promise<string> {
    const [happy] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .where(
            and(eq(users.systemRole, "service"), eq(users.kind, "agent"), isNull(users.deletedAt)),
        )
        .limit(1);
    if (!happy) throw new Error("Happy service agent is not initialized");
    return happy.id;
}
