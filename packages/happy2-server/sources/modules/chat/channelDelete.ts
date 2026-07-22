import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, notInArray, sql } from "drizzle-orm";
import { chatMembers, chats } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";

/**
 * Soft-deletes the chats rows for a non-main, non-DM channel tree after confirming private ownership, public creator authority, or server administration and preserving one live channel in its project.
 * Advancing every affected chats and chatUpdates row at one global sequence gives current members terminal sync evidence for the complete tree.
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
            (access.kind === "public_channel"
                ? access.createdByUserId !== input.actorUserId
                : access.membershipRole !== "owner" && access.recoverableMembershipRole !== "owner")
        )
            throw new CollaborationError(
                "forbidden",
                access.kind === "public_channel"
                    ? "Only the channel creator can delete a public channel"
                    : "Only an owner can delete a private channel",
            );
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        const deletedChatIds = [input.chatId, ...descendantIds];
        if (!access.projectId) throw new Error("Channel project is missing");
        const [remainingProjectChannel] = await tx
            .select({ id: chats.id })
            .from(chats)
            .where(
                and(
                    eq(chats.projectId, access.projectId),
                    isNull(chats.deletedAt),
                    notInArray(chats.id, deletedChatIds),
                ),
            )
            .limit(1);
        if (!remainingProjectChannel)
            throw new CollaborationError("invalid", "A project must keep at least one channel");
        const members = await tx
            .select({
                userId: chatMembers.userId,
            })
            .from(chatMembers)
            .where(and(inArray(chatMembers.chatId, deletedChatIds), isNull(chatMembers.leftAt)));
        const sequence = await syncSequenceNext(tx);
        const mutations = [];
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
