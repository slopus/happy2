import { type ChatSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";
import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { chatSelection } from "./impl/chatSelection.js";
import { userIsServerAdminDb } from "./impl/userIsServerAdminDb.js";

/**
 * Lists non-deleted public or private channels that are publicly listed, joined by the user, or recoverable by the user, ordered case-insensitively by name.
 * Server administrators and voluntarily departed members may find top-level private channels while nested channels remain discoverable through their parent hierarchy.
 */
export async function channelDirectoryList(
    executor: DrizzleExecutor,
    userId: string,
): Promise<ChatSummary[]> {
    const isServerAdmin = await userIsServerAdminDb(executor, userId);
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
                    and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
                    sql`${chatMembers.userId} IS NOT NULL`,
                    ...(isServerAdmin
                        ? [and(eq(chats.kind, "private_channel"), isNull(chats.parentChatId))]
                        : []),
                    and(
                        eq(chats.kind, "private_channel"),
                        isNull(chats.parentChatId),
                        sql`exists (select 1 from chat_members recoverable_member where recoverable_member.chat_id = ${chats.id} and recoverable_member.user_id = ${userId} and recoverable_member.left_at is not null and recoverable_member.removed_by_user_id is null)`,
                    ),
                ),
            ),
        )
        .orderBy(sql`lower(${chats.name})`, chats.id);
    return result.map(asChat);
}
