import { type DrizzleExecutor } from "../drizzle.js";
import { type User } from "./types.js";
import { users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { asUser } from "./impl/asUser.js";

/**
 * Resolves the active product profile attached to an authenticated account identifier.
 * Credential eligibility is checked by authentication; product eligibility is authoritative on users.active.
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
        .where(and(eq(users.accountId, accountId), eq(users.active, 1), isNull(users.deletedAt)));
    return row ? asUser(row.user) : undefined;
}
