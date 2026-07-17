import { type DrizzleExecutor } from "../drizzle.js";
import { OperationsError } from "./types.js";
import { accounts, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Returns the identifier and role of a non-deleted profile backed by an active, unbanned, non-deleted account.
 * Operations actions reuse this projection so self-service and administrator flows share the same account-eligibility boundary.
 */
export async function userRequireOperationsActive(executor: DrizzleExecutor, userId: string) {
    const [row] = await executor
        .select({
            id: users.id,
            role: users.role,
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
    if (!row) throw new OperationsError("not_found", "User was not found");
    return row;
}
