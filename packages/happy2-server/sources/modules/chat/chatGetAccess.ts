import { type ChatAccess } from "./chatAccess.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, chatMembers, chats, userChatPreferences, users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";

import { chatSelection } from "./impl/chatSelection.js";

/**
 * Builds a chat projection for an active account-backed user when membership is present or, if allowed, the chat is a live public channel.
 * Including membership preferences and server-admin status in this shared predicate keeps authorization and the UI-visible chat state aligned.
 */
export async function chatGetAccess(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
    requireMembership: boolean,
): Promise<ChatAccess | undefined> {
    const [row] = await executor
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
        .innerJoin(users, eq(users.id, userId))
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(chats.id, chatId),
                isNull(chats.deletedAt),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
                requireMembership
                    ? sql`${chatMembers.userId} IS NOT NULL`
                    : or(eq(chats.kind, "public_channel"), sql`${chatMembers.userId} IS NOT NULL`),
            ),
        )
        .limit(1);
    if (!row) return undefined;
    const [actor] = await executor
        .select({
            role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
    return {
        ...asChat(row),
        isServerAdmin: actor?.role === "admin",
    };
}
