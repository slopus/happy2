import { type DrizzleExecutor } from "../drizzle.js";
import { type QueuedWebhookDelivery } from "../integrations/types.js";
import { and, eq, isNull, or, sql } from "drizzle-orm";

import { integrations, syncEvents, webhookDeliveries, webhookSubscriptions } from "../schema.js";

import { positiveLimit } from "./impl/positiveLimit.js";

import { webhookDeliveryEnqueueSyncSequence } from "./webhookDeliveryEnqueueSyncSequence.js";
/**
 * Backfills delivery rows for the oldest sync sequences that still match an outgoing subscription but have not been queued.
 * Each sequence delegates conflict-safe insertion to the event enqueue path, allowing a worker to retry this scan without duplicating deliveries.
 */
export async function webhookDeliveryEnqueuePendingSyncEvents(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    limit = 100,
): Promise<QueuedWebhookDelivery[]> {
    positiveLimit(limit, 1_000);
    const alreadyQueued = executor
        .select({
            id: webhookDeliveries.id,
        })
        .from(webhookDeliveries)
        .where(
            and(
                eq(webhookDeliveries.subscriptionId, webhookSubscriptions.id),
                eq(webhookDeliveries.eventId, sql`'sync:' || ${syncEvents.id}`),
            ),
        );
    const eligibleSubscription = executor
        .select({
            id: webhookSubscriptions.id,
        })
        .from(webhookSubscriptions)
        .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
        .where(
            and(
                eq(webhookSubscriptions.direction, "outgoing"),
                eq(webhookSubscriptions.active, 1),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
                sql`julianday(${syncEvents.createdAt}) >= julianday(${webhookSubscriptions.createdAt})`,
                or(
                    isNull(webhookSubscriptions.chatId),
                    eq(webhookSubscriptions.chatId, syncEvents.chatId),
                ),
                sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = ${syncEvents.kind})`,
                sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'events:read')`,
                sql`not exists ${alreadyQueued}`,
            ),
        );
    const firstEventId = sql<number>`min(${syncEvents.id})`;
    const sequences = await executor
        .select({
            sequence: syncEvents.sequence,
            firstEventId,
        })
        .from(syncEvents)
        .where(sql`exists ${eligibleSubscription}`)
        .groupBy(syncEvents.sequence)
        .orderBy(firstEventId)
        .limit(limit);
    const deliveries: QueuedWebhookDelivery[] = [];
    for (const row of sequences)
        deliveries.push(
            ...(await webhookDeliveryEnqueueSyncSequence(
                executor,
                nowProvider,
                String(row.sequence),
            )),
        );
    return deliveries;
}
