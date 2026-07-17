import { type ModerationAction, type ModerationActionKind } from "../../operations/types.js";

import { optionalText } from "../../operations/optionalText.js";
import { parseJson } from "../../operations/parseJson.js";
import { text } from "../../operations/text.js";
export function asModerationAction(row: Record<string, unknown>): ModerationAction {
    return {
        id: text(row.id),
        reportId: optionalText(row.report_id),
        actorUserId: optionalText(row.actor_user_id),
        targetUserId: optionalText(row.target_user_id),
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        fileId: optionalText(row.file_id),
        action: text(row.action) as ModerationActionKind,
        reason: optionalText(row.reason),
        metadata: parseJson(row.metadata_json),
        expiresAt: optionalText(row.expires_at),
        revokedAt: optionalText(row.revoked_at),
        createdAt: text(row.created_at),
    };
}
