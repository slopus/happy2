import { and, eq, isNull, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chats } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatHint } from "./chatHint.js";
import { CollaborationError, type MutationHint } from "./types.js";

export interface ChatMetadataSummary {
    id: string;
    title?: string;
    description?: string;
}

/**
 * Changes one live chats row title or description under an already verified chat-scoped capability and advances chatUpdates/syncEvents coordinates atomically.
 * This capability action intentionally accepts no user authority; its caller must validate the signed plugin/chat binding before entering this transaction.
 */
export async function chatUpdateMetadata(
    executor: DrizzleExecutor,
    input: { chatId: string; title?: string; description?: string | null },
): Promise<{ chat: ChatMetadataSummary; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            undefined,
            input.chatId,
            "chat.updated",
            input.chatId,
        );
        const [chat] = await tx
            .update(chats)
            .set({
                ...(input.title === undefined ? {} : { name: input.title }),
                ...(input.description === undefined ? {} : { topic: input.description }),
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
            .returning({ id: chats.id, title: chats.name, description: chats.topic });
        if (!chat) throw new CollaborationError("not_found", "Chat was not found");
        return {
            chat: {
                id: chat.id,
                ...(chat.title ? { title: chat.title } : {}),
                ...(chat.description ? { description: chat.description } : {}),
            },
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
