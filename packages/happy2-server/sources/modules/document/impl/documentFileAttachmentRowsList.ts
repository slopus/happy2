import { and, asc, eq, inArray, isNull, ne } from "drizzle-orm";
import { asFile } from "../../chat/asFile.js";
import { fileSelection } from "../../chat/fileSelection.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { documentFileAttachments, files } from "../../schema.js";
import { type DocumentFileAttachment } from "../types.js";

export interface DocumentFileAttachmentRow extends DocumentFileAttachment {
    readonly documentId: string;
}

/** Lists safe file metadata for the requested documents in stable attachment order. */
export async function documentFileAttachmentRowsListForDocuments(
    executor: DrizzleExecutor,
    documentIds: readonly string[],
): Promise<DocumentFileAttachmentRow[]> {
    if (documentIds.length === 0) return [];
    const rows: Array<{
        documentId: string;
        position: number;
        attachedByUserId: string;
        createdAt: string;
        file: Record<string, unknown>;
    }> = [];
    for (let offset = 0; offset < documentIds.length; offset += 400)
        rows.push(
            ...(await executor
                .select({
                    documentId: documentFileAttachments.documentId,
                    position: documentFileAttachments.position,
                    attachedByUserId: documentFileAttachments.attachedByUserId,
                    createdAt: documentFileAttachments.createdAt,
                    file: fileSelection,
                })
                .from(documentFileAttachments)
                .innerJoin(files, eq(files.id, documentFileAttachments.fileId))
                .where(
                    and(
                        inArray(
                            documentFileAttachments.documentId,
                            documentIds.slice(offset, offset + 400),
                        ),
                        isNull(files.deletedAt),
                        eq(files.uploadStatus, "complete"),
                        ne(files.scanStatus, "infected"),
                    ),
                )
                .orderBy(
                    asc(documentFileAttachments.documentId),
                    asc(documentFileAttachments.position),
                    asc(documentFileAttachments.fileId),
                )),
        );
    rows.sort(
        (left, right) =>
            left.documentId.localeCompare(right.documentId) ||
            left.position - right.position ||
            String(left.file.id).localeCompare(String(right.file.id)),
    );
    return rows.map((row) => ({
        documentId: row.documentId,
        position: row.position,
        attachedByUserId: row.attachedByUserId,
        createdAt: row.createdAt,
        file: asFile(row.file),
    }));
}
