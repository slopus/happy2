import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { dueMessages } from "./impl/dueMessages.js";

import { messageRevisions, messages, messageSearchDocuments, notifications } from "../schema.js";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { pluginMcpAppsDeleteForMessage } from "../plugin/pluginMcpAppsDeleteForMessage.js";
import { pluginResourceLinksDeleteForMessage } from "../plugin/pluginResourceLinksDeleteForMessage.js";

/**
 * Tombstones due ephemeral messages and clears their messageSearchDocuments, messageRevisions, notifications, and durable plugin result surfaces in bounded batches.
 * Expiration advances ordinary chat projections with the cleanup so no client retains searchable or unread traces of removed content.
 */
export async function messageExpireDue(
    executor: DrizzleExecutor,
    limit = 100,
): Promise<MutationHint | undefined> {
    if ((await dueMessages(executor, 1)).length === 0) return undefined;
    return withTransaction(executor, async (tx) => {
        const due = await dueMessages(tx, limit);
        if (due.length === 0) return undefined;
        const sequence = await syncSequenceNext(tx);
        const changedChats = new Map<string, number>();
        for (const row of due) {
            const messageId = row.id;
            const chatId = row.chatId;
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                undefined,
                chatId,
                "message.expired",
                messageId,
            );
            const changed = await tx
                .update(messages)
                .set({
                    text: "",
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    changePts: mutation.pts,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(messages.id, messageId), isNull(messages.deletedAt)))
                .returning({
                    id: messages.id,
                });
            if (changed.length) {
                await tx
                    .delete(messageSearchDocuments)
                    .where(eq(messageSearchDocuments.messageId, messageId));
                await tx.delete(messageRevisions).where(eq(messageRevisions.messageId, messageId));
                await tx.delete(notifications).where(eq(notifications.messageId, messageId));
                await pluginMcpAppsDeleteForMessage(tx, messageId);
                await pluginResourceLinksDeleteForMessage(tx, messageId);
                changedChats.set(chatId, mutation.pts);
            }
        }
        return {
            sequence: String(sequence),
            chats: [...changedChats].map(([chatId, pts]) => ({
                chatId,
                pts: String(pts),
            })),
            areas: [],
        };
    });
}
