import { chatGetAccess } from "../../chat/chatGetAccess.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { type DocumentChannelAttachment, type DocumentSummary } from "../types.js";
import { documentAttachmentRowsListForDocuments } from "./documentAttachmentRowsList.js";
import { documentProjection } from "./documentProjection.js";
import { type DocumentRow } from "./documentRowGet.js";

/**
 * Hydrates one authorized document row with attachment metadata the caller may see.
 * The owner sees every location; another collaborator sees only attached channels they
 * can access, preventing membership in one channel from probing a second private channel.
 */
export async function documentSummaryGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    row: DocumentRow,
): Promise<DocumentSummary> {
    const [summary] = await documentSummariesGet(executor, actorUserId, [row]);
    if (!summary) throw new Error("Document summary was not projected");
    return summary;
}

/** Hydrates several authorized document rows while checking each distinct channel only once. */
export async function documentSummariesGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    rows: readonly DocumentRow[],
): Promise<DocumentSummary[]> {
    if (rows.length === 0) return [];
    const attachmentRows = await documentAttachmentRowsListForDocuments(
        executor,
        rows.map((row) => row.id),
    );
    const nonOwnerDocumentIds = new Set(
        rows.filter((row) => row.ownerUserId !== actorUserId).map((row) => row.id),
    );
    const candidateChatIds = [
        ...new Set(
            attachmentRows
                .filter((attachment) => nonOwnerDocumentIds.has(attachment.documentId))
                .map((attachment) => attachment.chatId),
        ),
    ];
    const visibleChatIds = new Set(
        (
            await Promise.all(
                candidateChatIds.map(async (chatId) => ({
                    chatId,
                    visible: Boolean(await chatGetAccess(executor, actorUserId, chatId, true)),
                })),
            )
        )
            .filter((entry) => entry.visible)
            .map((entry) => entry.chatId),
    );
    const documentsById = new Map(rows.map((row) => [row.id, row]));
    const attachmentsByDocument = new Map<string, DocumentChannelAttachment[]>();
    for (const attachment of attachmentRows) {
        const document = documentsById.get(attachment.documentId);
        if (!document) continue;
        if (document.ownerUserId !== actorUserId && !visibleChatIds.has(attachment.chatId))
            continue;
        const projected = attachmentsByDocument.get(attachment.documentId) ?? [];
        projected.push({
            chatId: attachment.chatId,
            attachedByUserId: attachment.attachedByUserId,
            attachedAt: attachment.attachedAt,
        });
        attachmentsByDocument.set(attachment.documentId, projected);
    }
    return rows.map((row) => documentProjection(row, attachmentsByDocument.get(row.id) ?? []));
}
