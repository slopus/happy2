import { areaHint } from "../chat/areaHint.js";
import { chatCanPost } from "../chat/chatCanPost.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { drafts } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { type DraftSummary } from "./types.js";

/**
 * Replaces one actor-owned row in `drafts`, retaining empty text as a deletion tombstone, and records its personal sync invalidation atomically.
 * The timestamped tombstone gives every node the same last-write-wins boundary for clearing text as for replacing it.
 */
export async function draftUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        text: string;
    },
): Promise<{
    draft: DraftSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatCanPost(tx, input.actorUserId, input.chatId)))
            throw new CollaborationError("not_found", "Chat was not found");
        const sequence = await syncSequenceNext(tx);
        const updatedAt = new Date().toISOString();
        const [row] = await tx
            .insert(drafts)
            .values({
                userId: input.actorUserId,
                chatId: input.chatId,
                text: input.text,
                syncSequence: sequence,
                createdAt: updatedAt,
                updatedAt,
            })
            .onConflictDoUpdate({
                target: [drafts.userId, drafts.chatId],
                set: {
                    text: input.text,
                    syncSequence: sequence,
                    updatedAt,
                },
            })
            .returning({
                chatId: drafts.chatId,
                text: drafts.text,
                revision: drafts.syncSequence,
                updatedAt: drafts.updatedAt,
            });
        if (!row) throw new Error("Draft was not saved");
        const draft: DraftSummary = {
            chatId: row.chatId,
            text: row.text,
            revision: String(row.revision),
            updatedAt: row.updatedAt,
        };
        await syncEventInsert(tx, {
            sequence,
            kind: input.text.length === 0 ? "draft.deleted" : "draft.updated",
            entityId: input.chatId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return {
            draft,
            hint: areaHint(sequence, "drafts"),
        };
    });
}
