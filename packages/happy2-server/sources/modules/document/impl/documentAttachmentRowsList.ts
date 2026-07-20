import { asc, eq, inArray } from "drizzle-orm";
import { type DrizzleExecutor } from "../../drizzle.js";
import { documentChannelAttachments } from "../../schema.js";

export type DocumentAttachmentRow = typeof documentChannelAttachments.$inferSelect;

/** Reads every durable channel attachment for one document in stable creation order. */
export async function documentAttachmentRowsList(
    executor: DrizzleExecutor,
    documentId: string,
): Promise<DocumentAttachmentRow[]> {
    return executor
        .select()
        .from(documentChannelAttachments)
        .where(eq(documentChannelAttachments.documentId, documentId))
        .orderBy(
            asc(documentChannelAttachments.attachedAt),
            asc(documentChannelAttachments.chatId),
        );
}

/** Reads durable attachments for several documents in stable per-document creation order. */
export async function documentAttachmentRowsListForDocuments(
    executor: DrizzleExecutor,
    documentIds: readonly string[],
): Promise<DocumentAttachmentRow[]> {
    if (documentIds.length === 0) return [];
    const rows: DocumentAttachmentRow[] = [];
    for (let offset = 0; offset < documentIds.length; offset += 400)
        rows.push(
            ...(await executor
                .select()
                .from(documentChannelAttachments)
                .where(
                    inArray(
                        documentChannelAttachments.documentId,
                        documentIds.slice(offset, offset + 400),
                    ),
                )
                .orderBy(
                    asc(documentChannelAttachments.documentId),
                    asc(documentChannelAttachments.attachedAt),
                    asc(documentChannelAttachments.chatId),
                )),
        );
    return rows.sort(
        (left, right) =>
            left.documentId.localeCompare(right.documentId) ||
            left.attachedAt.localeCompare(right.attachedAt) ||
            left.chatId.localeCompare(right.chatId),
    );
}
