import { type AccountBan, OperationsError } from "../operations/types.js";
import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { accountBans, accounts, authSessions } from "../schema.js";
import { accountTargetState } from "./impl/accountTargetState.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { createId } from "@paralleldrive/cuid2";

import { futureTimestamp } from "../operations/futureTimestamp.js";

import { mergeContext } from "./impl/mergeContext.js";

import { accountTargetDb } from "./impl/accountTargetDb.js";
import { auditAppend } from "../operations/auditAppend.js";
import { banDb } from "./impl/banDb.js";
import { closeElapsedBan } from "./impl/closeElapsedBan.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { syncUserMutation } from "./impl/syncUserMutation.js";

/**
 * Creates an accountBans record, disables its accounts credential, and revokes active authSessions under operations-administrator authority.
 * The ban, session cutoff, user sync hint, and audit evidence commit together so access disappears at the same boundary the moderation action becomes visible.
 */
export async function accountBanApply(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        targetUserId: string;
        reason?: string;
        expiresAt?: string;
        context?: AuditContext;
    },
): Promise<AccountBan> {
    const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        if (input.actorUserId === input.targetUserId)
            throw new OperationsError("forbidden", "Administrators cannot ban themselves");
        const target = await accountTargetDb(tx, input.targetUserId);
        await closeElapsedBan(tx, target);
        if (
            target.bannedAt &&
            (!target.banExpiresAt || Date.parse(target.banExpiresAt) > Date.now())
        )
            throw new OperationsError("conflict", "User already has an active ban");
        const id = createId();
        await tx.insert(accountBans).values({
            id,
            accountId: target.accountId,
            bannedByUserId: input.actorUserId,
            reason: input.reason,
            expiresAt,
        });
        await tx
            .update(accounts)
            .set({
                bannedAt: sql`CURRENT_TIMESTAMP`,
                banExpiresAt: expiresAt ?? null,
                banReason: input.reason ?? null,
                bannedByUserId: input.actorUserId,
            })
            .where(eq(accounts.id, target.accountId));
        const sessions = await tx
            .update(authSessions)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(eq(authSessions.accountId, target.accountId), isNull(authSessions.revokedAt)),
            )
            .returning({
                id: authSessions.id,
            });
        await syncUserMutation(tx, input.actorUserId, target.userId, "user.banned");
        const ban = await banDb(tx, id);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "user.ban_applied",
            targetType: "user",
            targetId: target.userId,
            before: accountTargetState(target),
            after: ban,
            context: mergeContext(input.context, {
                revokedSessionCount: sessions.length,
            }),
        });
        return ban;
    });
}
