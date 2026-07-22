import { and, eq, isNull, or } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { users } from "../schema.js";
import { CollaborationError } from "./types.js";

/**
 * Requires a non-deleted human whose users lifecycle state is active.
 * Role and permission administration uses this boundary so agent identities cannot receive human authority records.
 */
export async function userRequireActiveHuman(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [row] = await executor
        .select({ id: users.id })
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
