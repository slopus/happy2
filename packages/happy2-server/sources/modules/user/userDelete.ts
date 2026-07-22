import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accounts, authSessions, chatMembers, chats, users } from "../schema.js";
import { and, eq, isNull, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { moderationRepairChannelOwnershipForUserDeactivation } from "../moderation/moderationRepairChannelOwnershipForUserDeactivation.js";

/**
 * Removes the target from chatMembers, repairs owned chats, disables accounts and authSessions, and tombstones the users profile after administrator checks.
 * The audited cascade prevents a deleted identity from retaining authentication, channel ownership, or membership through a partial cleanup.
 */
export async function userDelete(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        userId: string;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (input.actorUserId === input.userId)
            throw new CollaborationError("invalid", "An admin cannot delete themselves");
        await userRequireActive(tx, input.userId);
        const sequence = await syncSequenceNext(tx);
        const memberships = await tx
            .select({
                chatId: chatMembers.chatId,
                role: chatMembers.role,
                kind: chats.kind,
            })
            .from(chatMembers)
            .innerJoin(chats, eq(chats.id, chatMembers.chatId))
            .where(
                and(
                    eq(chatMembers.userId, input.userId),
                    isNull(chatMembers.leftAt),
                    isNull(chats.deletedAt),
                ),
            );
        const ownership = await moderationRepairChannelOwnershipForUserDeactivation(tx, {
            actorUserId: input.actorUserId,
            orphanPolicy: "delete",
            sequence,
            userId: input.userId,
        });
        const repairedChatIds = new Set(ownership.map(({ chatId }) => chatId));
        const chatPoints = ownership.map(({ chatId, pts }) => ({
            chatId,
            pts: String(pts),
        }));
        for (const membership of memberships) {
            const chatId = membership.chatId;
            if (!repairedChatIds.has(chatId)) {
                const mutation = await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    "member.deleted",
                    input.userId,
                    input.userId,
                );
                chatPoints.push({
                    chatId,
                    pts: String(mutation.pts),
                });
            }
            if (membership.kind !== "dm")
                await tx
                    .update(chatMembers)
                    .set({
                        leftAt: sql`CURRENT_TIMESTAMP`,
                        syncSequence: sequence,
                    })
                    .where(
                        and(
                            eq(chatMembers.chatId, chatId),
                            eq(chatMembers.userId, input.userId),
                            isNull(chatMembers.leftAt),
                        ),
                    );
        }
        const [target] = await tx
            .select({
                accountId: users.accountId,
            })
            .from(users)
            .where(eq(users.id, input.userId));
        if (!target?.accountId)
            throw new CollaborationError("not_found", "User account was not found");
        const accountId = target.accountId;
        await tx
            .update(accounts)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                active: 0,
                passwordHash: null,
                email: sql`'deleted+' || ${accounts.id} || '@invalid.local'`,
            })
            .where(eq(accounts.id, accountId));
        await tx
            .update(authSessions)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)));
        await tx
            .update(users)
            .set({
                active: 0,
                deletedAt: sql`CURRENT_TIMESTAMP`,
                syncSequence: sequence,
                firstName: "Deleted",
                lastName: null,
                title: null,
                username: sql`'deleted_' || ${users.id}`,
                email: null,
                phone: null,
                photoFileId: null,
            })
            .where(eq(users.id, input.userId));
        await syncEventInsert(tx, {
            sequence,
            kind: "user.deleted",
            entityId: input.userId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "user.deleted",
            targetType: "user",
            targetId: input.userId,
        });
        return {
            hint: {
                sequence: String(sequence),
                chats: chatPoints,
                areas: ["users"],
            },
        };
    });
}
