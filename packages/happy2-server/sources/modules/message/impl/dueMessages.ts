import { and, eq, isNull, or, sql } from "drizzle-orm";
import { chats, messages, serverSettings } from "../../schema.js";
import { type DrizzleExecutor } from "../../drizzle.js";

export function dueMessages(executor: DrizzleExecutor, limit: number) {
    return executor
        .select({
            id: messages.id,
            chatId: messages.chatId,
        })
        .from(messages)
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .innerJoin(serverSettings, eq(serverSettings.id, 1))
        .where(
            and(
                isNull(messages.deletedAt),
                or(
                    and(
                        sql`${messages.expiresAt} IS NOT NULL`,
                        sql`datetime(${messages.expiresAt}) <= CURRENT_TIMESTAMP`,
                    ),
                    and(
                        eq(chats.retentionMode, "duration"),
                        sql`${chats.retentionSeconds} IS NOT NULL`,
                        sql`datetime(${messages.createdAt}, '+' || ${chats.retentionSeconds} || ' seconds') <= CURRENT_TIMESTAMP`,
                    ),
                    and(
                        eq(chats.retentionMode, "inherit"),
                        eq(serverSettings.defaultRetentionMode, "duration"),
                        sql`${serverSettings.defaultRetentionSeconds} IS NOT NULL`,
                        sql`datetime(${messages.createdAt}, '+' || ${serverSettings.defaultRetentionSeconds} || ' seconds') <= CURRENT_TIMESTAMP`,
                    ),
                ),
            ),
        )
        .orderBy(sql`coalesce(${messages.expiresAt}, ${messages.createdAt})`, messages.id)
        .limit(limit);
}
