import { type DrizzleTransaction } from "../../drizzle.js";
import { type OperationsSyncHint } from "../../operations/types.js";
import { eq } from "drizzle-orm";
import { syncEvents, users } from "../../schema.js";

import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
/**
 * Advances the target users sync sequence and inserts the corresponding targeted syncEvents notification for an operations change.
 * Requiring the moderation transaction prevents product identity state from changing without a reconciliation hint for affected clients.
 */
export async function syncUserMutation(
    tx: DrizzleTransaction,
    actorUserId: string | undefined,
    targetUserId: string,
    kind: string,
): Promise<OperationsSyncHint> {
    const sequence = await syncSequenceNextWithTimestamp(tx);
    await tx
        .update(users)
        .set({
            syncSequence: sequence,
        })
        .where(eq(users.id, targetUserId));
    await tx.insert(syncEvents).values({
        sequence,
        kind,
        entityId: targetUserId,
        actorUserId,
        targetUserId,
    });
    return {
        sequence: String(sequence),
        chats: [],
        areas: ["users"],
    };
}
