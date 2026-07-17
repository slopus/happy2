import { DeliveryHttpError } from "./impl/deliveryHttpError.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { MAX_DELIVERY_ATTEMPTS } from "./impl/maxDeliveryAttempts.js";
import { type SecretProtector } from "../integrations/secrets.js";
import { type WebhookTransport } from "../integrations/types.js";
import { type WebhookUrlPolicy } from "../integrations/ssrf.js";
import { createHmac } from "node:crypto";
import { positiveLimit } from "./impl/positiveLimit.js";
import { claimDueDeliveries } from "./impl/claimDueDeliveries.js";
import { completeDelivery } from "./impl/completeDelivery.js";
import { failDelivery } from "./impl/failDelivery.js";
/**
 * Leases due webhook deliveries, resolves each destination under the SSRF policy, signs its payload, and records the HTTP outcome or retry failure.
 * Network I/O intentionally sits between separate claim and terminal updates so no database transaction remains open while the remote endpoint responds.
 */
export async function webhookDeliveryDispatchDue(
    executor: DrizzleExecutor,
    urlPolicy: WebhookUrlPolicy,
    protector: SecretProtector,
    nowProvider: () => Date,
    transport: WebhookTransport,
    options: {
        limit?: number;
        leaseMs?: number;
        maxAttempts?: number;
    } = {},
): Promise<{
    delivered: number;
    failed: number;
}> {
    const limit = positiveLimit(options.limit ?? 25, 100);
    const leaseMs = positiveLimit(options.leaseMs ?? 30_000, 300_000);
    const maxAttempts = positiveLimit(options.maxAttempts ?? MAX_DELIVERY_ATTEMPTS, 20);
    const claimed = await claimDueDeliveries(executor, nowProvider, limit, leaseMs, maxAttempts);
    let delivered = 0;
    let failed = 0;
    for (const delivery of claimed) {
        try {
            const target = await urlPolicy.resolveForDelivery(delivery.url);
            const secret = await protector.reveal(delivery.signingSecretCiphertext);
            const timestamp = Math.floor(nowProvider().getTime() / 1_000).toString();
            const signature = `v1=${createHmac("sha256", secret).update(`${timestamp}.${delivery.payloadJson}`, "utf8").digest("hex")}`;
            const response = await transport.deliver({
                deliveryId: delivery.id,
                eventId: delivery.eventId,
                eventType: delivery.eventType,
                url: target.url,
                allowedAddresses: target.addresses,
                body: delivery.payloadJson,
                headers: {
                    "content-type": "application/json",
                    "x-happy2-event-id": delivery.eventId,
                    "x-happy2-signature": signature,
                    "x-happy2-timestamp": timestamp,
                },
            });
            if (response.statusCode < 200 || response.statusCode >= 300)
                throw new DeliveryHttpError(response.statusCode, response.body);
            await completeDelivery(executor, delivery, response.statusCode, response.body);
            delivered += 1;
        } catch (error: unknown) {
            await failDelivery(executor, nowProvider, delivery, error, maxAttempts);
            failed += 1;
        }
    }
    return {
        delivered,
        failed,
    };
}
