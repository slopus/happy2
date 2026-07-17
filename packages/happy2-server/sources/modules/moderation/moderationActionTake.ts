import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    type ModerationAction,
    type ModerationActionKind,
    type ModerationReport,
    OperationsError,
    type OperationsSyncHint,
} from "../operations/types.js";

import { asModerationAction } from "./impl/asModerationAction.js";
import { createId } from "@paralleldrive/cuid2";
import { eq, sql } from "drizzle-orm";
import { futureTimestamp } from "../operations/futureTimestamp.js";
import { json } from "../operations/json.js";
import { mergeContext } from "./impl/mergeContext.js";
import { moderationActionSelection } from "./impl/moderationActionSelection.js";
import { moderationActions, moderationReports } from "../schema.js";

import { auditAppend } from "../operations/auditAppend.js";
import { applyBanInTransaction } from "./impl/applyBanInTransaction.js";
import { createModerationNotification } from "./impl/createModerationNotification.js";
import { deleteUserInTransaction } from "./impl/deleteUserInTransaction.js";
import { moderationActionDb } from "./impl/moderationActionDb.js";
import { removeFileInTransaction } from "./impl/removeFileInTransaction.js";
import { removeMessageInTransaction } from "./impl/removeMessageInTransaction.js";
import { reportDb } from "./impl/reportDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";
import { revokeBanInTransaction } from "./impl/revokeBanInTransaction.js";

/**
 * Resolves a moderationReports item into one moderationActions decision and applies the selected warning, restriction, ban, message removal, file removal, or user deletion.
 * The transaction makes enforcement, report status, audit evidence, and recipient notification one reviewable administrator decision.
 */
export async function moderationActionTake(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        reportId: string;
        action: ModerationActionKind;
        automationRunId?: string;
        reason?: string;
        expiresAt?: string;
        metadata?: Record<string, unknown>;
        context?: AuditContext;
    },
): Promise<{
    report: ModerationReport;
    action: ModerationAction;
    sync?: OperationsSyncHint;
}> {
    const expiresAt = futureTimestamp(input.expiresAt, "expiresAt");
    if (expiresAt && input.action !== "ban" && input.action !== "restrict")
        throw new OperationsError("invalid", `${input.action} does not support expiresAt`);
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        if (input.automationRunId) {
            const [existing] = await tx
                .select(moderationActionSelection)
                .from(moderationActions)
                .where(eq(moderationActions.automationRunId, input.automationRunId))
                .limit(1);
            if (existing) {
                const action = asModerationAction(existing);
                if (action.reportId !== input.reportId)
                    throw new OperationsError(
                        "conflict",
                        "Automation run is already bound to another moderation report",
                    );
                return {
                    report: await reportDb(tx, input.reportId),
                    action,
                };
            }
        }
        const before = await reportDb(tx, input.reportId);
        if (
            (input.action === "ban" ||
                input.action === "unban" ||
                input.action === "delete_user" ||
                input.action === "warn" ||
                input.action === "restrict") &&
            !before.targetUserId
        )
            throw new OperationsError("invalid", `${input.action} requires a reported user`);
        if (input.action === "remove_message" && !before.messageId)
            throw new OperationsError("invalid", "remove_message requires a reported message");
        if (input.action === "remove_file" && !before.fileId)
            throw new OperationsError("invalid", "remove_file requires a reported file");
        const actionId = createId();
        let actionChatId = before.chatId;
        let sync: OperationsSyncHint | undefined;
        if (input.action === "ban")
            sync = await applyBanInTransaction(
                tx,
                input.actorUserId,
                before.targetUserId!,
                input.reason,
                expiresAt,
            );
        else if (input.action === "unban")
            sync = await revokeBanInTransaction(
                tx,
                input.actorUserId,
                before.targetUserId!,
                input.reason,
            );
        else if (input.action === "warn" || input.action === "restrict")
            sync = await createModerationNotification(tx, {
                actorUserId: input.actorUserId,
                targetUserId: before.targetUserId!,
                chatId: before.chatId,
                actionId,
                reportId: input.reportId,
                action: input.action,
                reason: input.reason,
                expiresAt,
            });
        else if (input.action === "remove_message") {
            const removed = await removeMessageInTransaction(
                tx,
                input.actorUserId,
                before.messageId!,
                input.reason,
            );
            actionChatId = removed.chatId;
            sync = removed.sync;
        } else if (input.action === "remove_file")
            sync = await removeFileInTransaction(
                tx,
                input.actorUserId,
                before.fileId!,
                input.reason,
            );
        else if (input.action === "delete_user")
            sync = await deleteUserInTransaction(tx, input.actorUserId, before.targetUserId!);
        await tx.insert(moderationActions).values({
            id: actionId,
            reportId: input.reportId,
            actorUserId: input.actorUserId,
            targetUserId: before.targetUserId,
            chatId: actionChatId,
            messageId: before.messageId,
            fileId: before.fileId,
            action: input.action,
            reason: input.reason,
            metadataJson: json(input.metadata),
            automationRunId: input.automationRunId,
            expiresAt,
        });
        await tx
            .update(moderationReports)
            .set({
                status: "resolved",
                assignedToUserId: input.actorUserId,
                resolution: input.reason ?? input.action,
                resolvedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(moderationReports.id, input.reportId));
        const report = await reportDb(tx, input.reportId);
        const action = await moderationActionDb(tx, actionId);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: `moderation.${input.action}`,
            targetType: "moderation_report",
            targetId: input.reportId,
            chatId: report.chatId,
            before,
            after: {
                report,
                action,
            },
            context: mergeContext(input.context, input.metadata),
        });
        return {
            report,
            action,
            sync,
        };
    });
}
