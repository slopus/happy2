import { and, eq, isNull, sql } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { auditAppend } from "../operations/auditAppend.js";
import type { AuditContext } from "../operations/auditContext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { accounts, authSessions, serverSetupState, users } from "../schema.js";
import { hashPassword } from "./crypto.js";
import { recordSessionEvent } from "./impl/recordSessionEvent.js";

/**
 * Replaces one human account's accounts password hash under reset-password authority, revokes its authSessions, and appends authSessionEvents and auditLogEntries evidence.
 * Hashing follows the active server pepper policy; only the owner may target the owner account, and the final permission check and all durable changes share one transaction so a revoked grant cannot race a reset.
 */
export async function accountResetPassword(
    executor: DrizzleExecutor,
    passwordPepper: string,
    input: {
        actorUserId: string;
        targetUserId: string;
        password: string;
        context?: AuditContext;
    },
): Promise<{ revokedSessionCount: number }> {
    // Avoid spending password-hashing CPU on callers that are not currently authorized.
    await userRequirePermission(executor, input.actorUserId, "resetPasswords");
    const passwordHash = await hashPassword(input.password, passwordPepper);
    return withTransaction(executor, async (tx) => {
        // Recheck inside the write transaction so a concurrent grant revocation wins.
        await userRequirePermission(tx, input.actorUserId, "resetPasswords");
        const [target] = await tx
            .select({
                accountId: accounts.id,
                hadPassword: sql<number>`case when ${accounts.passwordHash} is null then 0 else 1 end`,
                ownerUserId: serverSetupState.bootstrapAdminUserId,
            })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .innerJoin(serverSetupState, eq(serverSetupState.id, 1))
            .where(
                and(
                    eq(users.id, input.targetUserId),
                    eq(users.kind, "human"),
                    isNull(users.deletedAt),
                    isNull(accounts.deletedAt),
                ),
            )
            .limit(1);
        if (!target) throw new CollaborationError("not_found", "User was not found");
        if (target.ownerUserId === input.targetUserId && input.actorUserId !== input.targetUserId)
            throw new CollaborationError(
                "forbidden",
                "Only the owner can reset the owner's password",
            );

        await tx.update(accounts).set({ passwordHash }).where(eq(accounts.id, target.accountId));
        const revokedSessions = await tx
            .update(authSessions)
            .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
            .where(
                and(eq(authSessions.accountId, target.accountId), isNull(authSessions.revokedAt)),
            )
            .returning({ id: authSessions.id });
        for (const session of revokedSessions)
            await recordSessionEvent(tx, session.id, "revoked", input.context?.request ?? {});
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "account.password_reset",
            targetType: "user",
            targetId: input.targetUserId,
            before: { passwordConfigured: target.hadPassword === 1 },
            after: { passwordConfigured: true },
            context: {
                ...input.context,
                metadata: {
                    ...input.context?.metadata,
                    revokedSessionCount: revokedSessions.length,
                },
            },
        });
        return { revokedSessionCount: revokedSessions.length };
    });
}
