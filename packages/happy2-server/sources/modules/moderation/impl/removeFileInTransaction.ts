import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { chats, fileAccessGrants, files, messageAttachments, messages } from "../../schema.js";

import { advanceChatMutation } from "./advanceChatMutation.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";
import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
/**
 * Marks moderated files unavailable and deletes their fileAccessGrants after confirming the report still targets that file.
 * The action transaction prevents access grants or sync hints from surviving when the file removal itself cannot be completed.
 */
export async function removeFileInTransaction(
    tx: DrizzleTransaction,
    actorUserId: string,
    fileId: string,
    reason?: string,
): Promise<OperationsSyncHint> {
    const [file] = await tx
        .select({
            deletedAt: files.deletedAt,
        })
        .from(files)
        .where(eq(files.id, fileId))
        .limit(1);
    if (!file) throw new OperationsError("not_found", "File was not found");
    if (file.deletedAt !== null) throw new OperationsError("conflict", "File is already removed");
    const affectedChats = await tx
        .selectDistinct({
            chatId: messages.chatId,
        })
        .from(messageAttachments)
        .innerJoin(messages, eq(messages.id, messageAttachments.messageId))
        .innerJoin(chats, eq(chats.id, messages.chatId))
        .where(
            and(
                eq(messageAttachments.fileId, fileId),
                isNull(messages.deletedAt),
                isNull(chats.deletedAt),
            ),
        )
        .orderBy(messages.chatId);
    const sequence = await syncSequenceNextWithTimestamp(tx);
    const chatPoints: Array<{
        chatId: string;
        pts: string;
    }> = [];
    for (const row of affectedChats) {
        const chatId = row.chatId;
        const pts = await advanceChatMutation(tx, {
            sequence,
            chatId,
            kind: "file.removed",
            entityId: fileId,
            actorUserId,
        });
        chatPoints.push({
            chatId,
            pts: String(pts),
        });
    }
    await tx
        .update(files)
        .set({
            deletedAt: sql`CURRENT_TIMESTAMP`,
            deletedByUserId: actorUserId,
            deleteReason: reason ?? "moderation",
            accessScope: "private",
            isPublic: 0,
            orphanedAt: sql`coalesce(${files.orphanedAt}, CURRENT_TIMESTAMP)`,
        })
        .where(and(eq(files.id, fileId), isNull(files.deletedAt)));
    await tx.delete(fileAccessGrants).where(eq(fileAccessGrants.fileId, fileId));
    await syncEventInsert(tx, {
        sequence,
        kind: "file.removed",
        entityId: fileId,
        actorUserId,
    });
    return {
        sequence: String(sequence),
        chats: chatPoints,
        areas: ["files"],
    };
}
