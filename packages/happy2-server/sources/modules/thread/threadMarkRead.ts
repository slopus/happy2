import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { messages, threadUserStates } from "../schema.js";

import { messageGetProjection } from "../message/messageGetProjection.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Advances the actor's threadUserStates read sequence to a validated reply position without allowing the cursor to move backward.
 * Updating unread thread projection and user sync together keeps badges consistent with the exact reply range the user acknowledged.
 */
export async function threadMarkRead(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        threadRootMessageId: string;
        messageId?: string;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const root = await messageGetProjection(tx, input.actorUserId, input.threadRootMessageId);
        if (!root) throw new CollaborationError("not_found", "Thread was not found");
        const [target] = await tx
            .select({
                id: messages.id,
                sequence: messages.sequence,
            })
            .from(messages)
            .where(
                and(
                    eq(messages.threadRootMessageId, input.threadRootMessageId),
                    isNull(messages.deletedAt),
                    ...(input.messageId ? [eq(messages.id, input.messageId)] : []),
                ),
            )
            .orderBy(desc(messages.sequence))
            .limit(1);
        const targetSequence = target?.sequence ?? 0;
        const sequence = await syncSequenceNext(tx);
        await tx
            .insert(threadUserStates)
            .values({
                threadRootMessageId: input.threadRootMessageId,
                userId: input.actorUserId,
                subscribed: 1,
                lastReadMessageId: target?.id ?? null,
                lastReadSequence: targetSequence,
                unreadCount: 0,
                mentionCount: 0,
            })
            .onConflictDoUpdate({
                target: [threadUserStates.threadRootMessageId, threadUserStates.userId],
                set: {
                    lastReadMessageId: target?.id ?? null,
                    lastReadSequence: sql`max(${threadUserStates.lastReadSequence}, ${targetSequence})`,
                    unreadCount: sql`(select count(*) from messages m where m.thread_root_message_id = ${input.threadRootMessageId} and m.sequence > ${targetSequence} and m.deleted_at is null)`,
                    mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.thread_root_message_id = ${input.threadRootMessageId} and m.sequence > ${targetSequence} and mm.mentioned_user_id = ${input.actorUserId} and m.deleted_at is null)`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        await syncEventInsert(tx, {
            sequence,
            kind: "threadPreferences.read",
            entityId: input.threadRootMessageId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "threads"),
        };
    });
}
