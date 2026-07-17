import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type RigEventCheckpoint } from "./types.js";
import { and, eq, isNull, lt, or, sql } from "drizzle-orm";
import { asRigEventCheckpoint } from "./impl/asRigEventCheckpoint.js";

import { rigEventSyncState } from "../schema.js";

import { rigEventGetCheckpoint } from "./rigEventGetCheckpoint.js";
/**
 * Advances rigEventSyncState to the newest processed durable-event sequence without allowing the cursor to move backward.
 * Persisting this monotonic checkpoint gives event ingestion an exact restart position after a process interruption.
 */
export async function rigEventCheckpoint(
    executor: DrizzleExecutor,
    cursor: number,
    eventCount = 1,
): Promise<RigEventCheckpoint> {
    if (!Number.isSafeInteger(eventCount) || eventCount < 1)
        throw new Error("Rig event checkpoint count must be a positive integer");
    return withTransaction(executor, async (tx) => {
        const [updated] = await tx
            .update(rigEventSyncState)
            .set({
                cursor,
                eventsSinceTrim: sql`${rigEventSyncState.eventsSinceTrim} + ${eventCount}`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(rigEventSyncState.id, 1),
                    or(isNull(rigEventSyncState.cursor), lt(rigEventSyncState.cursor, cursor)),
                ),
            )
            .returning();
        return updated ? asRigEventCheckpoint(updated) : rigEventGetCheckpoint(tx);
    });
}
