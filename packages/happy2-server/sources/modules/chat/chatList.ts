import { type ChatSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, asc, desc, eq, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";

import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { chatSelection } from "./impl/chatSelection.js";

/**
 * Lists live joined chats plus listed public channels, placing starred chats in user order before recently updated conversations.
 * Joining user preferences into the projection gives the sidebar one deterministic ordering without exposing unlisted unjoined chats.
 */
export async function chatList(executor: DrizzleExecutor, userId: string): Promise<ChatSummary[]> {
    const rows = await executor
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
                isNull(chats.parentMessageId),
                or(
                    and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
                    sql`${chatMembers.userId} IS NOT NULL`,
                ),
            ),
        )
        .orderBy(
            desc(sql`coalesce(${userChatPreferences.starred}, 0)`),
            asc(
                sql`case when ${userChatPreferences.starred} = 1 then ${userChatPreferences.sortOrder} end`,
            ),
            desc(chats.updatedAt),
            asc(chats.id),
        );
    return rows.map(asChat);
}
