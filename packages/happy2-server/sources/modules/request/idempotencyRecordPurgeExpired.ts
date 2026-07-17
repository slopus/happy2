import { asc, inArray, lte } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { idempotencyKeys } from "../schema.js";
import { idempotencyTimestamp } from "./impl/idempotencyKey.js";

/**
 * Deletes bounded batches of idempotencyKeys whose retention deadline has passed and whose result is no longer replayable.
 * Centralizing expiry cleanup preserves active leases while preventing historical request bodies and responses from growing without limit.
 */
export async function idempotencyRecordPurgeExpired(
    executor: DrizzleExecutor,
    now: number,
    limit = 1_000,
): Promise<number> {
    return withTransaction(executor, async (tx) => {
        const due = await tx
            .select({ id: idempotencyKeys.id })
            .from(idempotencyKeys)
            .where(lte(idempotencyKeys.expiresAt, idempotencyTimestamp(now)))
            .orderBy(asc(idempotencyKeys.expiresAt), asc(idempotencyKeys.id))
            .limit(limit);
        if (due.length === 0) return 0;
        return (
            await tx
                .delete(idempotencyKeys)
                .where(
                    inArray(
                        idempotencyKeys.id,
                        due.map(({ id }) => id),
                    ),
                )
                .returning({ id: idempotencyKeys.id })
        ).length;
    });
}
