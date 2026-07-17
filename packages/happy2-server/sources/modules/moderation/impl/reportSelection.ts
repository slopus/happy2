import { moderationReports } from "../../schema.js";
export const reportSelection = {
    id: moderationReports.id,
    reported_by_user_id: moderationReports.reportedByUserId,
    target_user_id: moderationReports.targetUserId,
    chat_id: moderationReports.chatId,
    message_id: moderationReports.messageId,
    file_id: moderationReports.fileId,
    reason: moderationReports.reason,
    details: moderationReports.details,
    status: moderationReports.status,
    assigned_to_user_id: moderationReports.assignedToUserId,
    resolution: moderationReports.resolution,
    created_at: moderationReports.createdAt,
    updated_at: moderationReports.updatedAt,
    resolved_at: moderationReports.resolvedAt,
};
