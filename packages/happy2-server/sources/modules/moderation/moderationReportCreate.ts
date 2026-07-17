import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type ModerationReport, OperationsError } from "../operations/types.js";

import { createId } from "@paralleldrive/cuid2";
import { moderationReports } from "../schema.js";
import { auditAppend } from "../operations/auditAppend.js";
import { reportDb } from "./impl/reportDb.js";
import { userRequireOperationsActive } from "../operations/userRequireOperationsActive.js";
import { requireReportTargetAccess } from "./impl/requireReportTargetAccess.js";

/**
 * Creates moderationReports only for targets the active reporter can access, preserving the reason and source context needed for review.
 * Recording report and audit evidence together prevents untraceable moderation work from entering the operations queue.
 */
export async function moderationReportCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        targetUserId?: string;
        chatId?: string;
        messageId?: string;
        fileId?: string;
        reason: string;
        details?: string;
        context?: AuditContext;
    },
): Promise<ModerationReport> {
    if (![input.targetUserId, input.chatId, input.messageId, input.fileId].some(Boolean))
        throw new OperationsError("invalid", "A report must identify at least one target");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsActive(tx, input.actorUserId);
        await requireReportTargetAccess(tx, input);
        const id = createId();
        await tx.insert(moderationReports).values({
            id,
            reportedByUserId: input.actorUserId,
            targetUserId: input.targetUserId,
            chatId: input.chatId,
            messageId: input.messageId,
            fileId: input.fileId,
            reason: input.reason,
            details: input.details,
        });
        const report = await reportDb(tx, id);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "moderation.report_created",
            targetType: "moderation_report",
            targetId: id,
            chatId: input.chatId,
            after: report,
            context: input.context,
        });
        return report;
    });
}
