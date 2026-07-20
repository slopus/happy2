import { eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";

/**
 * Deletes one `documents` row only for its owner, cascading its update log and channel
 * attachments while channel members receive `not_found` even though they may collaborate.
 * The same transaction records `document.deleted` so every visible list drops the
 * durable document through the documents area; ownership makes this a distinct boundary.
 */
export async function documentDelete(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
): Promise<{ hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        await documentRowGet(tx, actorUserId, documentId, "owner");
        await tx.delete(documents).where(eq(documents.id, documentId));
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.deleted",
            entityId: documentId,
            actorUserId,
        });
        return { hint: areaHint(sequence, "documents") };
    });
}
