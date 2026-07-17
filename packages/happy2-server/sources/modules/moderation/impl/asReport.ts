import { type ModerationReport, type ModerationReportStatus } from "../../operations/types.js";

import { optionalText } from "../../operations/optionalText.js";
import { text } from "../../operations/text.js";
export function asReport(row: Record<string, unknown>): ModerationReport {
    return {
        id: text(row.id),
        reportedByUserId: optionalText(row.reported_by_user_id),
        targetUserId: optionalText(row.target_user_id),
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        fileId: optionalText(row.file_id),
        reason: text(row.reason),
        details: optionalText(row.details),
        status: text(row.status) as ModerationReportStatus,
        assignedToUserId: optionalText(row.assigned_to_user_id),
        resolution: optionalText(row.resolution),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
        resolvedAt: optionalText(row.resolved_at),
    };
}
