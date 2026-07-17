import { type DrizzleExecutor } from "../drizzle.js";
import { sql } from "drizzle-orm";
import { users } from "../schema.js";
/**
 * Reports username availability by performing a case-insensitive lookup across every persisted user identity.
 * Including deleted and non-agent rows preserves the global namespace and prevents a new agent from reclaiming an existing spelling variant.
 */
export async function agentUsernameIsAvailable(
    executor: DrizzleExecutor,
    username: string,
): Promise<boolean> {
    const [existing] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .where(sql`lower(${users.username}) = lower(${username})`)
        .limit(1);
    return !existing;
}
