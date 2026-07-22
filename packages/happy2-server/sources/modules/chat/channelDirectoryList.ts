import { type ChatSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, inArray, isNotNull, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";
import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { chatSelection } from "./impl/chatSelection.js";

/**
 * Lists live public or private channels that are joined, or are currently joinable because they are listed public, voluntarily departed, or eligible through an active parent membership.
 * Archived and admin-only private channels are excluded from unjoined results so every directory action is accepted by channelJoin.
 */
export async function channelDirectoryList(
    executor: DrizzleExecutor,
    userId: string,
): Promise<ChatSummary[]> {
    const result = await executor
        .select(chatSelection)
        .from(chats)
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .leftJoin(
            userChatPreferences,
            and(eq(userChatPreferences.chatId, chats.id), eq(userChatPreferences.userId, userId)),
        )
        .where(
            and(
                isNull(chats.deletedAt),
                inArray(chats.kind, ["public_channel", "private_channel"]),
                or(
                    sql`${chatMembers.userId} IS NOT NULL`,
                    and(
                        isNull(chats.archivedAt),
                        sql`not exists (select 1 from chat_members blocked_member where blocked_member.chat_id = ${chats.id} and blocked_member.user_id = ${userId} and blocked_member.removed_by_user_id is not null)`,
                        or(
                            and(
                                eq(chats.kind, "public_channel"),
                                eq(chats.isListed, 1),
                                isNull(chats.parentChatId),
                            ),
                            and(
                                eq(chats.kind, "private_channel"),
                                isNull(chats.parentChatId),
                                sql`exists (select 1 from chat_members recoverable_member where recoverable_member.chat_id = ${chats.id} and recoverable_member.user_id = ${userId} and recoverable_member.left_at is not null and recoverable_member.removed_by_user_id is null)`,
                            ),
                            and(
                                isNotNull(chats.parentChatId),
                                sql`exists (select 1 from chat_members parent_member join chats parent on parent.id = ${chats.parentChatId} where parent_member.chat_id = ${chats.parentChatId} and parent_member.user_id = ${userId} and parent_member.left_at is null and parent.deleted_at is null and parent.archived_at is null)`,
                            ),
                        ),
                    ),
                ),
            ),
        )
        .orderBy(sql`lower(${chats.name})`, chats.id);
    return result.map(asChat);
}
