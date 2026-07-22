import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { chats } from "../schema.js";
import { eq, sql } from "drizzle-orm";
import { advanceChat } from "./impl/advanceChat.js";
import { chatCanPost } from "./chatCanPost.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { chatHint } from "./chatHint.js";
import { CollaborationError, type ChatSummary, type MutationHint } from "./types.js";

/**
 * Updates the chats.agentModelId durable choice for one post-capable member and advances that
 * chat's ordered sync point. This action keeps current and future agent sessions on the same
 * Rig model after reconnect or restart, while its transaction makes the visible chat projection
 * and delivery hint inseparable.
 */
export async function chatModelUpdate(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; modelId: string },
): Promise<{ chat: ChatSummary; hint?: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const current = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!current) throw new CollaborationError("not_found", "Chat was not found");
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("forbidden", "The model cannot be changed in this chat");
        if (current.agentModelId === input.modelId) return { chat: current };
        const mutation = await advanceChat(
            tx,
            input.actorUserId,
            input.chatId,
            "chat.modelChanged",
            input.chatId,
        );
        await tx
            .update(chats)
            .set({
                agentModelId: input.modelId,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, input.chatId));
        const chat = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        return { chat, hint: chatHint(mutation.sequence, input.chatId, mutation.pts) };
    });
}
