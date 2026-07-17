import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { notifications } from "../schema.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Marks one owned notifications row or the actor's eligible notification set read at a single timestamp.
 * Advancing notification sync state with the update prevents unread badges from being recomputed from an older personal cursor.
 */
export async function notificationMarkRead(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        notificationIds?: string[];
        all?: boolean;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const ids = [...new Set(input.notificationIds ?? [])];
        if (!input.all && ids.length === 0)
            throw new CollaborationError("invalid", "Notification ids or all=true is required");
        const sequence = await syncSequenceNext(tx);
        const conditions = [
            eq(notifications.userId, input.actorUserId),
            isNull(notifications.readAt),
        ];
        if (!input.all) conditions.push(inArray(notifications.id, ids));
        await tx
            .update(notifications)
            .set({
                readAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(...conditions));
        await syncEventInsert(tx, {
            sequence,
            kind: "notification.read",
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "notifications"),
        };
    });
}
