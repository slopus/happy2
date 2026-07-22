import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError } from "../integrations/types.js";
import { users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires a server administrator whose users lifecycle state is active for integration management.
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
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!row) throw new IntegrationError("forbidden", "Server admin permission is required");
}
