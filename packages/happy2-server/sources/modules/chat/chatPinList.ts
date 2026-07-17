import { type ChatPinSummary, CollaborationError } from "./types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { chatPins } from "../schema.js";
import { desc, eq } from "drizzle-orm";

import { optionalText } from "./optionalText.js";
import { text } from "./text.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { messageGetProjection } from "../message/messageGetProjection.js";
/**
 * Lists pins newest first for an accessible chat and expands only messages still visible to the requesting user.
 * Skipping stale or inaccessible message projections prevents a surviving pin row from bypassing deletion, expiry, or chat authorization.
 */
export async function chatPinList(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatPinSummary[]> {
    if (!(await chatGetAccess(executor, userId, chatId, false)))
        throw new CollaborationError("not_found", "Chat was not found");
    const result = await executor
        .select({
            id: chatPins.id,
            message_id: chatPins.messageId,
            pinned_by_user_id: chatPins.pinnedByUserId,
            created_at: chatPins.createdAt,
        })
        .from(chatPins)
        .where(eq(chatPins.chatId, chatId))
        .orderBy(desc(chatPins.createdAt), desc(chatPins.id));
    const pins: ChatPinSummary[] = [];
    for (const row of result) {
        const message = await messageGetProjection(executor, userId, text(row.message_id));
        if (!message) continue;
        pins.push({
            id: text(row.id),
            chatId,
            message,
            pinnedByUserId: optionalText(row.pinned_by_user_id),
            createdAt: text(row.created_at),
        });
    }
    return pins;
}
