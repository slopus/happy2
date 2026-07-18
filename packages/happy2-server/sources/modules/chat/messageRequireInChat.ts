import { CollaborationError } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { messages } from "../schema.js";

/**
 * Requires a non-deleted, non-expired message to belong to the specified chat and returns its identity.
 * This structural guard lets quote and pin mutations reject cross-chat or stale references before changing durable state.
 */
export async function messageRequireInChat(
    executor: DrizzleExecutor,
    messageId: string,
    chatId: string,
) {
    const [row] = await executor
        .select({
            id: messages.id,
            chatId: messages.chatId,
        })
        .from(messages)
        .where(
            and(
                eq(messages.id, messageId),
                eq(messages.chatId, chatId),
                isNull(messages.deletedAt),
                or(
                    isNull(messages.expiresAt),
                    sql`datetime(${messages.expiresAt}) > CURRENT_TIMESTAMP`,
                ),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "Referenced message was not found");
    return row;
}
