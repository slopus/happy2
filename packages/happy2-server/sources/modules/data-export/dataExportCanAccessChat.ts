import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";
import { chatMembers, chats } from "../schema.js";

/**
 * Reports whether a non-deleted chat is publicly visible or has an active membership for the export requester.
 * Applying visibility at artifact-build time prevents a previously authorized export from reading a private chat after membership is removed.
 */
export async function dataExportCanAccessChat(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, chats.id),
                eq(chatMembers.userId, userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .where(
            and(
                eq(chats.id, chatId),
                isNull(chats.deletedAt),
                or(eq(chats.visibility, "public"), sql`${chatMembers.userId} IS NOT NULL`),
            ),
        )
        .limit(1);
    return Boolean(row);
}
