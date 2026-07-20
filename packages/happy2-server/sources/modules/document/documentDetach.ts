import { and, eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentChannelAttachments, documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";

/**
 * Detaches one document from one channel by deleting only its
 * `documentChannelAttachments` row and advancing `documents.updatedAt`; document content
 * and update history remain intact. The owner may always detach, while another actor must
 * be able to post to that attached channel; every denied or absent relation is `not_found`
 * so attachment is not probeable. The transaction records `document.detached` for list reconciliation.
 */
export async function documentDetach(
    executor: DrizzleExecutor,
    input: { actorUserId: string; documentId: string; chatId: string },
): Promise<{ documentId: string; chatId: string; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const row = await documentRowGet(tx, input.actorUserId, input.documentId, "read");
        if (
            row.ownerUserId !== input.actorUserId &&
            !(await chatCanPost(tx, input.actorUserId, input.chatId))
        )
            throw new CollaborationError("not_found", "Document attachment was not found");
        const removed = await tx
            .delete(documentChannelAttachments)
            .where(
                and(
                    eq(documentChannelAttachments.documentId, input.documentId),
                    eq(documentChannelAttachments.chatId, input.chatId),
                ),
            )
            .returning({ documentId: documentChannelAttachments.documentId });
        if (removed.length === 0)
            throw new CollaborationError("not_found", "Document attachment was not found");
        const updatedAt = new Date().toISOString();
        await tx.update(documents).set({ updatedAt }).where(eq(documents.id, input.documentId));
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.detached",
            entityId: input.documentId,
            actorUserId: input.actorUserId,
        });
        return {
            documentId: input.documentId,
            chatId: input.chatId,
            hint: areaHint(sequence, "documents"),
        };
    });
}
