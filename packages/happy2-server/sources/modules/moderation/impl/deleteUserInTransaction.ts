import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { accounts, authSessions, chatMembers, chats, users } from "../../schema.js";
import { and, asc, eq, isNull, sql } from "drizzle-orm";

import { advanceChatMutation } from "./advanceChatMutation.js";
import { syncEventInsert } from "../../sync/syncEventInsert.js";
import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
/**
 * Removes the target from chatMembers, repairs owned chats, revokes authSessions and accounts, then tombstones the users identity.
 * Performing the cascade inside the moderation action prevents deleted users from retaining ownership or authentication when any dependent cleanup fails.
 */
export async function deleteUserInTransaction(
    tx: DrizzleTransaction,
    actorUserId: string,
    targetUserId: string,
): Promise<OperationsSyncHint> {
    if (actorUserId === targetUserId)
        throw new OperationsError("forbidden", "Administrators cannot delete themselves");
    const [target] = await tx
        .select({
            role: users.role,
            accountId: users.accountId,
        })
        .from(users)
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(and(eq(users.id, targetUserId), isNull(users.deletedAt), isNull(accounts.deletedAt)))
        .limit(1);
    if (!target) throw new OperationsError("not_found", "User was not found");
    if (target.role === "admin") {
        const [otherAdmin] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    sql`${users.id} != ${targetUserId}`,
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            )
            .limit(1);
        if (!otherAdmin)
            throw new OperationsError(
                "forbidden",
                "The last active administrator cannot be deleted",
            );
    }
    const sequence = await syncSequenceNextWithTimestamp(tx);
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
                eq(chatMembers.userId, targetUserId),
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
                        sql`${chatMembers.userId} != ${targetUserId}`,
                        isNull(chatMembers.leftAt),
                        isNull(users.deletedAt),
                        eq(accounts.active, 1),
                        isNull(accounts.bannedAt),
                        isNull(accounts.deletedAt),
                    ),
                )
                .orderBy(
                    sql`case ${chatMembers.role} when 'owner' then 0 when 'admin' then 1 else 2 end`,
                    asc(chatMembers.joinedAt),
                    asc(chatMembers.userId),
                )
                .limit(1);
            if (successor) {
                const successorId = successor.userId;
                await tx
                    .update(chatMembers)
                    .set({
                        role: "owner",
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(
                        and(eq(chatMembers.chatId, chatId), eq(chatMembers.userId, successorId)),
                    );
                await tx
                    .update(chats)
                    .set({
                        ownerUserId: successorId,
                    })
                    .where(eq(chats.id, chatId));
                eventKind = "member.deletedAndOwnershipTransferred";
            } else eventKind = "chat.deleted";
        }
        const pts = await advanceChatMutation(tx, {
            sequence,
            chatId,
            kind: eventKind,
            entityId: targetUserId,
            actorUserId,
        });
        chatPoints.push({
            chatId,
            pts: String(pts),
        });
        if (membership.kind !== "dm")
            await tx
                .update(chatMembers)
                .set({
                    leftAt: sql`CURRENT_TIMESTAMP`,
                    removedByUserId: actorUserId,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(chatMembers.chatId, chatId),
                        eq(chatMembers.userId, targetUserId),
                        isNull(chatMembers.leftAt),
                    ),
                );
        if (eventKind === "chat.deleted")
            await tx
                .update(chats)
                .set({
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    deletedByUserId: actorUserId,
                    deleteReason: "last member deleted",
                    ownerUserId: null,
                })
                .where(eq(chats.id, chatId));
    }
    if (!target.accountId) throw new Error("User account is missing");
    const accountId = target.accountId;
    await tx
        .update(authSessions)
        .set({
            revokedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)));
    await tx
        .update(accounts)
        .set({
            deletedAt: sql`CURRENT_TIMESTAMP`,
            active: 0,
            passwordHash: null,
            bannedAt: null,
            banExpiresAt: null,
            banReason: null,
            bannedByUserId: null,
            email: sql`'deleted+' || ${accounts.id} || '@invalid.local'`,
        })
        .where(and(eq(accounts.id, accountId), isNull(accounts.deletedAt)));
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
        .where(and(eq(users.id, targetUserId), isNull(users.deletedAt)));
    await syncEventInsert(tx, {
        sequence,
        kind: "user.deleted",
        entityId: targetUserId,
        actorUserId,
    });
    return {
        sequence: String(sequence),
        chats: chatPoints,
        areas: ["users"],
    };
}
