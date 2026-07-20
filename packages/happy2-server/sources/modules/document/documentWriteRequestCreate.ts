import { and, eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { chatHint } from "../chat/chatHint.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentWriteRequests } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentAttachedRowGet } from "./impl/documentAttachedRowGet.js";
import {
    asDocumentWriteRequest,
    documentWriteRequestSelection,
} from "./impl/documentWriteRequestProjection.js";
import { documentUpdatesValidate } from "./impl/documentUpdatesValidate.js";
import { DOCUMENT_WRITE_APPROVAL_TIMEOUT_MS, type DocumentWriteRequestSummary } from "./types.js";

/** Creates one idempotent pending documentWriteRequests row for an active agent call, after validating the staged Yjs batch and exact chat attachment. The transaction records the title snapshot, five-minute expiry, audit evidence, and `document.write_requested` chat sequence together so the human approval card cannot diverge from the held tool call. */
export async function documentWriteRequestCreate(
    executor: DrizzleExecutor,
    input: {
        id: string;
        actorUserId: string;
        agentUserId: string;
        requesterInstallationId: string;
        sessionId: string;
        callId: string;
        chatId: string;
        documentId: string;
        clientUpdateId: string;
        updates: readonly unknown[];
        now: number;
    },
): Promise<{ created: boolean; hint?: MutationHint; request: DocumentWriteRequestSummary }> {
    const updates = documentUpdatesValidate(input.updates);
    return withTransaction(executor, async (tx) => {
        const [existing] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(
                and(
                    eq(
                        documentWriteRequests.requesterInstallationId,
                        input.requesterInstallationId,
                    ),
                    eq(documentWriteRequests.callId, input.callId),
                ),
            )
            .limit(1);
        if (existing) return { created: false, request: asDocumentWriteRequest(existing) };
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError(
                "forbidden",
                "The originating user can no longer post in this chat",
            );
        const document = await documentAttachedRowGet(tx, input.chatId, input.documentId);
        const expiresAt = new Date(input.now + DOCUMENT_WRITE_APPROVAL_TIMEOUT_MS).toISOString();
        const [inserted] = await tx
            .insert(documentWriteRequests)
            .values({
                id: input.id,
                status: "pending",
                chatId: input.chatId,
                actorUserId: input.actorUserId,
                agentUserId: input.agentUserId,
                requesterInstallationId: input.requesterInstallationId,
                sessionId: input.sessionId,
                callId: input.callId,
                documentId: input.documentId,
                documentTitle: document.title,
                clientUpdateId: input.clientUpdateId,
                updatesJson: JSON.stringify(updates),
                expiresAt,
            })
            .onConflictDoNothing()
            .returning({ id: documentWriteRequests.id });
        if (!inserted) {
            const [winner] = await tx
                .select(documentWriteRequestSelection)
                .from(documentWriteRequests)
                .where(
                    and(
                        eq(
                            documentWriteRequests.requesterInstallationId,
                            input.requesterInstallationId,
                        ),
                        eq(documentWriteRequests.callId, input.callId),
                    ),
                )
                .limit(1);
            if (!winner) throw new Error("Concurrent document write request was not found");
            return { created: false, request: asDocumentWriteRequest(winner) };
        }
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "document.write_requested",
            targetType: "document_write_request",
            targetId: input.id,
            chatId: input.chatId,
            after: {
                agentUserId: input.agentUserId,
                requesterInstallationId: input.requesterInstallationId,
                documentId: input.documentId,
                clientUpdateId: input.clientUpdateId,
                expiresAt,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(documentWriteRequests)
            .set({ syncSequence: sequence })
            .where(eq(documentWriteRequests.id, input.id));
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "document.write_requested",
            input.id,
        );
        const [created] = await tx
            .select(documentWriteRequestSelection)
            .from(documentWriteRequests)
            .where(eq(documentWriteRequests.id, input.id))
            .limit(1);
        if (!created) throw new Error("Document write request projection was not found");
        return {
            created: true,
            hint: chatHint(sequence, input.chatId, mutation.pts),
            request: asDocumentWriteRequest(created),
        };
    });
}
