import { and, asc, eq, gt, lte } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentUpdates, documents } from "../schema.js";
import { documentAudienceGet } from "./impl/documentAudienceGet.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import {
    documentStoredUpdateDecode,
    documentUpdateDecode,
    documentUpdatesMerge,
} from "./impl/updateCodec.js";
import { documentUpdatesValidate } from "./impl/documentUpdatesValidate.js";
import {
    DOCUMENT_COMPACTION_INTERVAL,
    DOCUMENT_UPDATE_RETENTION,
    type DocumentRealtimeAudience,
    type DocumentSummary,
} from "./types.js";

/**
 * Appends one client batch of opaque Yjs updates as the next sequenced row in
 * `documentUpdates` and advances the head sequence on `documents`, replaying an already
 * accepted `clientUpdateId` idempotently instead of writing twice. The owner may always
 * write; another actor must be able to post in any attached channel, with denial reported
 * as `not_found` so attachment is not probeable. Every
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
    audience: DocumentRealtimeAudience;
}> {
    const updates = documentUpdatesValidate(input.updates);
    const decoded = updates.map((update, index) =>
        documentUpdateDecode(update, `updates[${index}]`, Number.POSITIVE_INFINITY),
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
                document: await documentSummaryGet(tx, input.actorUserId, row),
                acceptedSequence: String(replayedRow.sequence),
                replayed: true,
                audience: await documentAudienceGet(tx, row),
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
            .where(
                and(
                    eq(documents.id, input.documentId),
                    eq(documents.lastSequence, row.lastSequence),
                ),
            )
            .returning();
        if (!updated) throw new CollaborationError("conflict", "Document changed concurrently");
        return {
            document: await documentSummaryGet(tx, input.actorUserId, updated),
            acceptedSequence: String(accepted),
            replayed: false,
            audience: await documentAudienceGet(tx, updated),
        };
    });
}
