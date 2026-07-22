import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires a non-deleted human whose users lifecycle state is active.
 * Applying the full product-identity predicate here prevents credential-only, disabled, or accountless agent rows from authorizing chat actions.
 */
export async function userRequireActive(executor: DrizzleExecutor, userId: string): Promise<void> {
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
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "User was not found");
}
