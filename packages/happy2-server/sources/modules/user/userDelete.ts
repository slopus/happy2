import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accounts, authSessions, chatMembers, chats, users } from "../schema.js";
import { and, eq, isNull, ne, sql } from "drizzle-orm";

import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

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
        const chatPoints: Array<{
            chatId: string;
            pts: string;
        }> = [];
        for (const membership of memberships) {
            const chatId = membership.chatId;
            let eventKind = "member.deleted";
            if (membership.kind !== "dm" && membership.role === "owner") {
                const [remainingOwner] = await tx
                    .select({
                        userId: chatMembers.userId,
                    })
                    .from(chatMembers)
                    .where(
                        and(
                            eq(chatMembers.chatId, chatId),
                            ne(chatMembers.userId, input.userId),
                            isNull(chatMembers.leftAt),
                            eq(chatMembers.role, "owner"),
                        ),
                    )
                    .limit(1);
                let replacementOwnerId = remainingOwner?.userId;
                if (!replacementOwnerId) {
                    const [successor] = await tx
                        .select({
                            userId: chatMembers.userId,
                        })
                        .from(chatMembers)
                        .innerJoin(users, eq(users.id, chatMembers.userId))
                        .innerJoin(accounts, eq(accounts.id, users.accountId))
                        .where(
                            and(
                                eq(chatMembers.chatId, chatId),
                                ne(chatMembers.userId, input.userId),
                                isNull(chatMembers.leftAt),
                                isNull(users.deletedAt),
                                eq(accounts.active, 1),
                                isNull(accounts.bannedAt),
                                isNull(accounts.deletedAt),
                            ),
                        )
                        .orderBy(
                            sql`case ${chatMembers.role} when 'admin' then 0 else 1 end`,
                            chatMembers.joinedAt,
                            chatMembers.userId,
                        )
                        .limit(1);
                    if (successor) {
                        replacementOwnerId = successor.userId;
                        await tx
                            .update(chatMembers)
                            .set({
                                role: "owner",
                                syncSequence: sequence,
                                updatedAt: sql`CURRENT_TIMESTAMP`,
                            })
                            .where(
                                and(
                                    eq(chatMembers.chatId, chatId),
                                    eq(chatMembers.userId, successor.userId),
                                ),
                            );
                        eventKind = "member.deletedAndOwnershipTransferred";
                    } else {
                        eventKind = "chat.deletedWithLastMember";
                    }
                }
                if (replacementOwnerId)
                    await tx
                        .update(chats)
                        .set({
                            ownerUserId: replacementOwnerId,
                        })
                        .where(and(eq(chats.id, chatId), eq(chats.ownerUserId, input.userId)));
            }
            const mutation = await chatAdvanceWithSequence(
                tx,
                sequence,
                input.actorUserId,
                chatId,
                eventKind,
                input.userId,
                input.userId,
            );
            chatPoints.push({
                chatId,
                pts: String(mutation.pts),
            });
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
            if (eventKind === "chat.deletedWithLastMember")
                await tx
                    .update(chats)
                    .set({
                        deletedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(chats.id, chatId));
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
