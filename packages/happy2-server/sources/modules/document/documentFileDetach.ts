import { and, eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentFileAttachments, documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { type DocumentSummary } from "./types.js";

/**
 * Removes one `documentFileAttachments` row from a writable document without deleting the durable
 * file, then advances document reconciliation in the same transaction. Missing or inaccessible
 * relations are uniformly not found so this action cannot probe document or file attachment state.
 */
export async function documentFileDetach(
    executor: DrizzleExecutor,
    input: { actorUserId: string; documentId: string; fileId: string },
): Promise<{ document: DocumentSummary; fileId: string; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        await documentRowGet(tx, input.actorUserId, input.documentId, "write");
        const removed = await tx
            .delete(documentFileAttachments)
            .where(
                and(
                    eq(documentFileAttachments.documentId, input.documentId),
                    eq(documentFileAttachments.fileId, input.fileId),
                ),
            )
            .returning({ fileId: documentFileAttachments.fileId });
        if (removed.length === 0)
            throw new CollaborationError("not_found", "Document file attachment was not found");
        const [updated] = await tx
            .update(documents)
            .set({ updatedAt: new Date().toISOString() })
            .where(eq(documents.id, input.documentId))
            .returning();
        if (!updated) throw new CollaborationError("not_found", "Document was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.file_detached",
            entityId: input.documentId,
            actorUserId: input.actorUserId,
        });
        return {
            document: await documentSummaryGet(tx, input.actorUserId, updated),
            fileId: input.fileId,
            hint: areaHint(sequence, "documents"),
        };
    });
}
