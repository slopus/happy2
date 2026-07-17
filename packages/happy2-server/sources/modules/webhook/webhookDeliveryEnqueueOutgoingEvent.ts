import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type QueuedWebhookDelivery } from "../integrations/types.js";
import { and, eq } from "drizzle-orm";
import { asDelivery } from "../integration/asDelivery.js";
import { boundedIdentifier } from "./impl/boundedIdentifier.js";
import { createId } from "@paralleldrive/cuid2";
import { deliverySelection } from "../integration/deliverySelection.js";

import { normalizedEventType } from "./impl/normalizedEventType.js";
import { outgoingSubscriptionIds } from "./impl/outgoingSubscriptionIds.js";
import { serializedPayload } from "../integration/serializedPayload.js";
import { webhookDeliveries } from "../schema.js";

/**
 * Inserts webhookDeliveries for each active outgoing subscription whose scope and filters match the durable product event.
 * Enqueueing from the event transaction prevents external delivery of an event whose underlying server mutation did not commit.
 */
export async function webhookDeliveryEnqueueOutgoingEvent(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    input: {
        eventId: string;
        eventType: string;
        chatId?: string;
        payload: Record<string, unknown>;
    },
): Promise<QueuedWebhookDelivery[]> {
    boundedIdentifier(input.eventId, "Event id");
    const eventType = normalizedEventType(input.eventType);
    const payloadJson = serializedPayload({
        eventId: input.eventId,
        eventType,
        occurredAt: nowProvider().toISOString(),
        payload: input.payload,
    });
    if ((await outgoingSubscriptionIds(executor, eventType, input.chatId)).length === 0) return [];
    return withTransaction(executor, async (tx) => {
        const subscriptions = await outgoingSubscriptionIds(tx, eventType, input.chatId);
        const deliveries: QueuedWebhookDelivery[] = [];
        for (const row of subscriptions) {
            const subscriptionId = row.id;
            const id = createId();
            await tx
                .insert(webhookDeliveries)
                .values({
                    id,
                    subscriptionId,
                    eventId: input.eventId,
                    eventType,
                    payloadJson,
                    nextAttemptAt: nowProvider().toISOString(),
                })
                .onConflictDoNothing();
            const [delivery] = await tx
                .select(deliverySelection)
                .from(webhookDeliveries)
                .where(
                    and(
                        eq(webhookDeliveries.subscriptionId, subscriptionId),
                        eq(webhookDeliveries.eventId, input.eventId),
                    ),
                );
            if (delivery) deliveries.push(asDelivery(delivery));
        }
        return deliveries;
    });
}
