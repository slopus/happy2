import { type AutomationRuntime } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { asc, eq, gt, sql } from "drizzle-orm";

import { serverSyncState, syncEvents } from "../schema.js";

import { automationRunEvent } from "./automationRunEvent.js";
/**
 * Runs ordered syncEvents after serverSyncState.automationEventSequence and advances that cursor after each successful sequence.
 * Updating the cursor only after automationRunEvent completes makes restart retry a failed sequence instead of silently skipping it.
 */
export async function automationRunPendingEvents(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    limit = 100,
): Promise<MutationHint[]> {
    const [cursor] = await executor
        .select({
            sequence: serverSyncState.automationEventSequence,
        })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    if (!cursor) throw new Error("Sync state has not been initialized");
    const sequences = await executor
        .selectDistinct({
            sequence: syncEvents.sequence,
        })
        .from(syncEvents)
        .where(gt(syncEvents.sequence, cursor.sequence))
        .orderBy(asc(syncEvents.sequence))
        .limit(limit);
    const hints: MutationHint[] = [];
    for (const row of sequences) {
        hints.push(...(await automationRunEvent(executor, options, row.sequence)));
        await executor
            .update(serverSyncState)
            .set({
                automationEventSequence: sql`max(${serverSyncState.automationEventSequence}, ${row.sequence})`,
            })
            .where(eq(serverSyncState.id, 1));
    }
    return hints;
}
