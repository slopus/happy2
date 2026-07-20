import { and, eq, sql } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatHint } from "../chat/chatHint.js";
import type { MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentWriteRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import {
    asDocumentWriteRequest,
    documentWriteRequestSelection,
} from "./impl/documentWriteRequestProjection.js";
import type { DocumentWriteRequestSummary } from "./types.js";

/** Marks one still-pending documentWriteRequests row failed after staged-update application or approval infrastructure fails, recording the bounded error and advancing `document.write_failed` atomically. This terminal fallback exists so the durable agent call observes failure instead of waiting indefinitely after a non-authorization error. */
export async function documentWriteRequestFail(
    executor: DrizzleExecutor,
    input: { actorUserId?: string; chatId: string; requestId: string; error: string },
): Promise<{ request: DocumentWriteRequestSummary; hint?: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const [failed] = await tx
            .update(documentWriteRequests)
            .set({
                status: "failed",
                lastError: input.error.slice(0, 2_000),
                resolvedByUserId: input.actorUserId,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(documentWriteRequests.id, input.requestId),
                    eq(documentWriteRequests.chatId, input.chatId),
                    eq(documentWriteRequests.status, "pending"),
                ),
            )
            .returning({ id: documentWriteRequests.id });
        if (!failed) {
            const [winner] = await tx
                .select(documentWriteRequestSelection)
                .from(documentWriteRequests)
                .where(
                    and(
                        eq(documentWriteRequests.id, input.requestId),
                        eq(documentWriteRequests.chatId, input.chatId),
                    ),
                )
                .limit(1);
            if (!winner) throw new Error("Document write request was not found while failing");
            return { request: asDocumentWriteRequest(winner) };
        }
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "document.write_failed",
            targetType: "document_write_request",
            targetId: input.requestId,
            chatId: input.chatId,
            after: { error: input.error.slice(0, 2_000) },
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
            "document.write_failed",
            input.requestId,
        );
        const [resolved] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(eq(documentWriteRequests.id, input.requestId))
            .limit(1);
        if (!resolved) throw new Error("Failed document write request was not found");
        return {
            request: asDocumentWriteRequest(resolved),
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
