import { type AccountBan, OperationsError } from "../operations/types.js";
import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accountBans, accounts, users } from "../schema.js";
import { accountTargetState } from "./impl/accountTargetState.js";

import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { banSelection } from "./impl/banSelection.js";

import { text } from "../operations/text.js";

import { accountTargetDb } from "./impl/accountTargetDb.js";
import { auditAppend } from "../operations/auditAppend.js";
import { banDb } from "./impl/banDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { syncUserMutation } from "./impl/syncUserMutation.js";

/**
 * Revokes the current accountBans interval and restores accounts authority when no remaining ban applies to the target.
 * The administrator-audited transaction keeps account activation, product user state, and the visible moderation record in agreement.
 */
export async function accountBanRevoke(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        targetUserId: string;
        reason?: string;
        context?: AuditContext;
    },
): Promise<AccountBan> {
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const target = await accountTargetDb(tx, input.targetUserId);
        const [current] = await tx
            .select(banSelection)
            .from(accountBans)
            .leftJoin(users, eq(users.accountId, accountBans.accountId))
            .where(and(eq(accountBans.accountId, target.accountId), isNull(accountBans.revokedAt)))
            .orderBy(desc(accountBans.bannedAt), desc(accountBans.id))
            .limit(1);
        if (!current || !target.bannedAt)
            throw new OperationsError("conflict", "User does not have an active ban");
        await tx
            .update(accountBans)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
                revokedByUserId: input.actorUserId,
                revokeReason: input.reason ?? null,
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
        await syncUserMutation(tx, input.actorUserId, target.userId, "user.unbanned");
        const ban = await banDb(tx, text(current.id));
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "user.ban_revoked",
            targetType: "user",
            targetId: target.userId,
            before: accountTargetState(target),
            after: ban,
            context: input.context,
        });
        return ban;
    });
}
