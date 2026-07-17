import { type DrizzleExecutor } from "../drizzle.js";
import { eq } from "drizzle-orm";
import { serverSyncState } from "../schema.js";
/**
 * Snapshots the current global sequence into a setup-related realtime reconciliation hint.
 * The supplied areas are copied so callers can safely publish the result without sharing mutable input state.
 */
export async function setupGetCurrentSyncHint(
    executor: DrizzleExecutor,
    areas: readonly string[],
): Promise<{
    sequence: string;
    chats: [];
    areas: string[];
}> {
    const [state] = await executor
        .select({
            sequence: serverSyncState.sequence,
        })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    if (!state) throw new Error("Sync state is not initialized");
    return {
        sequence: String(state.sequence),
        chats: [],
        areas: [...areas],
    };
}
