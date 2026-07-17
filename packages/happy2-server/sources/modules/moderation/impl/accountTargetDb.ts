import { type AccountTarget } from "./accountTarget.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { OperationsError } from "../../operations/types.js";
import { accounts, users } from "../../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Resolves a non-deleted user and account to the identifiers and current ban fields required by moderation actions.
 * Rejecting deleted targets before mutation prevents enforcement records from being attached to an identity that no longer exists operationally.
 */
export async function accountTargetDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<AccountTarget> {
    const [row] = await executor
        .select({
            accountId: accounts.id,
            userId: users.id,
            username: users.username,
            bannedAt: accounts.bannedAt,
            banExpiresAt: accounts.banExpiresAt,
            banReason: accounts.banReason,
            bannedByUserId: accounts.bannedByUserId,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(and(eq(users.id, userId), isNull(users.deletedAt), isNull(accounts.deletedAt)));
    if (!row) throw new OperationsError("not_found", "User was not found");
    return {
        accountId: row.accountId,
        userId: row.userId,
        username: row.username,
        bannedAt: row.bannedAt ?? undefined,
        banExpiresAt: row.banExpiresAt ?? undefined,
        banReason: row.banReason ?? undefined,
        bannedByUserId: row.bannedByUserId ?? undefined,
    };
}
