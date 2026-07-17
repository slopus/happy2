import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires an administrator profile backed by an active, unbanned, non-deleted account.
 * Keeping account eligibility beside the role check ensures a retained admin flag cannot authorize requests after account revocation.
 */
export async function userRequireServerAdmin(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
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
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                eq(accounts.active, 1),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
}
