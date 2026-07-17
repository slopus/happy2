import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "./chatHint.js";
import { chats } from "../schema.js";
import { eq, sql } from "drizzle-orm";

import { advanceChat } from "./impl/advanceChat.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Stores the normalized topic on the authorized chats channel and records the resulting channel change point.
 * Treating topic text as a channel mutation keeps header state and change history ordered with messages and membership events.
 */
export async function channelTopicUpdate(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    topic: string | undefined,
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, actorUserId, chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages do not have topics");
        const mutation = await advanceChat(tx, actorUserId, chatId, "chat.topicChanged", chatId);
        await tx
            .update(chats)
            .set({
                topic: topic ?? null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, chatId));
        const chat = await chatRequireManager(tx, actorUserId, chatId);
        return {
            chat,
            hint: chatHint(mutation.sequence, chatId, mutation.pts),
        };
    });
}
