import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { sql } from "drizzle-orm";
import { userChatPreferences } from "../schema.js";
import { areaHint } from "../chat/areaHint.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Sets whether one accessible child chat appears in the actor's thread inbox without changing ordinary chat membership or read state.
 * Storing follow state in userChatPreferences keeps personal routing and notification intent attached to the chat rather than rebuilding thread-specific state.
 */
export async function threadFollowSet(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        followed: boolean;
    },
): Promise<{ hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const chat = await chatGetAccess(tx, input.actorUserId, input.chatId, false);
        if (!chat?.parentMessageId)
            throw new CollaborationError("not_found", "Thread chat was not found");
        const sequence = await syncSequenceNext(tx);
        await tx
            .insert(userChatPreferences)
            .values({
                userId: input.actorUserId,
                chatId: input.chatId,
                followed: input.followed ? 1 : 0,
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [userChatPreferences.userId, userChatPreferences.chatId],
                set: {
                    followed: input.followed ? 1 : 0,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        await syncEventInsert(tx, {
            sequence,
            kind: "threadPreferences.changed",
            chatId: input.chatId,
            entityId: input.chatId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return { hint: areaHint(sequence, "threads") };
    });
}
