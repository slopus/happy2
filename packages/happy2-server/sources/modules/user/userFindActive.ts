import { type DrizzleExecutor } from "../drizzle.js";
import { type User } from "./types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";

/**
 * Resolves a user only when both the profile and its credential account remain active.
 * This lookup gives authentication and product routes one definition of a usable user identity.
 */
export async function userFindActive(
    executor: DrizzleExecutor,
    id: string,
): Promise<User | undefined> {
    const [row] = await executor
        .select({
            user: users,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, id),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                isNull(users.deletedAt),
            ),
        );
    return row ? asUser(row.user) : undefined;
}
