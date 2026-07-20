import { and, eq, sql } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../chat/chatHint.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentWriteRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import {
    asDocumentWriteRequest,
    documentWriteRequestSelection,
} from "./impl/documentWriteRequestProjection.js";
import type { DocumentWriteRequestSummary } from "./types.js";

const DOCUMENT_WRITE_APPROVAL_TIMEOUT_MESSAGE =
    "Document write approval timed out after 5 minutes.";

/** Reads one held document-write outcome and atomically fails an overdue pending documentWriteRequests row, advancing `document.write_failed` in the request chat. This polling boundary gives the durable agent call a terminal database result instead of allowing an abandoned approval to hang forever. */
export async function documentWriteRequestAwaitOutcome(
    executor: DrizzleExecutor,
    requestId: string,
    now: number,
): Promise<{ hint?: MutationHint; request: DocumentWriteRequestSummary }> {
    const [current] = await executor
        .select(documentWriteRequestSelection)
        .from(documentWriteRequests)
        .where(eq(documentWriteRequests.id, requestId))
        .limit(1);
    if (!current) throw new CollaborationError("not_found", "Document write request was not found");
    if (current.status !== "pending" || Date.parse(current.expiresAt) > now)
        return { request: asDocumentWriteRequest(current) };
    return withTransaction(executor, async (tx) => {
        const [expired] = await tx
            .update(documentWriteRequests)
            .set({
                status: "failed",
                lastError: DOCUMENT_WRITE_APPROVAL_TIMEOUT_MESSAGE,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(documentWriteRequests.id, requestId),
                    eq(documentWriteRequests.status, "pending"),
                    sql`${documentWriteRequests.expiresAt} <= ${new Date(now).toISOString()}`,
                ),
            )
            .returning({ chatId: documentWriteRequests.chatId });
        if (!expired) {
            const [winner] = await tx
                .select(documentWriteRequestSelection)
                .from(documentWriteRequests)
                .where(eq(documentWriteRequests.id, requestId))
                .limit(1);
            if (!winner)
                throw new CollaborationError("not_found", "Document write request was not found");
            return { request: asDocumentWriteRequest(winner) };
        }
        await chatAppendAudit(tx, {
            action: "document.write_failed",
            targetType: "document_write_request",
            targetId: requestId,
            chatId: expired.chatId,
            after: { error: DOCUMENT_WRITE_APPROVAL_TIMEOUT_MESSAGE },
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(documentWriteRequests)
            .set({ syncSequence: sequence })
            .where(eq(documentWriteRequests.id, requestId));
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            undefined,
            expired.chatId,
            "document.write_failed",
            requestId,
        );
        const [resolved] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(eq(documentWriteRequests.id, requestId))
            .limit(1);
        if (!resolved) throw new Error("Expired document write request was not found");
        return {
            request: asDocumentWriteRequest(resolved),
            hint: chatHint(sequence, expired.chatId, mutation.pts),
        };
    });
}
