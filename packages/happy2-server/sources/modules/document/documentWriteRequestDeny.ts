import { and, eq, sql } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatCanPost } from "../chat/chatCanPost.js";
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

/** Denies one pending documentWriteRequests row for an active member who can post in its chat, records the deciding user, and advances `document.write_denied` in one transaction. This resolution boundary guarantees that denial never applies the staged document updates and immediately gives the held agent call a durable terminal outcome. */
export async function documentWriteRequestDeny(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; requestId: string; now: number },
): Promise<{ request: DocumentWriteRequestSummary; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("forbidden", "Posting chat membership is required");
        const [row] = await tx
            .select({
                id: documentWriteRequests.id,
                status: documentWriteRequests.status,
                expiresAt: documentWriteRequests.expiresAt,
            })
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
        const [updated] = await tx
            .update(documentWriteRequests)
            .set({
                status: "denied",
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
            action: "document.write_denied",
            targetType: "document_write_request",
            targetId: input.requestId,
            chatId: input.chatId,
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
            "document.write_denied",
            input.requestId,
        );
        const [resolved] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(eq(documentWriteRequests.id, input.requestId))
            .limit(1);
        if (!resolved) throw new Error("Denied document write request was not found");
        return {
            request: asDocumentWriteRequest(resolved),
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
