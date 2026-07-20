import { and, asc, eq, gt, lte } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentUpdates } from "../schema.js";
import { documentAttachedRowGet } from "./impl/documentAttachedRowGet.js";
import { documentStoredUpdateDecode, documentUpdatesMerge } from "./impl/updateCodec.js";
import type { DocumentHostSummary, DocumentSnapshot } from "./types.js";

/** Returns a transactionally consistent Yjs snapshot only when the token actor remains an active member of the exact plugin chat and the document remains attached there. Capturing the document row and bounding retained updates to its advertised last sequence prevents compaction or concurrent writes from producing a snapshot from two database moments. */
export async function documentGetForChatHost(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    documentId: string,
): Promise<{ document: DocumentHostSummary; snapshot: DocumentSnapshot }> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, actorUserId, chatId, true)))
            throw new CollaborationError("not_found", "Chat was not found");
        const row = await documentAttachedRowGet(tx, chatId, documentId);
        const pending = await tx
            .select({ update: documentUpdates.update })
            .from(documentUpdates)
            .where(
                and(
                    eq(documentUpdates.documentId, documentId),
                    gt(documentUpdates.sequence, row.snapshotSequence),
                    lte(documentUpdates.sequence, row.lastSequence),
                ),
            )
            .orderBy(asc(documentUpdates.sequence));
        return {
            document: {
                id: row.id,
                title: row.title,
                format: row.format as DocumentHostSummary["format"],
                latestSequence: String(row.lastSequence),
                updatedAt: row.updatedAt,
            },
            snapshot: {
                update: documentUpdatesMerge([
                    documentStoredUpdateDecode(row.snapshotUpdate),
                    ...pending.map((entry) => documentStoredUpdateDecode(entry.update)),
                ]),
                sequence: String(row.lastSequence),
            },
        };
    });
}
