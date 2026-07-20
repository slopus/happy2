import { type ChatRole, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";

/**
 * Changes a chatMembers role under the channel's management rules and updates chats ownership when the owner role moves.
 * Applying both records with one channel point prevents permissions from disagreeing with the channel's declared owner.
 */
export async function channelMemberSetRole(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        userId: string;
        role: ChatRole;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.parentMessageId || access.parentChatId)
            throw new CollaborationError("invalid", "Nested chat membership is inherited");
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct-message roles are fixed");
        if (
            input.role === "owner" &&
            !access.isServerAdmin &&
            access.membershipRole !== "owner" &&
            access.recoverableMembershipRole !== "owner"
        )
            throw new CollaborationError("forbidden", "Only an owner can assign ownership");
        const [member] = await tx
            .select({
                role: chatMembers.role,
            })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .limit(1);
        if (!member) throw new CollaborationError("not_found", "Member was not found");
        if (member.role === input.role)
            throw new CollaborationError("conflict", "Member already has this role");
        let replacementOwnerId: string | undefined;
        if (member.role === "owner" && input.role !== "owner") {
            const [another] = await tx
                .select({
                    userId: chatMembers.userId,
                })
                .from(chatMembers)
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        ne(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                        eq(chatMembers.role, "owner"),
                    ),
                )
                .orderBy(chatMembers.joinedAt, chatMembers.userId)
                .limit(1);
            if (!another)
                throw new CollaborationError(
                    "conflict",
                    "Transfer ownership before demoting the only owner",
                );
            replacementOwnerId = another.userId;
        }
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "member.roleChanged",
            input.userId,
            input.userId,
        );
        await tx
            .update(chatMembers)
            .set({
                role: input.role,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                ),
            );
        if (input.role === "owner")
            await tx
                .update(chats)
                .set({
                    ownerUserId: input.userId,
                })
                .where(eq(chats.id, input.chatId));
        else if (replacementOwnerId)
            await tx
                .update(chats)
                .set({
                    ownerUserId: replacementOwnerId,
                })
                .where(and(eq(chats.id, input.chatId), eq(chats.ownerUserId, input.userId)));
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        if (descendantIds.length > 0) {
            await tx
                .update(chatMembers)
                .set({
                    role: input.role,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        inArray(chatMembers.chatId, descendantIds),
                        eq(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                    ),
                );
            const [owner] = await tx
                .select({ ownerUserId: chats.ownerUserId })
                .from(chats)
                .where(eq(chats.id, input.chatId))
                .limit(1);
            await tx
                .update(chats)
                .set({ ownerUserId: owner?.ownerUserId })
                .where(inArray(chats.id, descendantIds));
            for (const chatId of descendantIds)
                await syncEventInsert(tx, {
                    sequence,
                    kind: "member.roleChanged",
                    chatId,
                    entityId: input.userId,
                    actorUserId: input.actorUserId,
                    targetUserId: input.userId,
                });
        }
        return {
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
