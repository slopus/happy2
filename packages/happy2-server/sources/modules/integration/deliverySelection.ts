import { webhookDeliveries } from "../schema.js";
export const deliverySelection = {
    id: webhookDeliveries.id,
    subscription_id: webhookDeliveries.subscriptionId,
    event_id: webhookDeliveries.eventId,
    event_type: webhookDeliveries.eventType,
    status: webhookDeliveries.status,
    attempts: webhookDeliveries.attempts,
    next_attempt_at: webhookDeliveries.nextAttemptAt,
    created_at: webhookDeliveries.createdAt,
};
