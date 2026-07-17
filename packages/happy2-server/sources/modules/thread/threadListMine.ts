import { type DrizzleExecutor } from "../drizzle.js";
import { and, desc, eq, gt, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { type ThreadSummary } from "../chat/types.js";
import { alias } from "drizzle-orm/sqlite-core";

import {
    chatMembers,
    chats,
    messages,
    threadParticipants,
    threads,
    threadUserStates,
} from "../schema.js";

import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";

import { text } from "../chat/text.js";

import { messageGetProjection } from "../message/messageGetProjection.js";
/**
 * Pages visible threads that the user authored, joined, or has per-thread state for.
 * It applies membership and unread filters before projecting roots so inaccessible or deleted chats never leak through the thread inbox.
 */
export async function threadListMine(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        before?: string;
        unreadOnly?: boolean;
        limit: number;
    },
): Promise<{
    threads: ThreadSummary[];
    nextCursor?: string;
}> {
    const root = alias(messages, "root");
    const conditions: SQL[] = [
        or(
            eq(threadUserStates.userId, input.userId),
            eq(threadParticipants.userId, input.userId),
            eq(root.senderUserId, input.userId),
        )!,
        isNull(chats.deletedAt),
        or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`)!,
    ];
    if (input.unreadOnly) conditions.push(gt(sql`coalesce(${threadUserStates.unreadCount}, 0)`, 0));
    if (input.before) {
        const [cursor] = await executor
            .select({
                updatedAt: threads.updatedAt,
            })
            .from(threads)
            .where(eq(threads.rootMessageId, input.before))
            .limit(1);
        if (cursor)
            conditions.push(
                or(
                    lt(threads.updatedAt, cursor.updatedAt),
                    and(
                        eq(threads.updatedAt, cursor.updatedAt),
                        lt(threads.rootMessageId, input.before),
                    ),
                )!,
            );
    }
    const result = await executor
        .selectDistinct({
            root_message_id: threads.rootMessageId,
            reply_count: threads.replyCount,
            participant_count: threads.participantCount,
            last_reply_message_id: threads.lastReplyMessageId,
            last_reply_sequence: threads.lastReplySequence,
            updated_at: threads.updatedAt,
            subscribed: sql<number>`coalesce(${threadUserStates.subscribed}, 0)`,
            unread_count: sql<number>`coalesce(${threadUserStates.unreadCount}, 0)`,
            mention_count: sql<number>`coalesce(${threadUserStates.mentionCount}, 0)`,
        })
        .from(threads)
        .innerJoin(root, eq(root.id, threads.rootMessageId))
        .innerJoin(chats, eq(chats.id, threads.chatId))
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, input.userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .leftJoin(
            threadUserStates,
            and(
                eq(threadUserStates.threadRootMessageId, threads.rootMessageId),
                eq(threadUserStates.userId, input.userId),
            ),
        )
        .leftJoin(
            threadParticipants,
            and(
                eq(threadParticipants.threadRootMessageId, threads.rootMessageId),
                eq(threadParticipants.userId, input.userId),
            ),
        )
        .where(and(...conditions))
        .orderBy(desc(threads.updatedAt), desc(threads.rootMessageId))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const rows = result.slice(0, input.limit);
    const summaries: ThreadSummary[] = [];
    for (const row of rows) {
        const root = await messageGetProjection(executor, input.userId, text(row.root_message_id));
        if (!root) continue;
        summaries.push({
            root,
            replyCount: number(row.reply_count, 0),
            participantCount: number(row.participant_count, 0),
            lastReplyMessageId: optionalText(row.last_reply_message_id),
            lastReplySequence: optionalText(row.last_reply_sequence),
            subscribed: number(row.subscribed, 0) === 1,
            unreadCount: number(row.unread_count, 0),
            mentionCount: number(row.mention_count, 0),
            updatedAt: text(row.updated_at),
        });
    }
    return {
        threads: summaries,
        nextCursor: hasMore ? optionalText(rows.at(-1)?.root_message_id) : undefined,
    };
}
