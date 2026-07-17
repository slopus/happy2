import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { number } from "../chat/number.js";
import { serverSyncState, syncConsumers } from "../schema.js";

import { userRequireActive } from "../chat/userRequireActive.js";
/**
 * Upserts syncConsumers only after the active user and serverSyncState generation and recoverable range are validated.
 * The max-sequence conflict update prevents a stale device acknowledgement from moving its durable cursor backward.
 */
export async function syncConsumerAcknowledge(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        deviceId: string;
        generation: string;
        sequence: number;
    },
): Promise<void> {
    await userRequireActive(executor, input.userId);
    const [state] = await executor
        .select({
            generation: serverSyncState.generation,
            sequence: serverSyncState.sequence,
            min_recoverable_sequence: serverSyncState.minRecoverableSequence,
        })
        .from(serverSyncState)
        .where(eq(serverSyncState.id, 1));
    if (!state) throw new Error("Sync state has not been initialized");
    if (input.generation !== state.generation)
        throw new CollaborationError("generation_mismatch", "Sync generation has changed");
    if (input.sequence > number(state.sequence))
        throw new CollaborationError("future_state", "Sync cursor is ahead of the server");
    if (input.sequence < number(state.min_recoverable_sequence, 0))
        throw new CollaborationError("conflict", "Sync cursor is no longer recoverable");
    await executor
        .insert(syncConsumers)
        .values({
            id: createId(),
            userId: input.userId,
            deviceId: input.deviceId,
            generation: input.generation,
            sequence: input.sequence,
        })
        .onConflictDoUpdate({
            target: [syncConsumers.userId, syncConsumers.deviceId],
            set: {
                generation: input.generation,
                sequence: sql`max(${syncConsumers.sequence}, excluded.sequence)`,
                lastSeenAt: sql`CURRENT_TIMESTAMP`,
                revokedAt: null,
            },
        });
}
