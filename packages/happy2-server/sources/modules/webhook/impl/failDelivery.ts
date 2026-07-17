import { type ClaimedDelivery } from "../../integration/claimedDelivery.js";
import { DeliveryHttpError } from "./deliveryHttpError.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { MAX_DELIVERY_RESPONSE } from "./maxDeliveryResponse.js";
import { and, eq } from "drizzle-orm";

import { errorMessage } from "./errorMessage.js";
import { retryDelay } from "./retryDelay.js";
import { truncate } from "./truncate.js";
import { webhookDeliveries } from "../../schema.js";
/**
 * Records a bounded webhookDeliveries failure and deterministic next-attempt time for the still-owned delivery claim.
 * The claim fence prevents a stale request from replacing newer retry state, while exhaustion leaves the delivery terminally failed.
 */
export async function failDelivery(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    delivery: ClaimedDelivery,
    error: unknown,
    maxAttempts: number,
): Promise<void> {
    const response = error instanceof DeliveryHttpError ? error : undefined;
    const exhausted = delivery.attempts >= maxAttempts;
    const nextAttemptAt = exhausted
        ? nowProvider().toISOString()
        : new Date(
              nowProvider().getTime() + retryDelay(delivery.id, delivery.attempts),
          ).toISOString();
    await executor
        .update(webhookDeliveries)
        .set({
            status: "failed",
            nextAttemptAt,
            responseStatus: response?.statusCode ?? null,
            responseBody: truncate(response?.responseBody, MAX_DELIVERY_RESPONSE) ?? null,
            lastError: truncate(errorMessage(error), 2_000)!,
        })
        .where(
            and(
                eq(webhookDeliveries.id, delivery.id),
                eq(webhookDeliveries.status, "delivering"),
                eq(webhookDeliveries.nextAttemptAt, delivery.nextAttemptAt),
            ),
        );
}
