import { type DrizzleExecutor } from "../../drizzle.js";
import { IntegrationError } from "../../integrations/types.js";
import { chatMembers, chats, users } from "../../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

/**
 * Requires an active human users identity to have current membership in a live, unarchived chat before an integration posts there.
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
        .where(
            and(
                eq(chatMembers.chatId, chatId),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
                isNull(chats.deletedAt),
                isNull(chats.archivedAt),
                eq(users.kind, "human"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!row) throw new IntegrationError("not_found", "Chat was not found");
}
