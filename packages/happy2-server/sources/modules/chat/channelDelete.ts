import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { chatMembers, chats, messages } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";

/**
 * Soft-deletes a non-main, non-DM chats channel and every parent-message descendant after confirming owner or server-administrator authority.
 * Advancing each chats and chatUpdates row at one global sequence gives every current member terminal sync evidence for the complete tree.
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
        if (
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.recoverableMembershipRole !== "owner"
        )
            throw new CollaborationError("forbidden", "Only an owner can delete a channel");
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        const deletedChatIds = [input.chatId, ...descendantIds];
        const members = await tx
            .select({
                userId: chatMembers.userId,
            })
            .from(chatMembers)
            .where(and(inArray(chatMembers.chatId, deletedChatIds), isNull(chatMembers.leftAt)));
        const sequence = await syncSequenceNext(tx);
        const mutations = [];
        if (access.parentMessageId) {
            const [parent] = await tx
                .select({ chatId: messages.chatId })
                .from(messages)
                .where(eq(messages.id, access.parentMessageId))
                .limit(1);
            if (!parent) throw new Error("Thread chat has no durable parent message");
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    parent.chatId,
                    "message.threadDeleted",
                    access.parentMessageId,
                ),
            );
        }
        for (const chatId of deletedChatIds)
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    "chat.deleted",
                    chatId,
                ),
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
            .where(inArray(chats.id, deletedChatIds));
        return {
            hint: {
                sequence: String(sequence),
                chats: mutations.map((mutation) => ({
                    chatId: mutation.chatId,
                    pts: String(mutation.pts),
                })),
                areas: [],
            },
            memberUserIds: [...new Set(members.map((row) => row.userId))],
        };
    });
}
