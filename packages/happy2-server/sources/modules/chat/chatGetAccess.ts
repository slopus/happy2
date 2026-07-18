import { type ChatAccess } from "./chatAccess.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, chatMembers, chats, messages, userChatPreferences, users } from "../schema.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";

import { chatSelection } from "./impl/chatSelection.js";

/**
 * Builds a chat projection for an active account-backed user when membership is present or, if allowed, the chat and every parent are live public channels.
 * Recursively requiring access through parent-message ancestry prevents a deleted or revoked ancestor from leaving a deeper thread reachable.
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
    const chat = asChat(row);
    let inheritedArchivedAt: string | undefined;
    if (chat.parentMessageId) {
        const [parent] = await executor
            .select({ chatId: messages.chatId })
            .from(messages)
            .where(eq(messages.id, chat.parentMessageId))
            .limit(1);
        if (!parent) return undefined;
        const parentAccess = await chatGetAccess(
            executor,
            userId,
            parent.chatId,
            requireMembership,
        );
        if (!parentAccess) return undefined;
        inheritedArchivedAt = parentAccess.archivedAt;
    }
    const [actor] = await executor
        .select({
            role: users.role,
        })
        .from(users)
        .where(and(eq(users.id, userId), isNull(users.deletedAt)))
        .limit(1);
    return {
        ...chat,
        archivedAt: chat.archivedAt ?? inheritedArchivedAt,
        isServerAdmin: actor?.role === "admin",
    };
}
