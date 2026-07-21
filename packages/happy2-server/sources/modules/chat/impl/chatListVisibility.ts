import { type DrizzleExecutor } from "../../drizzle.js";
import { chatMembers, chats } from "../../schema.js";
import { and, eq, isNull, notExists, or, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";

/** Builds the shared predicate for chats that belong in one user's sidebar list. */
export function chatListCondition(executor: DrizzleExecutor, userId: string) {
    const historicalMember = alias(chatMembers, "historical_chat_member");
    return and(
        isNull(chats.deletedAt),
        or(
            and(eq(chats.kind, "public_channel"), eq(chats.isListed, 1)),
            sql`${chatMembers.userId} IS NOT NULL`,
        ),
        or(
            sql`${chatMembers.userId} IS NOT NULL`,
            notExists(
                executor
                    .select({ userId: historicalMember.userId })
                    .from(historicalMember)
                    .where(
                        and(
                            eq(historicalMember.chatId, chats.id),
                            eq(historicalMember.userId, userId),
                        ),
                    ),
            ),
        ),
    );
}

/** Reports whether a chat's current durable state places it in one user's sidebar list. */
export async function chatAppearsInListDb(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({ id: chats.id })
        .from(chats)
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .where(and(eq(chats.id, chatId), chatListCondition(executor, userId)))
        .limit(1);
    return row !== undefined;
}
