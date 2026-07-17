import { number } from "./number.js";
import { type QueuedWebhookDelivery } from "../integrations/types.js";
import { text } from "./text.js";
export function asDelivery(row: Record<string, unknown>): QueuedWebhookDelivery {
    return {
        id: text(row.id),
        subscriptionId: text(row.subscription_id),
        eventId: text(row.event_id),
        eventType: text(row.event_type),
        status: text(row.status) as QueuedWebhookDelivery["status"],
        attempts: number(row.attempts),
        nextAttemptAt: text(row.next_attempt_at),
        createdAt: text(row.created_at),
    };
}
