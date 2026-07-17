import { CollaborationError, type MutationHint, type NotificationLevel } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { areaHint } from "../chat/areaHint.js";
import { eq, sql } from "drizzle-orm";

import { threads, threadUserStates } from "../schema.js";

import { messageGetProjection } from "../message/messageGetProjection.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Upserts the actor's explicit subscription choice in threadUserStates for an accessible thread root.
 * The synchronized personal-state transition makes future reply notification routing use the same preference every client displays.
 */
export async function threadSubscriptionSet(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        threadRootMessageId: string;
        subscribed: boolean;
        notificationLevel?: NotificationLevel;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const root = await messageGetProjection(tx, input.actorUserId, input.threadRootMessageId);
        if (!root || root.deletedAt)
            throw new CollaborationError("not_found", "Thread was not found");
        const [thread] = await tx
            .select({
                id: threads.rootMessageId,
            })
            .from(threads)
            .where(eq(threads.rootMessageId, input.threadRootMessageId))
            .limit(1);
        if (!thread) throw new CollaborationError("not_found", "Thread was not found");
        const sequence = await syncSequenceNext(tx);
        await tx
            .insert(threadUserStates)
            .values({
                threadRootMessageId: input.threadRootMessageId,
                userId: input.actorUserId,
                subscribed: input.subscribed ? 1 : 0,
                notificationLevel: input.notificationLevel ?? "all",
            })
            .onConflictDoUpdate({
                target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                set: {
                    subscribed: input.subscribed ? 1 : 0,
                    ...(input.notificationLevel === undefined
                        ? {}
                        : {
                              notificationLevel: input.notificationLevel,
                          }),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        await syncEventInsert(tx, {
            sequence,
            kind: "threadPreferences.subscriptionChanged",
            entityId: input.threadRootMessageId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "threads"),
        };
    });
}
