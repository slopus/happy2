import { type DrizzleExecutor } from "../drizzle.js";
import { type RigEventCheckpoint } from "./types.js";
import { and, eq, sql } from "drizzle-orm";
import { asRigEventCheckpoint } from "./impl/asRigEventCheckpoint.js";

import { rigEventSyncState } from "../schema.js";

import { rigEventGetCheckpoint } from "./rigEventGetCheckpoint.js";
/**
 * Marks rigEventSyncState trimmed through a boundary the stored cursor has already reached and resets its trim counters.
 * Returning the current checkpoint when the cursor is behind prevents cleanup from acknowledging Rig events that have not been durably observed.
 */
export async function rigEventMarkTrimmed(
    executor: DrizzleExecutor,
    through: number,
): Promise<RigEventCheckpoint> {
    const [updated] = await executor
        .update(rigEventSyncState)
        .set({
            trimmedThrough: through,
            eventsSinceTrim: 0,
            lastTrimmedAt: sql`CURRENT_TIMESTAMP`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(rigEventSyncState.id, 1), sql`${rigEventSyncState.cursor} >= ${through}`))
        .returning();
    return updated ? asRigEventCheckpoint(updated) : rigEventGetCheckpoint(executor);
}
