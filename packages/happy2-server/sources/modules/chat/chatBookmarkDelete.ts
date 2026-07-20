import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq } from "drizzle-orm";
import { chatBookmarks } from "../schema.js";
import { chatHint } from "./chatHint.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Deletes only the actor-owned chatBookmarks row identified by the request and rejects bookmarks belonging to another user.
 * The synchronized removal makes a personal bookmark disappear across devices without exposing or modifying another member's saved state.
 */
export async function chatBookmarkDelete(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        bookmarkId: string;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access) throw new CollaborationError("not_found", "Chat was not found");
        const [bookmark] = await tx
            .select({
                createdByUserId: chatBookmarks.createdByUserId,
            })
            .from(chatBookmarks)
            .where(
                and(eq(chatBookmarks.id, input.bookmarkId), eq(chatBookmarks.chatId, input.chatId)),
            )
            .limit(1);
        if (!bookmark) throw new CollaborationError("not_found", "Bookmark was not found");
        if (
            bookmark.createdByUserId !== input.actorUserId &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.membershipRole !== "admin" &&
            access.recoverableMembershipRole !== "owner" &&
            access.recoverableMembershipRole !== "admin"
        )
            throw new CollaborationError("forbidden", "Cannot delete this bookmark");
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "bookmark.deleted",
            input.bookmarkId,
        );
        await tx
            .delete(chatBookmarks)
            .where(
                and(eq(chatBookmarks.id, input.bookmarkId), eq(chatBookmarks.chatId, input.chatId)),
            );
        return {
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
