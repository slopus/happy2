import { type ClaimedDelivery } from "../../integration/claimedDelivery.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { MAX_DELIVERY_RESPONSE } from "./maxDeliveryResponse.js";
import { and, eq, sql } from "drizzle-orm";

import { truncate } from "./truncate.js";
import { webhookDeliveries } from "../../schema.js";
/**
 * Marks webhookDeliveries delivered only while the same delivering claim still owns its nextAttemptAt fence.
 * The bounded response snapshot and claim predicate keep a late HTTP completion from overwriting a retried or replaced delivery.
 */
export async function completeDelivery(
    executor: DrizzleExecutor,
    delivery: ClaimedDelivery,
    responseStatus: number,
    responseBody?: string,
): Promise<void> {
    await executor
        .update(webhookDeliveries)
        .set({
            status: "delivered",
            responseStatus,
            responseBody: truncate(responseBody, MAX_DELIVERY_RESPONSE) ?? null,
            lastError: null,
            deliveredAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(
            and(
                eq(webhookDeliveries.id, delivery.id),
                eq(webhookDeliveries.status, "delivering"),
                eq(webhookDeliveries.nextAttemptAt, delivery.nextAttemptAt),
            ),
        );
}
