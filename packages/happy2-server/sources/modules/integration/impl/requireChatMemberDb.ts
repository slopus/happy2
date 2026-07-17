import { type DrizzleExecutor } from "../../drizzle.js";
import { IntegrationError } from "../../integrations/types.js";
import { accounts, chatMembers, chats, users } from "../../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Requires an active human account to have a current membership in a live, unarchived chat before an integration posts there.
 * Combining user, account, chat, and membership lifecycle checks prevents slash commands and webhooks from targeting stale relationships.
 */
export async function requireChatMemberDb(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<void> {
    const [row] = await executor
        .select({
            id: chatMembers.chatId,
        })
        .from(chatMembers)
        .innerJoin(chats, eq(chats.id, chatMembers.chatId))
        .innerJoin(users, eq(users.id, chatMembers.userId))
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
                isNull(chats.deletedAt),
                isNull(chats.archivedAt),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    if (!row) throw new IntegrationError("not_found", "Chat was not found");
}
