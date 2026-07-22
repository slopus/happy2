import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError } from "../integrations/types.js";
import { users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires a non-deleted human whose users lifecycle state is active for integration use.
 * Keeping product eligibility in this guard prevents inactive profiles and agent rows from invoking otherwise public integration features.
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
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!row) throw new IntegrationError("not_found", "User was not found");
}
