import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { messageRevisions, messages, messageSearchDocuments, notifications } from "../../schema.js";

import { advanceChatMutation } from "./advanceChatMutation.js";
import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
import { recomputeThreadProjection } from "./recomputeThreadProjection.js";
/**
 * Tombstones moderated messages, clears messageSearchDocuments, messageRevisions, and notifications, and repairs their thread projection.
 * Reusing the report action transaction keeps visible history, search, badges, channel points, and moderation evidence on one outcome.
 */
export async function removeMessageInTransaction(
    tx: DrizzleTransaction,
    actorUserId: string,
    messageId: string,
    reason?: string,
): Promise<{
    chatId: string;
    sync: OperationsSyncHint;
}> {
    const [message] = await tx
        .select({
            chatId: messages.chatId,
            deletedAt: messages.deletedAt,
            threadRootMessageId: messages.threadRootMessageId,
        })
        .from(messages)
        .where(eq(messages.id, messageId))
        .limit(1);
    if (!message) throw new OperationsError("not_found", "Message was not found");
    if (message.deletedAt !== null)
        throw new OperationsError("conflict", "Message is already removed");
    const chatId = message.chatId;
    const sequence = await syncSequenceNextWithTimestamp(tx);
    const pts = await advanceChatMutation(tx, {
        sequence,
        chatId,
        kind: "message.deleted",
        entityId: messageId,
        actorUserId,
    });
    await tx
        .update(messages)
        .set({
            text: "",
            contentJson: null,
            deletedAt: sql`CURRENT_TIMESTAMP`,
            deletedByUserId: actorUserId,
            deleteReason: reason ?? "moderation",
            changePts: pts,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)));
    await tx.delete(messageSearchDocuments).where(eq(messageSearchDocuments.messageId, messageId));
    await tx.delete(messageRevisions).where(eq(messageRevisions.messageId, messageId));
    await tx.delete(notifications).where(eq(notifications.messageId, messageId));
    if (message.threadRootMessageId) {
        const threadRootMessageId = message.threadRootMessageId;
        await recomputeThreadProjection(tx, threadRootMessageId, pts);
        await tx
            .update(messages)
            .set({
                changePts: pts,
            })
            .where(eq(messages.id, threadRootMessageId));
    }
    return {
        chatId,
        sync: {
            sequence: String(sequence),
            chats: [
                {
                    chatId,
                    pts: String(pts),
                },
            ],
            areas: [],
        },
    };
}
