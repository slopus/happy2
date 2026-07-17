import { type DrizzleTransaction } from "../drizzle.js";
import { serverSyncState } from "../schema.js";
import { eq, sql } from "drizzle-orm";

/**
 * Allocates a sync sequence and refreshes serverSyncState.updatedAt for moderation-origin changes.
 * This transaction-only variant preserves the operations workflow's timestamp side effect without adding it to sequence allocations that never had that contract.
 */
export async function syncSequenceNextWithTimestamp(tx: DrizzleTransaction): Promise<number> {
    const [row] = await tx
        .update(serverSyncState)
        .set({
            sequence: sql`${serverSyncState.sequence} + 1`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(serverSyncState.id, 1))
        .returning({
            sequence: serverSyncState.sequence,
        });
    if (!row) throw new Error("Sync state has not been initialized");
    return row.sequence;
}
