import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";
import { createId } from "@paralleldrive/cuid2";
import {
    customEmojis,
    messages,
    notifications,
    reactions,
    userNotificationPreferences,
} from "../schema.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Adds or removes one validated reactions row, updates messages reaction metadata, and creates the applicable recipient notifications.
 * Committing projection, badge, and channel event together keeps retries from duplicating reactions or notifying about a reaction that is not visible.
 */
export async function messageReactionSet(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        messageId: string;
        emoji?: string;
        customEmojiId?: string;
        active: boolean;
    },
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        if (Boolean(input.emoji) === Boolean(input.customEmojiId))
            throw new CollaborationError("invalid", "Exactly one reaction identifier is required");
        const message = await messageGetProjection(tx, input.actorUserId, input.messageId);
        if (!message || message.deletedAt)
            throw new CollaborationError("not_found", "Message was not found");
        if (await chatIsPostingRestricted(tx, input.actorUserId, message.chatId))
            throw new CollaborationError("forbidden", "Posting is restricted by moderation");
        const reactionKey = input.customEmojiId
            ? `custom:${input.customEmojiId}`
            : `unicode:${input.emoji}`;
        let customEmoji:
            | {
                  name: string;
                  fileId: string;
              }
            | undefined;
        if (input.customEmojiId) {
            [customEmoji] = await tx
                .select({
                    name: customEmojis.name,
                    fileId: customEmojis.fileId,
                })
                .from(customEmojis)
                .where(
                    and(eq(customEmojis.id, input.customEmojiId), isNull(customEmojis.deletedAt)),
                )
                .limit(1);
            if (!customEmoji)
                throw new CollaborationError("not_found", "Custom emoji was not found");
        }
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            message.chatId,
            "reaction.changed",
            input.messageId,
        );
        if (input.active) {
            await tx
                .insert(reactions)
                .values({
                    messageId: input.messageId,
                    userId: input.actorUserId,
                    reactionKey,
                    emoji: input.emoji,
                    customEmojiId: input.customEmojiId,
                    customEmojiNameSnapshot: customEmoji?.name,
                    customEmojiFileIdSnapshot: customEmoji?.fileId,
                })
                .onConflictDoNothing();
        } else {
            await tx
                .delete(reactions)
                .where(
                    and(
                        eq(reactions.messageId, input.messageId),
                        eq(reactions.userId, input.actorUserId),
                        eq(reactions.reactionKey, reactionKey),
                    ),
                );
        }
        const [recipient] = await tx
            .select({
                senderUserId: messages.senderUserId,
            })
            .from(messages)
            .where(eq(messages.id, input.messageId));
        const recipientUserId = recipient?.senderUserId ?? undefined;
        const reactionPreference = recipientUserId
            ? (
                  await tx
                      .select({
                          reactions: sql<string>`coalesce(${userNotificationPreferences.reactions}, 'all')`,
                      })
                      .from(userNotificationPreferences)
                      .where(eq(userNotificationPreferences.userId, recipientUserId))
                      .limit(1)
              )[0]
            : undefined;
        if (
            input.active &&
            recipientUserId &&
            recipientUserId !== input.actorUserId &&
            reactionPreference?.reactions !== "none"
        ) {
            const notificationId = createId();
            await tx.insert(notifications).values({
                id: notificationId,
                userId: recipientUserId,
                kind: "reaction",
                chatId: message.chatId,
                messageId: input.messageId,
                actorUserId: input.actorUserId,
                payloadJson: JSON.stringify({
                    reactionKey,
                }),
                syncSequence: sequence,
            });
            await syncEventInsert(tx, {
                sequence,
                kind: "notification.created",
                entityId: notificationId,
                actorUserId: input.actorUserId,
                targetUserId: recipientUserId,
            });
        }
        await tx
            .update(messages)
            .set({
                changePts: mutation.pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(messages.id, input.messageId));
        const updated = await messageGetProjection(tx, input.actorUserId, input.messageId);
        if (!updated) throw new Error("Reacted message is not readable");
        return {
            message: updated,
            hint: chatHint(sequence, message.chatId, mutation.pts),
        };
    });
}
