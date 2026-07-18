import { type ChatSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, desc, eq, gt, isNotNull, isNull, lt, or, sql, type SQL } from "drizzle-orm";
import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";

/**
 * Pages followed child chats visible to the active user, using ordinary chat unread state and parent-message identity as the thread boundary.
 * Filtering before projection keeps unfollowed or inaccessible descendants out of the thread inbox without inventing a second thread state model.
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
    threads: ChatSummary[];
    nextCursor?: string;
}> {
    const conditions: SQL[] = [
        isNotNull(chats.parentMessageId),
        isNull(chats.deletedAt),
        eq(userChatPreferences.followed, 1),
        or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`)!,
    ];
    if (input.unreadOnly) conditions.push(gt(sql`coalesce(${chatMembers.unreadCount}, 0)`, 0));
    if (input.before) {
        const [cursor] = await executor
            .select({ updatedAt: chats.updatedAt })
            .from(chats)
            .where(eq(chats.id, input.before))
            .limit(1);
        if (cursor)
            conditions.push(
                or(
                    lt(chats.updatedAt, cursor.updatedAt),
                    and(eq(chats.updatedAt, cursor.updatedAt), lt(chats.id, input.before)),
                )!,
            );
    }
    const result = await executor
        .select({ id: chats.id })
        .from(chats)
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, input.userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .innerJoin(
            userChatPreferences,
            and(
                eq(userChatPreferences.chatId, chats.id),
                eq(userChatPreferences.userId, input.userId),
            ),
        )
        .where(and(...conditions))
        .orderBy(desc(chats.updatedAt), desc(chats.id))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const rows = result.slice(0, input.limit);
    const threads: ChatSummary[] = [];
    for (const row of rows) {
        const chat = await chatGetAccess(executor, input.userId, row.id, false);
        if (chat) threads.push(chat);
    }
    return {
        threads,
        nextCursor: hasMore ? rows.at(-1)?.id : undefined,
    };
}
