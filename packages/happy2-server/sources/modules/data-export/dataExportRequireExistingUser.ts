import { type DrizzleExecutor } from "../drizzle.js";
import { OperationsError } from "../operations/types.js";
import { and, eq, isNull } from "drizzle-orm";

import { users } from "../schema.js";
/**
 * Requires the target user profile to exist and not be soft-deleted before a data-export job references it.
 * This guard checks durable target existence without conflating it with current account activity, which historical administrator exports may not require.
 */
export async function dataExportRequireExistingUser(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [row] = await executor
        .select({
            id: users.id,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)));
    if (!row) throw new OperationsError("not_found", "User was not found");
}
