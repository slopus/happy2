import { and, eq, max, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { fileCanAccessWith } from "../chat/fileCanAccessWith.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentFileAttachments, documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { type DocumentFileAttachment, type DocumentSummary } from "./types.js";

/**
 * Appends one accessible durable file to a writable document and advances its documents-area
 * reconciliation state in the same transaction. Repeating the same document/file relation is
 * idempotent and performs no write; this boundary owns ordering, access expansion, and sync evidence.
 */
export async function documentFileAttach(
    executor: DrizzleExecutor,
    input: { actorUserId: string; documentId: string; fileId: string },
): Promise<{
    attachment: DocumentFileAttachment;
    document: DocumentSummary;
    created: boolean;
    hint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const row = await documentRowGet(tx, input.actorUserId, input.documentId, "write");
        // Acquire SQLite's write lock before reading the current relation and maximum
        // position. A competing top-level action then retries its whole transaction,
        // so same-file replays and different-file appends cannot race either unique key.
        await tx
            .update(documents)
            .set({ updatedAt: sql`${documents.updatedAt}` })
            .where(eq(documents.id, input.documentId));
        if (!(await fileCanAccessWith(tx, input.actorUserId, input.fileId)))
            throw new CollaborationError("not_found", "Attachment file was not found");
        const [existing] = await tx
            .select({ fileId: documentFileAttachments.fileId })
            .from(documentFileAttachments)
            .where(
                and(
                    eq(documentFileAttachments.documentId, input.documentId),
                    eq(documentFileAttachments.fileId, input.fileId),
                ),
            )
            .limit(1);
        if (existing) {
            const document = await documentSummaryGet(tx, input.actorUserId, row);
            const attachment = document.fileAttachments.find(
                (entry) => entry.file.id === input.fileId,
            );
            if (!attachment) throw new Error("Existing document file attachment was not projected");
            return { attachment, document, created: false };
        }
        const [last] = await tx
            .select({ position: max(documentFileAttachments.position) })
            .from(documentFileAttachments)
            .where(eq(documentFileAttachments.documentId, input.documentId));
        await tx.insert(documentFileAttachments).values({
            documentId: input.documentId,
            fileId: input.fileId,
            position: (last?.position ?? -1) + 1,
            attachedByUserId: input.actorUserId,
        });
        const [updated] = await tx
            .update(documents)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(documents.id, input.documentId))
            .returning();
        if (!updated) throw new CollaborationError("not_found", "Document was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.file_attached",
            entityId: input.documentId,
            actorUserId: input.actorUserId,
        });
        const document = await documentSummaryGet(tx, input.actorUserId, updated);
        const attachment = document.fileAttachments.find((entry) => entry.file.id === input.fileId);
        if (!attachment) throw new Error("Created document file attachment was not projected");
        return {
            attachment,
            document,
            created: true,
            hint: areaHint(sequence, "documents"),
        };
    });
}
