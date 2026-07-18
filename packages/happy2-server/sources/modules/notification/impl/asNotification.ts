import { type NotificationSummary } from "../../chat/types.js";
import { optionalText } from "../../chat/optionalText.js";
import { text } from "../../chat/text.js";
export function asNotification(row: Record<string, unknown>): NotificationSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as NotificationSummary["kind"],
        chatId: optionalText(row.chat_id),
        messageId: optionalText(row.message_id),
        actorUserId: optionalText(row.actor_user_id),
        readAt: optionalText(row.read_at),
        createdAt: text(row.created_at),
    };
}
