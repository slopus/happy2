import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { chatHint } from "../chat/chatHint.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { messageIsPast } from "./messageIsPast.js";
import { messageRevisions, messages } from "../schema.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { messageIndexForSearch } from "./messageIndexForSearch.js";
import { chatIsPostingRestricted } from "../chat/chatIsPostingRestricted.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { messageReplaceMentions } from "./messageReplaceMentions.js";

/**
 * Appends the prior content to messageRevisions, updates the authorized messages row, and rebuilds mentions and search text.
 * Version history and projections share one channel point so clients never search new text while rendering an older message revision.
 */
export async function messageEdit(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        messageId: string;
        text: string;
        reason?: string;
        expectedRevision?: number;
    },
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const [row] = await tx
            .select({
                chatId: messages.chatId,
                senderUserId: messages.senderUserId,
                kind: messages.kind,
                text: messages.text,
                contentJson: messages.contentJson,
                revision: messages.revision,
                deletedAt: messages.deletedAt,
                expiresAt: messages.expiresAt,
            })
            .from(messages)
            .where(eq(messages.id, input.messageId))
            .limit(1);
        if (!row || row.deletedAt !== null || messageIsPast(row.expiresAt ?? undefined))
            throw new CollaborationError("not_found", "Message was not found");
        const access = await chatGetAccess(tx, input.actorUserId, row.chatId, false);
        if (!access) throw new CollaborationError("not_found", "Message was not found");
        if (access.archivedAt)
            throw new CollaborationError("forbidden", "Archived chats are read-only");
        if (await chatIsPostingRestricted(tx, input.actorUserId, row.chatId))
            throw new CollaborationError("forbidden", "Posting is restricted by moderation");
        if (row.kind !== "user" || row.senderUserId !== input.actorUserId)
            throw new CollaborationError("forbidden", "Cannot edit this message");
        const revision = row.revision;
        if (input.expectedRevision !== undefined && input.expectedRevision !== revision)
            throw new CollaborationError("conflict", "Message was edited by another request");
        if (row.text === input.text)
            throw new CollaborationError("conflict", "Message text is unchanged");
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            row.chatId,
            "message.edited",
            input.messageId,
        );
        await tx
            .insert(messageRevisions)
            .values({
                id: createId(),
                messageId: input.messageId,
                revision,
                text: row.text,
                contentJson: row.contentJson,
                editedByUserId: input.actorUserId,
                editReason: input.reason,
            })
            .onConflictDoNothing();
        const nextRevision = revision + 1;
        await tx
            .update(messages)
            .set({
                text: input.text,
                revision: nextRevision,
                editedAt: sql`CURRENT_TIMESTAMP`,
                editedByUserId: input.actorUserId,
                editReason: input.reason ?? null,
                changePts: mutation.pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(messages.id, input.messageId));
        await tx.insert(messageRevisions).values({
            id: createId(),
            messageId: input.messageId,
            revision: nextRevision,
            text: input.text,
            contentJson: null,
            editedByUserId: input.actorUserId,
            editReason: input.reason,
        });
        await messageReplaceMentions(tx, input.messageId, input.text);
        await messageIndexForSearch(tx, input.messageId, row.chatId, input.text, nextRevision);
        const message = await messageGetProjection(tx, input.actorUserId, input.messageId);
        if (!message) throw new Error("Edited message is not readable");
        return {
            message,
            hint: chatHint(sequence, row.chatId, mutation.pts),
        };
    });
}
