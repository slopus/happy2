import { type ChatBookmarkSummary, CollaborationError } from "./types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { chatBookmarks } from "../schema.js";
import { eq } from "drizzle-orm";
import { number } from "./number.js";
import { optionalText } from "./optionalText.js";
import { text } from "./text.js";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Lists every bookmark in an accessible chat by explicit sort order, preserving its message, file, URL, emoji, and creator references.
 * Rejecting inaccessible chats before reading bookmarks prevents their titles and targets from leaking private conversation structure.
 */
export async function chatBookmarkList(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatBookmarkSummary[]> {
    if (!(await chatGetAccess(executor, userId, chatId, false)))
        throw new CollaborationError("not_found", "Chat was not found");
    const result = await executor
        .select({
            id: chatBookmarks.id,
            kind: chatBookmarks.kind,
            title: chatBookmarks.title,
            url: chatBookmarks.url,
            message_id: chatBookmarks.messageId,
            file_id: chatBookmarks.fileId,
            emoji: chatBookmarks.emoji,
            created_by_user_id: chatBookmarks.createdByUserId,
            sort_order: chatBookmarks.sortOrder,
            created_at: chatBookmarks.createdAt,
        })
        .from(chatBookmarks)
        .where(eq(chatBookmarks.chatId, chatId))
        .orderBy(chatBookmarks.sortOrder, chatBookmarks.id);
    return result.map((row) => ({
        id: text(row.id),
        chatId,
        kind: text(row.kind) as ChatBookmarkSummary["kind"],
        title: text(row.title),
        url: optionalText(row.url),
        messageId: optionalText(row.message_id),
        fileId: optionalText(row.file_id),
        emoji: optionalText(row.emoji),
        createdByUserId: optionalText(row.created_by_user_id),
        sortOrder: number(row.sort_order, 0),
        createdAt: text(row.created_at),
    }));
}
