import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentRigBindings, chatMembers, chats, users } from "../schema.js";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { chatDescendantMembershipSync } from "./impl/chatDescendantMembershipSync.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";
import { areaHint } from "./areaHint.js";

/**
 * Revokes a managed chatMembers relationship, repairs chats ownership when necessary, and detaches agentRigBindings that depended on it.
 * Recording removal provenance blocks self-rejoin even when the target had already left voluntarily, while one transaction revokes descendant visibility and emits sync evidence.
 */
export async function channelMemberRemove(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        userId: string;
    },
): Promise<{
    hint: MutationHint;
    documentsHint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.parentMessageId || access.parentChatId)
            throw new CollaborationError("invalid", "Nested chat membership is inherited");
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct-message membership is fixed");
        if (access.isMain)
            throw new CollaborationError(
                "invalid",
                "Members cannot be removed from the main channel",
            );
        const [target] = await tx
            .select({
                agentRole: users.agentRole,
            })
            .from(users)
            .where(eq(users.id, input.userId))
            .limit(1);
        if (target?.agentRole === "default")
            throw new CollaborationError(
                "invalid",
                "The default agent must remain available in every channel",
            );
        if (access.defaultAgentUserId === input.userId)
            throw new CollaborationError(
                "conflict",
                "Choose another default agent before removing this channel member",
            );
        const [member] = await tx
            .select({
                role: chatMembers.role,
            })
            .from(chatMembers)
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.removedByUserId),
                ),
            )
            .limit(1);
        if (!member) throw new CollaborationError("not_found", "Member was not found");
        if (member.role === "owner" && !access.isServerAdmin)
            throw new CollaborationError("forbidden", "Only a server admin can remove an owner");
        let replacementOwnerUserId: string | undefined;
        if (member.role === "owner") {
            const [otherOwner] = await tx
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
            let replacementOwnerId = otherOwner?.userId;
            if (!replacementOwnerId) {
                const [successor] = await tx
                    .select({
                        userId: chatMembers.userId,
                    })
                    .from(chatMembers)
                    .where(
                        and(
                            eq(chatMembers.chatId, input.chatId),
                            ne(chatMembers.userId, input.userId),
                            isNull(chatMembers.leftAt),
                        ),
                    )
                    .orderBy(
                        sql`case ${chatMembers.role} when 'admin' then 0 else 1 end`,
                        chatMembers.joinedAt,
                        chatMembers.userId,
                    )
                    .limit(1);
                if (!successor)
                    throw new CollaborationError(
                        "conflict",
                        "The last channel owner cannot be removed",
                    );
                await tx
                    .update(chatMembers)
                    .set({
                        role: "owner",
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(
                            eq(chatMembers.chatId, input.chatId),
                            eq(chatMembers.userId, successor.userId),
                        ),
                    );
                replacementOwnerId = successor.userId;
            }
            await tx
                .update(chats)
                .set({
                    ownerUserId: replacementOwnerId,
                })
                .where(and(eq(chats.id, input.chatId), eq(chats.ownerUserId, input.userId)));
            replacementOwnerUserId = replacementOwnerId;
        }
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "member.removed",
            input.userId,
            input.userId,
        );
        await tx
            .update(chatMembers)
            .set({
                leftAt: sql`CURRENT_TIMESTAMP`,
                removedByUserId: input.actorUserId,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(chatMembers.chatId, input.chatId),
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.removedByUserId),
                ),
            );
        const documentsChanged = await chatDescendantMembershipSync(tx, {
            ancestorChatId: input.chatId,
            userId: input.userId,
            actorUserId: input.actorUserId,
            sequence,
            kind: "removed",
            replacementOwnerUserId,
        });
        const affectedChatIds = [input.chatId, ...(await chatDescendantIds(tx, input.chatId))];
        await tx
            .delete(agentRigBindings)
            .where(
                and(
                    inArray(agentRigBindings.chatId, affectedChatIds),
                    eq(agentRigBindings.userId, input.userId),
                ),
            );
        return {
            hint: chatHint(sequence, input.chatId, mutation.pts),
            ...(documentsChanged ? { documentsHint: areaHint(sequence, "documents") } : {}),
        };
    });
}
