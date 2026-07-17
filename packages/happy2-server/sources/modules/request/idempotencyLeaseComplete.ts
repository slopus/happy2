import { and, eq, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { idempotencyKeys } from "../schema.js";
import {
    idempotencyKeyFind,
    idempotencyLeaseToken,
    idempotencyTimestamp,
} from "./impl/idempotencyKey.js";
import type { IdempotencyCompleteInput } from "./idempotency.js";

/**
 * Stores the terminal HTTP response on idempotencyKeys only when the supplied owner still holds the active lease.
 * This compare-and-complete boundary makes later retries replay the exact result without letting a stale executor overwrite a newer owner.
 */
export async function idempotencyLeaseComplete<TResponse>(
    executor: DrizzleExecutor,
    input: IdempotencyCompleteInput<TResponse>,
): Promise<boolean> {
    return withTransaction(executor, async (tx) => {
        const row = await idempotencyKeyFind(tx, input.storageKey);
        if (!row || row.status !== "in_progress") return false;
        if (idempotencyLeaseToken(row.responseJson) !== input.leaseToken) return false;
        const changed = await tx
            .update(idempotencyKeys)
            .set({
                status: "completed",
                responseJson: JSON.stringify(input.response),
                lockedUntil: null,
                expiresAt: idempotencyTimestamp(input.recordExpiresAt),
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(idempotencyKeys.id, row.id), eq(idempotencyKeys.status, "in_progress")))
            .returning({ id: idempotencyKeys.id });
        return changed.length === 1;
    });
}
