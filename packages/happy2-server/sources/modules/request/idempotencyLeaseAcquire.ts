import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { idempotencyKeys } from "../schema.js";
import { idempotencyKeyFind, idempotencyTimestamp } from "./impl/idempotencyKey.js";
import type { IdempotencyAcquireInput, IdempotencyAcquireResult } from "./idempotency.js";

/**
 * Creates, replays, waits for, or conditionally takes over an idempotencyKeys lease for one authenticated mutation identity.
 * The transactional state machine guarantees concurrent retries either share the completed response or leave exactly one caller owning execution.
 */
export async function idempotencyLeaseAcquire<TResponse>(
    executor: DrizzleExecutor,
    input: IdempotencyAcquireInput,
): Promise<IdempotencyAcquireResult<TResponse>> {
    return withTransaction(executor, async (tx) => {
        let row = await idempotencyKeyFind(tx, input.storageKey);
        if (row && Date.parse(row.expiresAt) <= input.now) {
            await tx.delete(idempotencyKeys).where(eq(idempotencyKeys.id, row.id));
            row = undefined;
        }
        if (row) {
            if (row.requestHash !== input.fingerprint) return { kind: "conflict" };
            if (row.status === "completed") {
                if (row.responseJson === null) throw new Error("Idempotency response is missing");
                return {
                    kind: "replay",
                    response: JSON.parse(row.responseJson) as TResponse,
                };
            }
            if (row.lockedUntil && Date.parse(row.lockedUntil) > input.now)
                return { kind: "in_progress", retryAt: Date.parse(row.lockedUntil) };
            await tx
                .update(idempotencyKeys)
                .set({
                    status: "in_progress",
                    requestHash: input.fingerprint,
                    responseStatus: null,
                    responseJson: JSON.stringify({ leaseToken: input.leaseToken }),
                    lockedUntil: idempotencyTimestamp(input.leaseExpiresAt),
                    expiresAt: idempotencyTimestamp(input.recordExpiresAt),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(idempotencyKeys.id, row.id));
            return { kind: "acquired" };
        }
        await tx.insert(idempotencyKeys).values({
            id: createId(),
            principalType: "system",
            principalId: "http",
            scope: "request",
            idempotencyKey: input.storageKey,
            requestHash: input.fingerprint,
            status: "in_progress",
            responseJson: JSON.stringify({ leaseToken: input.leaseToken }),
            lockedUntil: idempotencyTimestamp(input.leaseExpiresAt),
            expiresAt: idempotencyTimestamp(input.recordExpiresAt),
        });
        return { kind: "acquired" };
    });
}
