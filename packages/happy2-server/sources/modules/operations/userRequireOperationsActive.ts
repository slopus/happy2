import { type DrizzleExecutor } from "../drizzle.js";
import { OperationsError } from "./types.js";
import { users } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Returns the identifier and role of a human whose users lifecycle state is active.
 * Operations actions reuse this projection so self-service and administrator flows share one identity-eligibility boundary.
 */
export async function userRequireOperationsActive(executor: DrizzleExecutor, userId: string) {
    const [row] = await executor
        .select({
            id: users.id,
            role: users.role,
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
    if (!row) throw new OperationsError("not_found", "User was not found");
    return row;
}
