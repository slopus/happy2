import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { accountBans, accounts, authSessions, users } from "../../schema.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { accountTargetDb } from "./accountTargetDb.js";
import { closeElapsedBan } from "./closeElapsedBan.js";
import { syncUserMutation } from "./syncUserMutation.js";
import { syncSequenceNextWithTimestamp } from "../../sync/syncSequenceNextWithTimestamp.js";
import { moderationRepairChannelOwnershipForUserDeactivation } from "../moderationRepairChannelOwnershipForUserDeactivation.js";
/**
 * Inserts accountBans state, repairs owned channels, disables accounts, and revokes authSessions as one branch of a larger moderation action.
 * Reusing one sequence and action transaction keeps channel authority, access cutoff, report resolution, notification, and audit evidence atomic.
 */
export async function applyBanInTransaction(
    tx: DrizzleTransaction,
    actorUserId: string,
    targetUserId: string,
    reason?: string,
    expiresAt?: string,
): Promise<OperationsSyncHint> {
    if (actorUserId === targetUserId)
        throw new OperationsError("forbidden", "Administrators cannot ban themselves");
    const target = await accountTargetDb(tx, targetUserId);
    await closeElapsedBan(tx, target);
    if (target.bannedAt && (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now()))
        throw new OperationsError("conflict", "User already has an active ban");
    await tx.insert(accountBans).values({
        id: createId(),
        accountId: target.accountId,
        bannedByUserId: actorUserId,
        reason,
        expiresAt,
    });
    await tx
        .update(accounts)
        .set({
            bannedAt: sql`CURRENT_TIMESTAMP`,
            banExpiresAt: expiresAt ?? null,
            banReason: reason ?? null,
            bannedByUserId: actorUserId,
        })
        .where(eq(accounts.id, target.accountId));
    const sequence = await syncSequenceNextWithTimestamp(tx);
    const ownership = await moderationRepairChannelOwnershipForUserDeactivation(tx, {
        actorUserId,
        orphanPolicy: "clear",
        sequence,
        userId: target.userId,
    });
    await tx.update(users).set({ active: 0 }).where(eq(users.id, target.userId));
    await tx
        .update(authSessions)
        .set({
            revokedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(authSessions.accountId, target.accountId), isNull(authSessions.revokedAt)));
    const hint = await syncUserMutation(tx, actorUserId, target.userId, "user.banned", sequence);
    return {
        ...hint,
        chats: ownership.map(({ chatId, pts }) => ({ chatId, pts: String(pts) })),
    };
}
