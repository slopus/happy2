import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires an administrator profile whose users lifecycle state is active.
 * Applying the complete identity predicate here gives every automation management action the same server-level authority check.
 */
export async function requireAdmin(executor: DrizzleExecutor, userId: string): Promise<void> {
    const [row] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
}
