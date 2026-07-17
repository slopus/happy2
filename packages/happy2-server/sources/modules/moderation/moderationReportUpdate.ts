import { type AuditContext } from "../operations/auditContext.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import {
    type ModerationReport,
    type ModerationReportStatus,
    OperationsError,
} from "../operations/types.js";

import { eq, sql } from "drizzle-orm";
import { moderationReports } from "../schema.js";

import { auditAppend } from "../operations/auditAppend.js";
import { reportDb } from "./impl/reportDb.js";
import { userRequireOperationsAdmin } from "../operations/userRequireOperationsAdmin.js";

/**
 * Applies an allowed triage transition and administrator notes to moderationReports without executing a moderation action.
 * The audit entry shares the report update so queue state changes remain attributable during later investigation.
 */
export async function moderationReportUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        reportId: string;
        status?: ModerationReportStatus;
        assignedToUserId?: string | null;
        resolution?: string | null;
        context?: AuditContext;
    },
): Promise<ModerationReport> {
    if (
        input.status === undefined &&
        input.assignedToUserId === undefined &&
        input.resolution === undefined
    )
        throw new OperationsError("invalid", "At least one report field is required");
    return withTransaction(executor, async (tx) => {
        await userRequireOperationsAdmin(tx, input.actorUserId);
        const before = await reportDb(tx, input.reportId);
        if (input.assignedToUserId) await userRequireOperationsAdmin(tx, input.assignedToUserId);
        const status = input.status ?? before.status;
        const assigned =
            input.assignedToUserId === undefined ? before.assignedToUserId : input.assignedToUserId;
        const resolution = input.resolution === undefined ? before.resolution : input.resolution;
        await tx
            .update(moderationReports)
            .set({
                status,
                assignedToUserId: assigned ?? null,
                resolution: resolution ?? null,
                resolvedAt:
                    status === "resolved" || status === "dismissed"
                        ? sql`coalesce(${moderationReports.resolvedAt}, CURRENT_TIMESTAMP)`
                        : null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(moderationReports.id, input.reportId));
        const after = await reportDb(tx, input.reportId);
        await auditAppend(tx, {
            actorUserId: input.actorUserId,
            action: "moderation.report_updated",
            targetType: "moderation_report",
            targetId: input.reportId,
            chatId: after.chatId,
            before,
            after,
            context: input.context,
        });
        return after;
    });
}
