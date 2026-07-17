import { and, eq } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { idempotencyKeys } from "../schema.js";
import { idempotencyKeyFind, idempotencyLeaseToken } from "./impl/idempotencyKey.js";

/**
 * Releases an unfinished idempotencyKeys lease only when its owner token matches the caller that abandoned execution.
 * The ownership guard makes the mutation retryable again without clearing a response or lease established by another request.
 */
export async function idempotencyLeaseRelease(
    executor: DrizzleExecutor,
    storageKey: string,
    leaseToken: string,
): Promise<boolean> {
    return withTransaction(executor, async (tx) => {
        const row = await idempotencyKeyFind(tx, storageKey);
        if (
            !row ||
            row.status !== "in_progress" ||
            idempotencyLeaseToken(row.responseJson) !== leaseToken
        )
            return false;
        const changed = await tx
            .delete(idempotencyKeys)
            .where(and(eq(idempotencyKeys.id, row.id), eq(idempotencyKeys.status, "in_progress")))
            .returning({ id: idempotencyKeys.id });
        return changed.length === 1;
    });
}
