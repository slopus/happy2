import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Soft-deletes a non-main, non-DM chats channel after confirming the actor is its owner or server administrator.
 * Advancing channel and global sync state with the deletion gives every current member the same terminal channel version.
 */
export async function channelDelete(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        reason?: string;
    },
): Promise<{
    hint: MutationHint;
    memberUserIds: string[];
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages cannot be deleted");
        if (access.isMain)
            throw new CollaborationError("invalid", "The main channel cannot be deleted");
        if (!access.isServerAdmin && access.membershipRole !== "owner")
            throw new CollaborationError("forbidden", "Only an owner can delete a channel");
        const members = await tx
            .select({
                userId: chatMembers.userId,
            })
            .from(chatMembers)
            .where(and(eq(chatMembers.chatId, input.chatId), isNull(chatMembers.leftAt)));
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "chat.deleted",
            input.chatId,
        );
        await tx
            .update(chats)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: input.actorUserId,
                deleteReason: input.reason ?? null,
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(chats.id, input.chatId));
        return {
            hint: chatHint(sequence, input.chatId, mutation.pts),
            memberUserIds: members.map((row) => row.userId),
        };
    });
}
