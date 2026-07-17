import { type DrizzleExecutor } from "../drizzle.js";
import { IntegrationError, type QueuedWebhookDelivery } from "../integrations/types.js";

import { asc, eq } from "drizzle-orm";

import { syncEvents } from "../schema.js";
import { webhookDeliveryEnqueueOutgoingEvent } from "./webhookDeliveryEnqueueOutgoingEvent.js";
/**
 * Converts every durable event in one sync sequence into eligible outgoing webhook delivery rows.
 * Sequence expansion stays at this boundary while delegated per-event transactions and uniqueness constraints make repeated calls safe.
 */
export async function webhookDeliveryEnqueueSyncSequence(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    sequence: string,
): Promise<QueuedWebhookDelivery[]> {
    if (!/^\d+$/.test(sequence)) throw new IntegrationError("invalid", "Sync sequence is invalid");
    const events = await executor
        .select()
        .from(syncEvents)
        .where(eq(syncEvents.sequence, Number(sequence)))
        .orderBy(asc(syncEvents.id));
    const deliveries: QueuedWebhookDelivery[] = [];
    for (const event of events) {
        deliveries.push(
            ...(await webhookDeliveryEnqueueOutgoingEvent(executor, nowProvider, {
                eventId: `sync:${event.id}`,
                eventType: event.kind,
                chatId: event.chatId ?? undefined,
                payload: {
                    syncEventId: String(event.id),
                    sequence: String(event.sequence),
                    chatId: event.chatId ?? undefined,
                    chatPts: event.chatPts === null ? undefined : String(event.chatPts),
                    entityId: event.entityId ?? undefined,
                    actorUserId: event.actorUserId ?? undefined,
                    targetUserId: event.targetUserId ?? undefined,
                    createdAt: event.createdAt,
                },
            })),
        );
    }
    return deliveries;
}
