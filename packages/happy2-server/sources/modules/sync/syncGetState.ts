import { type DrizzleExecutor } from "../drizzle.js";
import { type SyncState } from "../chat/types.js";
import { eq } from "drizzle-orm";
import { serverSyncState } from "../schema.js";
import { syncState } from "./impl/syncState.js";
/**
 * Reads the server's current sync generation and sequence cursor.
 * This projection is the common durable checkpoint used to bound difference requests and realtime reconciliation.
 */
export async function syncGetState(executor: DrizzleExecutor): Promise<SyncState> {
    const [state] = await executor
        .select({
            generation: serverSyncState.generation,
            sequence: serverSyncState.sequence,
        })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    if (!state) throw new Error("Sync state has not been initialized");
    return syncState(state);
}
