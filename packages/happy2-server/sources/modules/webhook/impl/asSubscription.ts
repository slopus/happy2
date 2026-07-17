import { number } from "../../integration/number.js";
import { optionalText } from "../../integration/optionalText.js";
import { stringArray } from "../../integration/stringArray.js";
import { text } from "../../integration/text.js";
import { type WebhookSubscriptionSummary } from "../../integrations/types.js";
export function asSubscription(row: Record<string, unknown>): WebhookSubscriptionSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        direction: text(row.direction) as WebhookSubscriptionSummary["direction"],
        chatId: optionalText(row.chat_id),
        url: optionalText(row.url),
        eventTypes: stringArray(row.event_types_json),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
