import { type DrizzleTransaction } from "../../drizzle.js";
import { and, desc, eq, isNull, or, sql } from "drizzle-orm";

import { messages, threadParticipants, threads, threadUserStates } from "../../schema.js";

/**
 * Rebuilds threadParticipants, threads counters, and threadUserStates after moderation removes a root or reply.
 * Sharing the removal transaction keeps participant lists and unread thread summaries derived from the exact surviving message set.
 */
export async function recomputeThreadProjection(
    tx: DrizzleTransaction,
    threadRootMessageId: string,
    pts: number,
): Promise<void> {
    await tx
        .delete(threadParticipants)
        .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
    const participantRows = await tx
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
    if (participantRows.length)
        await tx.insert(threadParticipants).values(
            participantRows.map((row) => ({
                threadRootMessageId,
                userId: row.userId!,
                replyCount: row.replyCount,
                firstParticipatedAt: row.firstParticipatedAt,
                lastParticipatedAt: row.lastParticipatedAt,
            })),
        );
    const activeReplies = and(
        eq(messages.threadRootMessageId, threadRootMessageId),
        isNull(messages.deletedAt),
        or(isNull(messages.expiresAt), sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`),
    );
    const [lastReply] = await tx
        .select({
            id: messages.id,
            sequence: messages.sequence,
        })
        .from(messages)
        .where(activeReplies)
        .orderBy(desc(messages.sequence))
        .limit(1);
    const [replyCount] = await tx
        .select({
            count: sql<number>`count(*)`,
        })
        .from(messages)
        .where(activeReplies);
    const [participantCount] = await tx
        .select({
            count: sql<number>`count(*)`,
        })
        .from(threadParticipants)
        .where(eq(threadParticipants.threadRootMessageId, threadRootMessageId));
    await tx
        .update(threads)
        .set({
            replyCount: replyCount?.count ?? 0,
            participantCount: participantCount?.count ?? 0,
            lastReplyMessageId: lastReply?.id ?? null,
            lastReplySequence: lastReply?.sequence ?? 0,
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
