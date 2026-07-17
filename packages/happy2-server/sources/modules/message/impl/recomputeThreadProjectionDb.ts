import { type DrizzleTransaction } from "../../drizzle.js";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { messages, threadParticipants, threads, threadUserStates } from "../../schema.js";

/**
 * Rebuilds threadParticipants, threads counters, and threadUserStates from the remaining durable replies after a message change.
 * Running inside that change's transaction prevents thread summaries from exposing counts or participants from a different message history.
 */
export async function recomputeThreadProjectionDb(
    tx: DrizzleTransaction,
    threadRootMessageId: string,
    pts: number,
): Promise<void> {
    await tx
        .delete(threadParticipants)
        .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
    const participants = await tx
        .select({
            userId: messages.senderUserId,
            replyCount: sql<number>`count(*)`,
            firstParticipatedAt: sql<string>`min(${messages.createdAt})`,
            lastParticipatedAt: sql<string>`max(${messages.createdAt})`,
        })
        .from(messages)
        .where(
            and(
                eq(messages.threadRootMessageId, threadRootMessageId),
                sql`${messages.senderUserId} IS NOT NULL`,
                isNull(messages.deletedAt),
                or(
                    isNull(messages.expiresAt),
                    sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                ),
            ),
        )
        .groupBy(messages.senderUserId);
    if (participants.length)
        await tx.insert(threadParticipants).values(
            participants.map((p) => ({
                threadRootMessageId,
                userId: p.userId!,
                replyCount: p.replyCount,
                firstParticipatedAt: p.firstParticipatedAt,
                lastParticipatedAt: p.lastParticipatedAt,
            })),
        );
    const active = and(
        eq(messages.threadRootMessageId, threadRootMessageId),
        isNull(messages.deletedAt),
        or(isNull(messages.expiresAt), sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`),
    );
    const [last] = await tx
        .select({
            id: messages.id,
            sequence: messages.sequence,
        })
        .from(messages)
        .where(active)
        .orderBy(desc(messages.sequence))
        .limit(1);
    const [counts] = await tx
        .select({
            replies: sql<number>`count(*)`,
        })
        .from(messages)
        .where(active);
    const [participantCount] = await tx
        .select({
            count: sql<number>`count(*)`,
        })
        .from(threadParticipants)
        .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
    await tx
        .update(threads)
        .set({
            replyCount: counts?.replies ?? 0,
            participantCount: participantCount?.count ?? 0,
            lastReplyMessageId: last?.id ?? null,
            lastReplySequence: last?.sequence ?? 0,
            lastPts: pts,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(threads.rootMessageId, threadRootMessageId));
    await tx
        .update(threadUserStates)
        .set({
            unreadCount: sql`(select count(*) from messages m where m.thread_root_message_id = ${threadRootMessageId} and m.deleted_at is null and (m.expires_at is null or datetime(m.expires_at) > CURRENT_TIMESTAMP) and m.sequence > ${threadUserStates.lastReadSequence} and (m.sender_user_id is null or m.sender_user_id != ${threadUserStates.userId}))`,
            mentionCount: sql`(select count(*) from message_mentions mm join messages m on m.id = mm.message_id where m.thread_root_message_id = ${threadRootMessageId} and m.deleted_at is null and m.sequence > ${threadUserStates.lastReadSequence} and mm.mentioned_user_id = ${threadUserStates.userId})`,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(eq(threadUserStates.threadRootMessageId, threadRootMessageId));
}
