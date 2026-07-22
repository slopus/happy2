import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError, type OperationsSyncHint } from "../../operations/types.js";

import { accountBans, accounts, users } from "../../schema.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { accountTargetDb } from "./accountTargetDb.js";
import { syncUserMutation } from "./syncUserMutation.js";
/**
 * Ends the selected accountBans record and restores accounts only when the target has no other effective ban.
 * The surrounding moderation transaction keeps credential authority synchronized with the action, notification, and audit records that explain the reversal.
 */
export async function revokeBanInTransaction(
    tx: DrizzleTransaction,
    actorUserId: string,
    targetUserId: string,
    reason?: string,
): Promise<OperationsSyncHint> {
    const target = await accountTargetDb(tx, targetUserId);
    if (!target.bannedAt) throw new OperationsError("conflict", "User does not have an active ban");
    await tx
        .update(accountBans)
        .set({
            revokedAt: sql`CURRENT_TIMESTAMP`,
            revokedByUserId: actorUserId,
            revokeReason: reason ?? null,
        })
        .where(and(eq(accountBans.accountId, target.accountId), isNull(accountBans.revokedAt)));
    await tx
        .update(accounts)
        .set({
            bannedAt: null,
            banExpiresAt: null,
            banReason: null,
            bannedByUserId: null,
        })
        .where(eq(accounts.id, target.accountId));
    await tx.update(users).set({ active: 1 }).where(eq(users.id, target.userId));
    return syncUserMutation(tx, actorUserId, target.userId, "user.unbanned");
}
