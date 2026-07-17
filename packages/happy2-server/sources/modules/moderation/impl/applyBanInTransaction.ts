import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { accountBans, accounts, authSessions } from "../../schema.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { accountTargetDb } from "./accountTargetDb.js";
import { closeElapsedBan } from "./closeElapsedBan.js";
import { syncUserMutation } from "./syncUserMutation.js";
/**
 * Inserts accountBans state, disables accounts, and revokes authSessions as one branch of a larger moderation action.
 * Reusing the action transaction ensures the access cutoff rolls back if its report resolution, notification, or audit record cannot be stored.
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
    await tx
        .update(authSessions)
        .set({
            revokedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(authSessions.accountId, target.accountId), isNull(authSessions.revokedAt)));
    return syncUserMutation(tx, actorUserId, target.userId, "user.banned");
}
