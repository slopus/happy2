import { type ChatSummary } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";
import { chatMembers, chats, userChatPreferences } from "../schema.js";
import { chatSelection } from "./impl/chatSelection.js";

/**
 * Lists non-deleted public or private channels that are publicly listed or joined by the user, ordered case-insensitively by name.
 * The directory includes private channels only through active membership so discovery cannot reveal unjoined private projects.
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
                    and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
                    sql`${chatMembers.userId} IS NOT NULL`,
                ),
            ),
        )
        .orderBy(sql`lower(${chats.name})`, chats.id);
    return result.map(asChat);
}
