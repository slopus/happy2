import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError } from "../integrations/types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires a non-deleted user profile backed by an active, unbanned, non-deleted account for integration use.
 * Keeping account eligibility in this guard prevents disabled credentials from invoking otherwise public integration features.
 */
export async function userRequireIntegrationActive(
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
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    if (!row) throw new IntegrationError("not_found", "User was not found");
}
