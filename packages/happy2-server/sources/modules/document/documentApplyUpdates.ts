import { and, asc, eq, gt, lte, sql } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentUpdates, documents } from "../schema.js";
import { documentProjection } from "./impl/documentProjection.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import {
    documentStoredUpdateDecode,
    documentUpdateDecode,
    documentUpdatesMerge,
} from "./impl/updateCodec.js";
import {
    DOCUMENT_COMPACTION_INTERVAL,
    DOCUMENT_UPDATE_RETENTION,
    MAX_DOCUMENT_BATCH_BYTES,
    MAX_DOCUMENT_UPDATE_BATCH,
    MAX_DOCUMENT_UPDATE_BYTES,
    type DocumentSummary,
} from "./types.js";

/**
 * Appends one client batch of opaque Yjs updates as the next sequenced row in
 * `documentUpdates` and advances the head sequence on `documents`, replaying an already
 * accepted `clientUpdateId` idempotently instead of writing twice. Every
 * `DOCUMENT_COMPACTION_INTERVAL` batches the same transaction merges the log into the
 * `documents` snapshot and trims rows older than the replay-retention window, so storage
 * stays bounded while retried batches keep detecting their earlier commit.
 */
export async function documentApplyUpdates(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        documentId: string;
        clientUpdateId: string;
        updates: readonly unknown[];
    },
): Promise<{
    document: DocumentSummary;
    acceptedSequence: string;
    replayed: boolean;
}> {
    if (
        !Array.isArray(input.updates) ||
        input.updates.length === 0 ||
        input.updates.length > MAX_DOCUMENT_UPDATE_BATCH
    )
        throw new CollaborationError(
            "invalid",
            `updates must contain between 1 and ${MAX_DOCUMENT_UPDATE_BATCH} entries`,
        );
    const decoded = input.updates.map((update, index) =>
        documentUpdateDecode(update, `updates[${index}]`, MAX_DOCUMENT_UPDATE_BYTES),
    );
    const totalBytes = decoded.reduce((total, update) => total + update.byteLength, 0);
    if (totalBytes > MAX_DOCUMENT_BATCH_BYTES)
        throw new CollaborationError(
            "invalid",
            `updates must decode to at most ${MAX_DOCUMENT_BATCH_BYTES} bytes in total`,
        );
    const merged = documentUpdatesMerge(decoded);
    return withTransaction(executor, async (tx) => {
        const row = await documentRowGet(tx, input.actorUserId, input.documentId, "write");
        const [replayedRow] = await tx
            .select({ sequence: documentUpdates.sequence })
            .from(documentUpdates)
            .where(
                and(
                    eq(documentUpdates.documentId, input.documentId),
                    eq(documentUpdates.clientUpdateId, input.clientUpdateId),
                ),
            )
            .limit(1);
        if (replayedRow)
            return {
                document: documentProjection(row),
                acceptedSequence: String(replayedRow.sequence),
                replayed: true,
            };
        const accepted = row.lastSequence + 1;
        const updatedAt = new Date().toISOString();
        await tx.insert(documentUpdates).values({
            documentId: input.documentId,
            sequence: accepted,
            update: merged,
            clientUpdateId: input.clientUpdateId,
            actorUserId: input.actorUserId,
            createdAt: updatedAt,
        });
        let snapshotUpdate = row.snapshotUpdate;
        let snapshotSequence = row.snapshotSequence;
        if (accepted - row.snapshotSequence >= DOCUMENT_COMPACTION_INTERVAL) {
            const pending = await tx
                .select({ update: documentUpdates.update })
                .from(documentUpdates)
                .where(
                    and(
                        eq(documentUpdates.documentId, input.documentId),
                        gt(documentUpdates.sequence, row.snapshotSequence),
                    ),
                )
                .orderBy(asc(documentUpdates.sequence));
            snapshotUpdate = documentUpdatesMerge([
                documentStoredUpdateDecode(row.snapshotUpdate),
                ...pending.map((entry) => documentStoredUpdateDecode(entry.update)),
            ]);
            snapshotSequence = accepted;
            await tx
                .delete(documentUpdates)
                .where(
                    and(
                        eq(documentUpdates.documentId, input.documentId),
                        lte(documentUpdates.sequence, accepted - DOCUMENT_UPDATE_RETENTION),
                    ),
                );
        }
        const [updated] = await tx
            .update(documents)
            .set({
                lastSequence: accepted,
                snapshotUpdate,
                snapshotSequence,
                updatedAt,
            })
            .where(and(eq(documents.id, input.documentId), eq(documents.lastSequence, row.lastSequence)))
            .returning();
        if (!updated) throw new CollaborationError("conflict", "Document changed concurrently");
        return {
            document: documentProjection(updated),
            acceptedSequence: String(accepted),
            replayed: false,
        };
    });
}
