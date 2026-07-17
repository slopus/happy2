import { moderationActions } from "../../schema.js";
export const moderationActionSelection = {
    id: moderationActions.id,
    report_id: moderationActions.reportId,
    actor_user_id: moderationActions.actorUserId,
    target_user_id: moderationActions.targetUserId,
    chat_id: moderationActions.chatId,
    message_id: moderationActions.messageId,
    file_id: moderationActions.fileId,
    action: moderationActions.action,
    reason: moderationActions.reason,
    metadata_json: moderationActions.metadataJson,
    expires_at: moderationActions.expiresAt,
    revoked_at: moderationActions.revokedAt,
    created_at: moderationActions.createdAt,
};
