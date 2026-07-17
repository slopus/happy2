import { type DrizzleExecutor } from "../drizzle.js";
import { type NotificationSummary } from "../chat/types.js";
import { and, desc, eq, isNull, lt, or, sql, type SQL } from "drizzle-orm";

import { asNotification } from "./impl/asNotification.js";

import { notifications } from "../schema.js";
import { optionalText } from "../chat/optionalText.js";

/**
 * Pages one user's unexpired notifications newest first, optionally limiting the result to unread rows and continuing before a notification cursor.
 * Applying recipient, expiry, and read filters in the query prevents stale badge items from entering the client projection.
 */
export async function notificationList(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        before?: string;
        unreadOnly?: boolean;
        limit: number;
    },
): Promise<{
    notifications: NotificationSummary[];
    nextCursor?: string;
}> {
    const conditions: SQL[] = [
        eq(notifications.userId, input.userId),
        or(
            isNull(notifications.expiresAt),
            sql`datetime(${notifications.expiresAt}) > CURRENT_TIMESTAMP`,
        )!,
    ];
    if (input.unreadOnly) conditions.push(isNull(notifications.readAt));
    if (input.before) {
        const [cursor] = await executor
            .select({
                createdAt: notifications.createdAt,
            })
            .from(notifications)
            .where(eq(notifications.id, input.before))
            .limit(1);
        if (cursor)
            conditions.push(
                or(
                    lt(notifications.createdAt, cursor.createdAt),
                    and(
                        eq(notifications.createdAt, cursor.createdAt),
                        lt(notifications.id, input.before),
                    ),
                )!,
            );
    }
    const result = await executor
        .select({
            id: notifications.id,
            kind: notifications.kind,
            chat_id: notifications.chatId,
            message_id: notifications.messageId,
            thread_root_message_id: notifications.threadRootMessageId,
            actor_user_id: notifications.actorUserId,
            read_at: notifications.readAt,
            created_at: notifications.createdAt,
        })
        .from(notifications)
        .where(and(...conditions))
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const rows = result.slice(0, input.limit);
    return {
        notifications: rows.map(asNotification),
        nextCursor: hasMore ? optionalText(rows.at(-1)?.id) : undefined,
    };
}
