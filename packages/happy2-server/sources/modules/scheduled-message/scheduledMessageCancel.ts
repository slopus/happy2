import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, sql } from "drizzle-orm";
import { areaHint } from "./areaHint.js";

import { scheduledMessages } from "../schema.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Cancels an actor-owned scheduledMessages item only while it has not been claimed or published.
 * The guarded update and sync event give publishers a durable stop state and make cancellation idempotent across client retries.
 */
export async function scheduledMessageCancel(
    executor: DrizzleExecutor,
    actorUserId: string,
    scheduledMessageId: string,
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        const changed = await tx
            .update(scheduledMessages)
            .set({
                status: "cancelled",
                cancelledAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(scheduledMessages.id, scheduledMessageId),
                    eq(scheduledMessages.createdByUserId, actorUserId),
                    eq(scheduledMessages.status, "scheduled"),
                ),
            )
            .returning({
                id: scheduledMessages.id,
            });
        if (changed.length === 0)
            throw new CollaborationError("not_found", "Scheduled message was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "scheduled.cancelled",
            entityId: scheduledMessageId,
            actorUserId,
            targetUserId: actorUserId,
        });
        return areaHint(sequence, "scheduled-messages");
    });
}
