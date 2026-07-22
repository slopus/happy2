import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accountBans, accounts, authSessions, users } from "../schema.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { createId } from "@paralleldrive/cuid2";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { moderationRepairChannelOwnershipForUserDeactivation } from "../moderation/moderationRepairChannelOwnershipForUserDeactivation.js";

/**
 * Applies or clears a server-administrator ban across channel ownership, accountBans, accounts, authSessions, and the product users projection.
 * The transaction makes channel authority, credential authority, visible user state, synchronization, and audit history agree on the same ban decision; unbanning never reclaims ownership.
 */
export async function userSetBanned(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        userId: string;
        banned: boolean;
    },
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        if (input.actorUserId === input.userId)
            throw new CollaborationError("invalid", "An admin cannot ban themselves");
        const [existingUser] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .where(eq(users.id, input.userId));
        if (!existingUser) throw new CollaborationError("not_found", "User was not found");
        const sequence = await syncSequenceNext(tx);
        const [target] = await tx
            .select({
                accountId: users.accountId,
                bannedAt: accounts.bannedAt,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(eq(users.id, input.userId));
        if (!target?.accountId)
            throw new CollaborationError("not_found", "User account was not found");
        const accountId = target.accountId;
        if ((target.bannedAt !== null) === input.banned)
            throw new CollaborationError(
                "conflict",
                input.banned ? "User is already banned" : "User is not banned",
            );
        await tx
            .update(accounts)
            .set({
                bannedAt: input.banned ? sql`CURRENT_TIMESTAMP` : null,
                banExpiresAt: null,
                banReason: input.banned ? "Administrative action" : null,
                bannedByUserId: input.banned ? input.actorUserId : null,
            })
            .where(eq(accounts.id, accountId));
        if (input.banned) {
            await tx.insert(accountBans).values({
                id: createId(),
                accountId,
                bannedByUserId: input.actorUserId,
                reason: "Administrative action",
            });
            await tx
                .update(authSessions)
                .set({
                    revokedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(authSessions.accountId, accountId), isNull(authSessions.revokedAt)));
        } else {
            await tx
                .update(accountBans)
                .set({
                    revokedAt: sql`coalesce(${accountBans.revokedAt}, CURRENT_TIMESTAMP)`,
                    revokedByUserId: sql`coalesce(${accountBans.revokedByUserId}, ${input.actorUserId})`,
                    revokeReason: sql`coalesce(${accountBans.revokeReason}, 'Administrative action')`,
                })
                .where(and(eq(accountBans.accountId, accountId), isNull(accountBans.revokedAt)));
        }
        const ownership = input.banned
            ? await moderationRepairChannelOwnershipForUserDeactivation(tx, {
                  actorUserId: input.actorUserId,
                  orphanPolicy: "clear",
                  sequence,
                  userId: input.userId,
              })
            : [];
        await tx
            .update(users)
            .set({
                active: input.banned ? 0 : 1,
                syncSequence: sequence,
            })
            .where(eq(users.id, input.userId));
        await syncEventInsert(tx, {
            sequence,
            kind: input.banned ? "user.banned" : "user.unbanned",
            entityId: input.userId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: input.banned ? "user.banned" : "user.unbanned",
            targetType: "user",
            targetId: input.userId,
        });
        return {
            hint: {
                ...areaHint(sequence, "users"),
                chats: ownership.map(({ chatId, pts }) => ({ chatId, pts: String(pts) })),
            },
        };
    });
}
