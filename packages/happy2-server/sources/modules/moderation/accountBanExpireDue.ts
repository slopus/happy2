import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { accountBans, accounts, users } from "../schema.js";

import { and, eq, isNull, lte, sql } from "drizzle-orm";

import { auditAppend } from "../operations/auditAppend.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { syncUserMutation } from "./impl/syncUserMutation.js";

/**
 * Closes an elapsed accountBans interval and reactivates accounts only when no other effective ban still blocks the identity.
 * Performing expiry with user synchronization and audit history prevents credentials from reopening without an attributable moderation transition.
 */
export async function accountBanExpireDue(
    executor: DrizzleExecutor,
    input?: {
        actorUserId?: string;
        context?: AuditContext;
    },
): Promise<number> {
    const now = new Date().toISOString();
    const dueCondition = and(
        sql`${accounts.bannedAt} IS NOT NULL`,
        sql`${accounts.banExpiresAt} IS NOT NULL`,
        lte(accounts.banExpiresAt, now),
    );
    if (!input?.actorUserId) {
        const [candidate] = await executor
            .select({
                id: accounts.id,
            })
            .from(accounts)
            .where(dueCondition)
            .limit(1);
        if (!candidate) return 0;
    }
    return withTransaction(executor, async (tx) => {
        if (input?.actorUserId) await userRequireOperationsAdmin(tx, input.actorUserId);
        const due = await tx
            .select({
                accountId: accounts.id,
                userId: users.id,
                bannedAt: accounts.bannedAt,
                banExpiresAt: accounts.banExpiresAt,
                banReason: accounts.banReason,
                bannedByUserId: accounts.bannedByUserId,
            })
            .from(accounts)
            .leftJoin(users, eq(users.accountId, accounts.id))
            .where(dueCondition);
        for (const row of due) {
            await tx
                .update(accountBans)
                .set({
                    revokedAt: sql`coalesce(${accountBans.revokedAt}, ${now})`,
                    revokeReason: sql`coalesce(${accountBans.revokeReason}, 'expired')`,
                })
                .where(
                    and(
                        eq(accountBans.accountId, row.accountId),
                        isNull(accountBans.revokedAt),
                        lte(accountBans.expiresAt, now),
                    ),
                );
            const updated = await tx
                .update(accounts)
                .set({
                    bannedAt: null,
                    banExpiresAt: null,
                    banReason: null,
                    bannedByUserId: null,
                })
                .where(
                    and(
                        eq(accounts.id, row.accountId),
                        sql`${accounts.bannedAt} IS NOT NULL`,
                        sql`${accounts.banExpiresAt} IS NOT NULL`,
                        lte(accounts.banExpiresAt, now),
                    ),
                )
                .returning({
                    id: accounts.id,
                });
            if (!updated.length) continue;
            if (row.userId) {
                await tx.update(users).set({ active: 1 }).where(eq(users.id, row.userId));
                await syncUserMutation(tx, input?.actorUserId, row.userId, "user.unbanned");
            }
            await auditAppend(tx, {
                actorUserId: input?.actorUserId,
                action: "user.ban_expired",
                targetType: "user",
                targetId: row.userId ?? undefined,
                before: {
                    bannedAt: row.bannedAt ?? undefined,
                    expiresAt: row.banExpiresAt ?? undefined,
                    reason: row.banReason ?? undefined,
                    bannedByUserId: row.bannedByUserId ?? undefined,
                },
                after: {
                    banned: false,
                },
                context: input?.context,
            });
        }
        return due.length;
    });
}
