import { CollaborationError } from "../types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { accounts, users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires a non-system, non-deleted user that is either an agent or a human backed by an active, unbanned account.
 * Returning the identity kind lets DM creation validate both participants without imposing human-account rules on agents.
 */
export async function requireActiveIdentityDb(
    executor: DrizzleExecutor,
    userId: string,
): Promise<"human" | "agent"> {
    const [row] = await executor
        .select({
            kind: users.kind,
        })
        .from(users)
        .leftJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(users.id, userId),
                isNull(users.systemRole),
                isNull(users.deletedAt),
                or(
                    eq(users.kind, "agent"),
                    and(
                        eq(users.kind, "human"),
                        isNull(accounts.deletedAt),
                        isNull(accounts.bannedAt),
                        eq(accounts.active, 1),
                    ),
                ),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "User was not found");
    return row.kind as "human" | "agent";
}
