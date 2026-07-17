import { type AuditLogEntry } from "./types.js";
import { optionalText } from "./optionalText.js";
import { parseJson } from "./parseJson.js";
import { text } from "./text.js";
export function asAudit(row: Record<string, unknown>): AuditLogEntry {
    return {
        id: text(row.id),
        actorUserId: optionalText(row.actor_user_id),
        actorIntegrationId: optionalText(row.actor_integration_id),
        action: text(row.action),
        targetType: text(row.target_type),
        targetId: optionalText(row.target_id),
        chatId: optionalText(row.chat_id),
        before: parseJson(row.before_json),
        after: parseJson(row.after_json),
        metadata: parseJson(row.metadata_json),
        clientIp: optionalText(row.client_ip),
        device: optionalText(row.device),
        appVersion: optionalText(row.app_version),
        userAgent: optionalText(row.user_agent),
        createdAt: text(row.created_at),
    };
}
