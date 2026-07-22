import { type AccountTarget } from "./accountTarget.js";
import { type DrizzleTransaction } from "../../drizzle.js";
import { accountBans, accounts, users } from "../../schema.js";

import { and, eq, isNull, lte, sql } from "drizzle-orm";

/**
 * Marks an elapsed accountBans record ended and updates accounts activation according to the remaining effective bans.
 * The caller's transaction prevents a closed ban record from disagreeing with the credential authority derived from it.
 */
export async function closeElapsedBan(
    tx: DrizzleTransaction,
    target: AccountTarget,
): Promise<void> {
    if (!target.bannedAt || !target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
        return;
    const now = new Date().toISOString();
    await tx
        .update(accountBans)
        .set({
            revokedAt: sql`coalesce(${accountBans.revokedAt}, ${now})`,
            revokeReason: sql`coalesce(${accountBans.revokeReason}, 'expired')`,
        })
        .where(
            and(
                eq(accountBans.accountId, target.accountId),
                isNull(accountBans.revokedAt),
                lte(accountBans.expiresAt, now),
            ),
        );
    await tx
        .update(accounts)
        .set({
            bannedAt: null,
            banExpiresAt: null,
            banReason: null,
            bannedByUserId: null,
        })
        .where(
            and(
                eq(accounts.id, target.accountId),
                sql`${accounts.banExpiresAt} IS NOT NULL`,
                lte(accounts.banExpiresAt, now),
            ),
        );
    await tx.update(users).set({ active: 1 }).where(eq(users.id, target.userId));
}
