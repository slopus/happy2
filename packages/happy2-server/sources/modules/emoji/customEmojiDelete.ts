import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { customEmojiRevisions, customEmojis, messages, reactions, users } from "../schema.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Soft-deletes customEmojis, removes dependent reactions, and appends the deletion to customEmojiRevisions.
 * One synchronized transition ensures message projections cannot retain a reaction whose custom definition has disappeared.
 */
export async function customEmojiDelete(
    executor: DrizzleExecutor,
    actorUserId: string,
    emojiId: string,
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const [emoji] = await tx
            .select({
                createdByUserId: customEmojis.createdByUserId,
                name: customEmojis.name,
                fileId: customEmojis.fileId,
                actorRole: users.role,
            })
            .from(customEmojis)
            .innerJoin(users, eq(users.id, actorUserId))
            .where(and(eq(customEmojis.id, emojiId), isNull(customEmojis.deletedAt)))
            .limit(1);
        if (!emoji) throw new CollaborationError("not_found", "Emoji was not found");
        if (emoji.createdByUserId !== actorUserId && emoji.actorRole !== "admin")
            throw new CollaborationError("forbidden", "Cannot delete this emoji");
        const sequence = await syncSequenceNext(tx);
        const affected = await tx
            .selectDistinct({
                chatId: messages.chatId,
            })
            .from(reactions)
            .innerJoin(messages, eq(messages.id, reactions.messageId))
            .where(and(eq(reactions.customEmojiId, emojiId), isNull(messages.deletedAt)));
        const chatHints: Array<{
            chatId: string;
            pts: string;
        }> = [];
        for (const row of affected) {
            const chatId = row.chatId;
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                actorUserId,
                chatId,
                "reaction.emojiDeleted",
                emojiId,
            );
            chatHints.push({
                chatId,
                pts: String(mutation.pts),
            });
        }
        await tx.delete(reactions).where(eq(reactions.customEmojiId, emojiId));
        await tx
            .update(customEmojis)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                syncSequence: sequence,
            })
            .where(eq(customEmojis.id, emojiId));
        await tx.insert(customEmojiRevisions).values({
            id: createId(),
            customEmojiId: emojiId,
            name: emoji.name,
            fileId: emoji.fileId,
            changedByUserId: actorUserId,
            changeKind: "deleted",
        });
        await syncEventInsert(tx, {
            sequence,
            kind: "emoji.deleted",
            entityId: emojiId,
            actorUserId,
        });
        return {
            hint: {
                sequence: String(sequence),
                chats: chatHints,
                areas: ["emoji"],
            },
        };
    });
}
