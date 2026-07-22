import { CollaborationError } from "../types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires a non-deleted identity whose authoritative users lifecycle state is active.
 * Returning the identity kind lets DM creation validate both participants without imposing human-account rules on agents.
 */
export async function requireActiveIdentityDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<"human" | "agent"> {
    const [row] = await executor
        .select({
            kind: users.kind,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt), eq(users.active, 1)))
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "User was not found");
    return row.kind as "human" | "agent";
}
