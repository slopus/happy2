import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { accounts, users } from "../../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires a non-deleted administrator profile backed by an active, unbanned, non-deleted account.
 * Applying the complete identity predicate here gives every automation management action the same server-level authority check.
 */
export async function requireAdmin(executor: DrizzleExecutor, userId: string): Promise<void> {
    const [row] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, userId),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
}
