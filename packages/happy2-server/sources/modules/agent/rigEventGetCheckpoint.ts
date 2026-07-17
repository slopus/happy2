import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type RigEventCheckpoint } from "./types.js";
import { asRigEventCheckpoint } from "./impl/asRigEventCheckpoint.js";
import { eq } from "drizzle-orm";
import { rigEventSyncState } from "../schema.js";
/**
 * Returns the Rig ingestion cursor and lazily creates rigEventSyncState at its initial sequence when absent.
 * Keeping first-read initialization here gives every event consumer the same durable zero point instead of process-local defaults.
 */
export async function rigEventGetCheckpoint(
    executor: DrizzleExecutor,
): Promise<RigEventCheckpoint> {
    return withTransaction(executor, async (tx) => {
        await tx.insert(rigEventSyncState).values({ id: 1 }).onConflictDoNothing();
        const [state] = await tx
            .select()
            .from(rigEventSyncState)
            .where(eq(rigEventSyncState.id, 1))
            .limit(1);
        if (!state) throw new Error("Rig event checkpoint is missing");
        return asRigEventCheckpoint(state);
    });
}
