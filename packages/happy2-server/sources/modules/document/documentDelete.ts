import { eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documents } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { documentRowGet } from "./impl/documentRowGet.js";

/**
 * Deletes one document row from `documents` for an actor who may post to the owning
 * chat, letting the `documentUpdates` log follow by cascade. The same transaction
 * records a `document.deleted` sync event so document lists drop the document through
 * the `documents` area rather than trusting the realtime hint.
 */
export async function documentDelete(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
): Promise<{ chatId: string; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const row = await documentRowGet(tx, actorUserId, documentId, "write");
        await tx.delete(documents).where(eq(documents.id, documentId));
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "document.deleted",
            entityId: documentId,
            actorUserId,
        });
        return { chatId: row.chatId, hint: areaHint(sequence, "documents") };
    });
}
