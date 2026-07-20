import { type ChatAccess } from "./chatAccess.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { accounts, chatMembers, chats, messages, userChatPreferences, users } from "../schema.js";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { asChat } from "./impl/asChat.js";

import { chatSelection } from "./impl/chatSelection.js";
import { userIsServerAdminDb } from "./impl/userIsServerAdminDb.js";
import { type ChatRole } from "./types.js";

/**
 * Builds a chat projection for an active account-backed member, public-channel reader, server administrator, or voluntarily departed member.
 * Recursively requiring access through parent-message and parent-channel ancestry prevents a deleted or explicitly revoked ancestor from leaving a nested chat reachable.
 */
export async function chatGetAccess(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
    requireMembership: boolean,
): Promise<ChatAccess | undefined> {
    const isServerAdmin = await userIsServerAdminDb(executor, userId);
    const [recoverableMembership] = requireMembership
        ? []
        : await executor
              .select({ role: chatMembers.role })
              .from(chatMembers)
              .where(
                  and(
                      eq(chatMembers.chatId, chatId),
                      eq(chatMembers.userId, userId),
                      isNotNull(chatMembers.leftAt),
                      isNull(chatMembers.removedByUserId),
                  ),
              )
              .limit(1);
    const isRecoverableMember = recoverableMembership !== undefined;
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
                    : or(
                          eq(chats.kind, "public_channel"),
                          sql`${chatMembers.userId} IS NOT NULL`,
                          ...(isServerAdmin || isRecoverableMember
                              ? [eq(chats.kind, "private_channel")]
                              : []),
                      ),
            ),
        )
        .limit(1);
    if (!row) return undefined;
    const chat = asChat(row);
    let inheritedArchivedAt: string | undefined;
    if (chat.parentMessageId || chat.parentChatId) {
        const parentChatId = chat.parentChatId
            ? chat.parentChatId
            : await executor
                  .select({ chatId: messages.chatId })
                  .from(messages)
                  .where(eq(messages.id, chat.parentMessageId!))
                  .limit(1)
                  .then((rows) => rows[0]?.chatId);
        if (!parentChatId) return undefined;
        const parentAccess = await chatGetAccess(executor, userId, parentChatId, requireMembership);
        if (!parentAccess) return undefined;
        inheritedArchivedAt = parentAccess.archivedAt;
    }
    return {
        ...chat,
        archivedAt: chat.archivedAt ?? inheritedArchivedAt,
        isServerAdmin,
        isRecoverableMember,
        recoverableMembershipRole: recoverableMembership?.role as ChatRole | undefined,
    };
}
