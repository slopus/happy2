import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError } from "../integrations/types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires a server-administrator profile backed by an active, unbanned, non-deleted account for integration management.
 * This is a server-wide role check, not per-integration ownership, so every management action applies the same explicit authority model.
 */
export async function userRequireIntegrationAdmin(
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
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    if (!row) throw new IntegrationError("forbidden", "Server admin permission is required");
}
