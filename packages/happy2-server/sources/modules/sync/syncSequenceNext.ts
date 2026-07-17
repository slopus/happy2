import { type DrizzleTransaction } from "../drizzle.js";
import { eq, sql } from "drizzle-orm";
import { serverSyncState } from "../schema.js";

/**
 * Allocates the next server-wide sync sequence by incrementing the sole serverSyncState row.
 * Requiring the caller's transaction keeps sequence allocation in the same commit as the entity and sync-event changes that consume it.
 */
export async function syncSequenceNext(tx: DrizzleTransaction): Promise<number> {
    const [row] = await tx
        .update(serverSyncState)
        .set({
            sequence: sql`${serverSyncState.sequence} + 1`,
        })
        .where(eq(serverSyncState.id, 1))
        .returning({
            sequence: serverSyncState.sequence,
        });
    if (!row) throw new Error("Sync state has not been initialized");
    return row.sequence;
}
