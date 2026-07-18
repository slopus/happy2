import { CollaborationError, type MessageSummary, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { chatHint } from "../chat/chatHint.js";

import {
    messageRevisions,
    messages,
    messageSearchDocuments,
    notifications,
    users,
} from "../schema.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { messageGetProjection } from "./messageGetProjection.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Tombstones messages and removes their messageSearchDocuments, messageRevisions, and notifications.
 * One chat mutation keeps visible history, search results, and badges aligned on the same deletion point.
 */
export async function messageDelete(
    executor: DrizzleExecutor,
    actorUserId: string,
    messageId: string,
): Promise<{
    message: MessageSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const [row] = await tx
            .select({
                chatId: messages.chatId,
                senderUserId: messages.senderUserId,
                deletedAt: messages.deletedAt,
                actorRole: users.role,
            })
            .from(messages)
            .innerJoin(users, eq(users.id, actorUserId))
            .where(eq(messages.id, messageId))
            .limit(1);
        if (!row) throw new CollaborationError("not_found", "Message was not found");
        if (!(await chatGetAccess(tx, actorUserId, row.chatId, false)))
            throw new CollaborationError("not_found", "Message was not found");
        if (row.deletedAt !== null)
            throw new CollaborationError("conflict", "Message is already deleted");
        if ((row.senderUserId ?? "") !== actorUserId && row.actorRole !== "admin")
            throw new CollaborationError("forbidden", "Cannot delete this message");
        const chatId = row.chatId;
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            actorUserId,
            chatId,
            "message.deleted",
            messageId,
        );
        await tx
            .update(messages)
            .set({
                text: "",
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: actorUserId,
                changePts: mutation.pts,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)));
        await tx
            .delete(messageSearchDocuments)
            .where(eq(messageSearchDocuments.messageId, messageId));
        await tx.delete(messageRevisions).where(eq(messageRevisions.messageId, messageId));
        await tx.delete(notifications).where(eq(notifications.messageId, messageId));
        const message = await messageGetProjection(tx, actorUserId, messageId);
        if (!message) throw new Error("Deleted message tombstone is not readable");
        return {
            message,
            hint: chatHint(sequence, chatId, mutation.pts),
        };
    });
}
