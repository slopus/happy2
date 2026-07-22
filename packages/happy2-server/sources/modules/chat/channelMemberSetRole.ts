import { type ChatRole, CollaborationError, type MutationHint } from "./types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, ne, sql } from "drizzle-orm";
import { chatHint } from "./chatHint.js";
import { chatMembers, chats, users } from "../schema.js";

import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatRequireManager } from "./chatRequireManager.js";

/**
 * Changes one active chatMembers role under that channel's independent management rules and atomically transfers private ownership.
 * Assigning owner demotes every prior owner row so a future rejoin cannot recreate a second owner; parent roles never propagate into children.
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
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct-message roles are fixed");
        if (access.kind === "public_channel" && input.role === "owner")
            throw new CollaborationError("invalid", "Public channels do not have owners");
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
        if (input.role === "owner") {
            const [eligibleOwner] = await tx
                .select({ id: users.id })
                .from(users)
                .where(
                    and(
                        eq(users.id, input.userId),
                        eq(users.kind, "human"),
                        eq(users.active, 1),
                        isNull(users.deletedAt),
                    ),
                )
                .limit(1);
            if (!eligibleOwner)
                throw new CollaborationError(
                    "invalid",
                    "Channel ownership requires an active human",
                );
        }
        let replacementOwnerId: string | undefined;
        if (member.role === "owner" && input.role !== "owner") {
            const [another] = await tx
                .select({
                    userId: chatMembers.userId,
                })
                .from(chatMembers)
                .innerJoin(users, eq(users.id, chatMembers.userId))
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        ne(chatMembers.userId, input.userId),
                        isNull(chatMembers.leftAt),
                        eq(chatMembers.role, "owner"),
                        eq(users.kind, "human"),
                        eq(users.active, 1),
                        isNull(users.deletedAt),
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
        if (input.role === "owner")
            await tx
                .update(chatMembers)
                .set({
                    role: "admin",
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, input.chatId),
                        eq(chatMembers.role, "owner"),
                        ne(chatMembers.userId, input.userId),
                    ),
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
        return {
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
