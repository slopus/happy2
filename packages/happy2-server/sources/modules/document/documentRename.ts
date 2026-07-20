import { eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { MAX_DOCUMENT_TITLE_LENGTH, type DocumentSummary } from "./types.js";

/**
 * Replaces one title on `documents` for its always-authorized owner or an actor who may
 * post in any attached channel; denial is `not_found` so attachment is not probeable.
 * The same transaction records `document.renamed` so every visible list reconciles the
 * durable title through the documents area, which is why rename owns this action boundary.
 */
export async function documentRename(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        documentId: string;
        title: string;
    },
): Promise<{ document: DocumentSummary; hint: MutationHint }> {
    if (input.title.length > MAX_DOCUMENT_TITLE_LENGTH)
        throw new CollaborationError(
            "invalid",
            `title may have at most ${MAX_DOCUMENT_TITLE_LENGTH} characters`,
        );
    return withTransaction(executor, async (tx) => {
        await documentRowGet(tx, input.actorUserId, input.documentId, "write");
        const [updated] = await tx
            .update(documents)
            .set({ title: input.title, updatedAt: new Date().toISOString() })
            .where(eq(documents.id, input.documentId))
            .returning();
        if (!updated) throw new CollaborationError("not_found", "Document was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.renamed",
            entityId: input.documentId,
            actorUserId: input.actorUserId,
        });
        return {
            document: await documentSummaryGet(tx, input.actorUserId, updated),
            hint: areaHint(sequence, "documents"),
        };
    });
}
