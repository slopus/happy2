import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";
import { chatPins } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Adds or removes the chatPins relationship for an existing message after verifying the actor may post in that chat.
 * The idempotent pin transition shares a channel point with delivery so members receive one ordered, retry-safe pin state.
 */
export async function messagePinSet(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        messageId: string;
        pinned: boolean;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const message = await messageGetProjection(tx, input.actorUserId, input.messageId);
        if (!message || message.deletedAt)
            throw new CollaborationError("not_found", "Message was not found");
        const access = await chatGetAccess(tx, input.actorUserId, message.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Message was not found");
        if (access.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats are read-only");
        if (await chatIsPostingRestricted(tx, input.actorUserId, message.chatId))
            throw new CollaborationError("forbidden", "Posting is restricted by moderation");
        const [existing] = await tx
            .select({
                id: chatPins.id,
                pinnedByUserId: chatPins.pinnedByUserId,
            })
            .from(chatPins)
            .where(
                and(eq(chatPins.chatId, message.chatId), eq(chatPins.messageId, input.messageId)),
            )
            .limit(1);
        if (Boolean(existing) === input.pinned)
            throw new CollaborationError(
                "conflict",
                input.pinned ? "Message is already pinned" : "Message is not pinned",
            );
        if (
            !input.pinned &&
            existing?.pinnedByUserId !== input.actorUserId &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.membershipRole !== "admin"
        )
            throw new CollaborationError("forbidden", "Cannot remove this pin");
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            message.chatId,
            input.pinned ? "pin.created" : "pin.deleted",
            input.messageId,
        );
        if (input.pinned)
            await tx.insert(chatPins).values({
                id: createId(),
                chatId: message.chatId,
                messageId: input.messageId,
                pinnedByUserId: input.actorUserId,
            });
        else
            await tx
                .delete(chatPins)
                .where(
                    and(
                        eq(chatPins.chatId, message.chatId),
                        eq(chatPins.messageId, input.messageId),
                    ),
                );
        return {
            hint: chatHint(sequence, message.chatId, mutation.pts),
        };
    });
}
