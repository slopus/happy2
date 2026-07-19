import { and, eq, isNull } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, users } from "../schema.js";
import { CollaborationError } from "./types.js";

/**
 * Requires a non-deleted human profile backed by an active, unbanned, non-deleted account.
 * Role and permission administration uses this boundary so agent identities cannot receive human authority records.
 */
export async function userRequireActiveHuman(
    executor: DrizzleExecutor,
    userId: string,
): Promise<void> {
    const [row] = await executor
        .select({ id: users.id })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, userId),
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                isNull(accounts.deletedAt),
                isNull(accounts.bannedAt),
                eq(accounts.active, 1),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "User was not found");
}
