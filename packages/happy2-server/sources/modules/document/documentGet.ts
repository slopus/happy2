import { and, asc, eq, gt } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { documentUpdates } from "../schema.js";
import { documentProjection } from "./impl/documentProjection.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentStoredUpdateDecode, documentUpdatesMerge } from "./impl/updateCodec.js";
import { type DocumentSnapshot, type DocumentSummary } from "./types.js";

/**
 * Returns one document summary together with a single merged Yjs snapshot covering the
 * complete current content, so an opening client hydrates from one blob and then follows
 * the update stream. The merge treats stored updates as opaque bytes and performs no
 * durable mutation.
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
        document: documentProjection(row),
        snapshot: { update, sequence: String(row.lastSequence) },
    };
}
