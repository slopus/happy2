import { auditLogEntries } from "../schema.js";
export const auditSelection = {
    id: auditLogEntries.id,
    actor_user_id: auditLogEntries.actorUserId,
    actor_integration_id: auditLogEntries.actorIntegrationId,
    action: auditLogEntries.action,
    target_type: auditLogEntries.targetType,
    target_id: auditLogEntries.targetId,
    chat_id: auditLogEntries.chatId,
    before_json: auditLogEntries.beforeJson,
    after_json: auditLogEntries.afterJson,
    metadata_json: auditLogEntries.metadataJson,
    client_ip: auditLogEntries.clientIp,
    device: auditLogEntries.device,
    app_version: auditLogEntries.appVersion,
    user_agent: auditLogEntries.userAgent,
    created_at: auditLogEntries.createdAt,
};
