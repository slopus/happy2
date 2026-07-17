import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires a non-system, non-deleted user profile backed by an active, unbanned, non-deleted account.
 * Applying the full product-identity predicate here prevents credential-only or disabled accounts from authorizing chat actions.
 */
export async function userRequireActive(executor: DrizzleExecutor, userId: string): Promise<void> {
    const [row] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, userId),
                isNull(users.systemRole),
                isNull(users.deletedAt),
                isNull(accounts.deletedAt),
                isNull(accounts.bannedAt),
                eq(accounts.active, 1),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "User was not found");
}
