import { and, eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentChannelAttachments, documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { type DocumentChannelAttachment, type DocumentSummary } from "./types.js";

/**
 * Attaches an existing owner- or channel-accessible document to a channel the actor may
 * post to by inserting one `documentChannelAttachments` row and advancing `documents.updatedAt`.
 * The owner always has document access; members inherit access through any attachment,
 * while inaccessible document or channel checks both return `not_found`. The transaction
 * records `document.attached` so global and channel lists reconcile atomically.
 */
export async function documentAttach(
    executor: DrizzleExecutor,
    input: { actorUserId: string; documentId: string; chatId: string },
): Promise<{
    attachment: DocumentChannelAttachment;
    document: DocumentSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await documentRowGet(tx, input.actorUserId, input.documentId, "read");
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("not_found", "Chat was not found");
        const [existing] = await tx
            .select({ documentId: documentChannelAttachments.documentId })
            .from(documentChannelAttachments)
            .where(
                and(
                    eq(documentChannelAttachments.documentId, input.documentId),
                    eq(documentChannelAttachments.chatId, input.chatId),
                ),
            )
            .limit(1);
        if (existing)
            throw new CollaborationError("conflict", "Document is already attached to chat");
        const attachedAt = new Date().toISOString();
        await tx.insert(documentChannelAttachments).values({
            documentId: input.documentId,
            chatId: input.chatId,
            attachedByUserId: input.actorUserId,
            attachedAt,
        });
        const [updated] = await tx
            .update(documents)
            .set({ updatedAt: attachedAt })
            .where(eq(documents.id, input.documentId))
            .returning();
        if (!updated) throw new CollaborationError("not_found", "Document was not found");
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.attached",
            entityId: input.documentId,
            actorUserId: input.actorUserId,
        });
        return {
            attachment: { chatId: input.chatId, attachedByUserId: input.actorUserId, attachedAt },
            document: await documentSummaryGet(tx, input.actorUserId, updated),
            hint: areaHint(sequence, "documents"),
        };
    });
}
