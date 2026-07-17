import { webhookSubscriptions } from "../../schema.js";
export const subscriptionSelection = {
    id: webhookSubscriptions.id,
    integration_id: webhookSubscriptions.integrationId,
    direction: webhookSubscriptions.direction,
    chat_id: webhookSubscriptions.chatId,
    url: webhookSubscriptions.url,
    event_types_json: webhookSubscriptions.eventTypesJson,
    active: webhookSubscriptions.active,
    created_at: webhookSubscriptions.createdAt,
    updated_at: webhookSubscriptions.updatedAt,
};
