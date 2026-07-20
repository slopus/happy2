import { and, eq, sql } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { chatHint } from "../chat/chatHint.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentWriteRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentApplyUpdates } from "./documentApplyUpdates.js";
import { documentAttachedRowGet } from "./impl/documentAttachedRowGet.js";
import {
    asDocumentWriteRequest,
    documentWriteRequestSelection,
} from "./impl/documentWriteRequestProjection.js";
import type { DocumentRealtimeAudience, DocumentWriteRequestSummary } from "./types.js";

/** Applies one pending staged Yjs batch exactly once and marks its documentWriteRequests row approved in the same top-level transaction, but only for an active member who can post in the request chat, while the document remains attached there, and while its sequence still matches the staged base. A sequence conflict throws outside the transaction so the route can durably fail the held request; successful approval records the deciding user and advances `document.write_approved` with the content update atomically. */
export async function documentWriteRequestApprove(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; requestId: string; now: number },
): Promise<{
    request: DocumentWriteRequestSummary;
    acceptedSequence: string;
    replayed: boolean;
    audience: DocumentRealtimeAudience;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("forbidden", "Posting chat membership is required");
        const [row] = await tx
            .select()
            .from(documentWriteRequests)
            .where(
                and(
                    eq(documentWriteRequests.id, input.requestId),
                    eq(documentWriteRequests.chatId, input.chatId),
                ),
            )
            .limit(1);
        if (!row) throw new CollaborationError("not_found", "Document write request was not found");
        if (row.status !== "pending")
            throw new CollaborationError(
                "conflict",
                `Document write request is already ${row.status}`,
            );
        if (Date.parse(row.expiresAt) <= input.now)
            throw new CollaborationError("conflict", "Document write request has expired");
        const document = await documentAttachedRowGet(tx, input.chatId, row.documentId);
        if (String(document.lastSequence) !== row.baseSequence)
            throw new Error(
                `Document changed while this edit awaited approval: expected sequence ${row.baseSequence}, current sequence ${document.lastSequence}. Read the document again and propose a new edit.`,
            );
        const updates = JSON.parse(row.updatesJson) as unknown;
        if (!Array.isArray(updates)) throw new Error("Stored document write updates are invalid");
        const applied = await documentApplyUpdates(tx, {
            actorUserId: input.actorUserId,
            documentId: row.documentId,
            clientUpdateId: row.clientUpdateId,
            updates,
        });
        const [updated] = await tx
            .update(documentWriteRequests)
            .set({
                status: "approved",
                acceptedSequence: applied.acceptedSequence,
                resolvedByUserId: input.actorUserId,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(documentWriteRequests.id, input.requestId),
                    eq(documentWriteRequests.status, "pending"),
                ),
            )
            .returning({ id: documentWriteRequests.id });
        if (!updated)
            throw new CollaborationError("conflict", "Document write request was already resolved");
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "document.write_approved",
            targetType: "document_write_request",
            targetId: input.requestId,
            chatId: input.chatId,
            after: {
                documentId: row.documentId,
                clientUpdateId: row.clientUpdateId,
                baseSequence: row.baseSequence,
                acceptedSequence: applied.acceptedSequence,
                replayed: applied.replayed,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(documentWriteRequests)
            .set({ syncSequence: sequence })
            .where(eq(documentWriteRequests.id, input.requestId));
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "document.write_approved",
            input.requestId,
        );
        const [resolved] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(eq(documentWriteRequests.id, input.requestId))
            .limit(1);
        if (!resolved) throw new Error("Approved document write request was not found");
        return {
            request: asDocumentWriteRequest(resolved),
            acceptedSequence: applied.acceptedSequence,
            replayed: applied.replayed,
            audience: applied.audience,
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
