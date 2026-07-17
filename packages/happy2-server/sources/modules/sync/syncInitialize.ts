import { type DrizzleExecutor } from "../drizzle.js";
import { createId } from "@paralleldrive/cuid2";
import { rigEventSyncState, serverSyncState } from "../schema.js";

/**
 * Inserts the singleton serverSyncState and rigEventSyncState rows when either durable cursor is absent.
 * Idempotent conflict handling lets repeated startup converge without resetting an existing generation, sequence, or Rig checkpoint.
 */
export async function syncInitialize(executor: DrizzleExecutor): Promise<void> {
    await executor
        .insert(serverSyncState)
        .values({
            id: 1,
            generation: createId(),
            sequence: 0,
        })
        .onConflictDoNothing();
    await executor
        .insert(rigEventSyncState)
        .values({
            id: 1,
        })
        .onConflictDoNothing();
}
