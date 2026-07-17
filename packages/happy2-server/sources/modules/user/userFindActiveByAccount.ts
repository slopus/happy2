import { type DrizzleExecutor } from "../drizzle.js";
import { type User } from "./types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";

/**
 * Resolves the active product profile attached to a usable credential account.
 * Keeping account and profile eligibility in one lookup prevents authenticated accounts without active profiles from entering product routes.
 */
export async function userFindActiveByAccount(
    executor: DrizzleExecutor,
    accountId: string,
): Promise<User | undefined> {
    const [row] = await executor
        .select({
            user: users,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.accountId, accountId),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                isNull(users.deletedAt),
            ),
        );
    return row ? asUser(row.user) : undefined;
}
