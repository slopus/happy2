import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    type ModerationAction,
    OperationsError,
    type OperationsSyncHint,
} from "../operations/types.js";

import { and, eq, isNull, sql } from "drizzle-orm";

import { mergeContext } from "./impl/mergeContext.js";
import { moderationActions } from "../schema.js";

import { auditAppend } from "../operations/auditAppend.js";
import { createModerationNotification } from "./impl/createModerationNotification.js";
import { moderationActionDb } from "./impl/moderationActionDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";

/**
 * Revokes a reversible moderationActions restriction, applies its inverse durable effect, and notifies the affected user.
 * Administrator checks, reversal, audit history, and notification share one outcome so the record never says revoked while enforcement remains active.
 */
export async function moderationActionRevoke(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        actionId: string;
        reason?: string;
        context?: AuditContext;
    },
): Promise<{
    action: ModerationAction;
    sync: OperationsSyncHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const before = await moderationActionDb(tx, input.actionId);
        if (before.revokedAt)
            throw new OperationsError("conflict", "Moderation action is already revoked");
        if (before.action !== "restrict")
            throw new OperationsError("conflict", "Only restrictions can be revoked");
        if (!before.targetUserId) throw new Error("Restriction is missing its target user");
        await tx
            .update(moderationActions)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(eq(moderationActions.id, input.actionId), isNull(moderationActions.revokedAt)),
            );
        const sync = await createModerationNotification(tx, {
            actorUserId: input.actorUserId,
            targetUserId: before.targetUserId,
            chatId: before.chatId,
            actionId: input.actionId,
            reportId: before.reportId,
            action: "restrict_revoked",
            reason: input.reason,
        });
        const action = await moderationActionDb(tx, input.actionId);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "moderation.action_revoked",
            targetType: "moderation_action",
            targetId: input.actionId,
            chatId: before.chatId,
            before,
            after: action,
            context: mergeContext(input.context, {
                reason: input.reason,
            }),
        });
        return {
            action,
            sync,
        };
    });
}
