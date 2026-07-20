import { and, asc, eq, gt } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { documentUpdates } from "../schema.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { documentStoredUpdateDecode, documentUpdatesMerge } from "./impl/updateCodec.js";
import { type DocumentSnapshot, type DocumentSummary } from "./types.js";

/**
 * Returns one document summary together with a single merged Yjs snapshot covering the
 * complete current content for its owner or a member of any attached channel, so an
 * opening client hydrates from one blob and then follows the update stream. Denial is
 * `not_found` so attachments cannot be probed; the opaque merge performs no durable mutation.
 */
export async function documentGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
): Promise<{ document: DocumentSummary; snapshot: DocumentSnapshot }> {
    const row = await documentRowGet(executor, actorUserId, documentId, "read");
    const pending = await executor
        .select({ update: documentUpdates.update })
        .from(documentUpdates)
        .where(
            and(
                eq(documentUpdates.documentId, documentId),
                gt(documentUpdates.sequence, row.snapshotSequence),
            ),
        )
        .orderBy(asc(documentUpdates.sequence));
    const update = documentUpdatesMerge([
        documentStoredUpdateDecode(row.snapshotUpdate),
        ...pending.map((entry) => documentStoredUpdateDecode(entry.update)),
    ]);
    return {
        document: await documentSummaryGet(executor, actorUserId, row),
        snapshot: { update, sequence: String(row.lastSequence) },
    };
}
