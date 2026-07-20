import { and, asc, eq, gt } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { documentUpdates } from "../schema.js";
import { documentRowGet } from "./impl/documentRowGet.js";
import { documentSummaryGet } from "./impl/documentSummaryGet.js";
import { DOCUMENT_DIFFERENCE_MAX_LIMIT, type DocumentDifference } from "./types.js";

/**
 * Returns the sequenced updates a client is missing after its cursor, falling back to
 * the compacted snapshot when the cursor predates the retained log floor. Owners always
 * have access; other callers need membership in any attached channel and denial is
 * `not_found`. The bounded `hasMore` slice preserves the sync boundary without a durable write.
 */
export async function documentGetDifference(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        documentId: string;
        afterSequence: number;
        limit: number;
    },
): Promise<DocumentDifference> {
    const limit = Math.min(Math.max(input.limit, 1), DOCUMENT_DIFFERENCE_MAX_LIMIT);
    const row = await documentRowGet(executor, input.actorUserId, input.documentId, "read");
    if (input.afterSequence > row.lastSequence)
        throw new CollaborationError("future_state", "Document cursor is ahead of the server");
    const includeSnapshot = input.afterSequence < row.snapshotSequence;
    const floor = includeSnapshot ? row.snapshotSequence : input.afterSequence;
    const rows = await executor
        .select({ sequence: documentUpdates.sequence, update: documentUpdates.update })
        .from(documentUpdates)
        .where(
            and(
                eq(documentUpdates.documentId, input.documentId),
                gt(documentUpdates.sequence, floor),
            ),
        )
        .orderBy(asc(documentUpdates.sequence))
        .limit(limit + 1);
    const hasMore = rows.length > limit;
    const updates = (hasMore ? rows.slice(0, limit) : rows).map((entry) => ({
        sequence: String(entry.sequence),
        update: entry.update,
    }));
    return {
        document: await documentSummaryGet(executor, input.actorUserId, row),
        ...(includeSnapshot
            ? {
                  snapshot: {
                      update: row.snapshotUpdate,
                      sequence: String(row.snapshotSequence),
                  },
              }
            : {}),
        updates,
        latestSequence: String(row.lastSequence),
        hasMore,
    };
}
