import { type DrizzleExecutor } from "../../drizzle.js";
import { type WebhookSubscriptionSummary } from "../../integrations/types.js";
import { asSubscription } from "./asSubscription.js";
import { eq } from "drizzle-orm";
import { subscriptionSelection } from "./subscriptionSelection.js";
import { webhookSubscriptions } from "../../schema.js";
/**
 * Loads one webhookSubscriptions row through the shared summary selection and rejects a missing post-create record.
 * Keeping construction lookup beside asSubscription guarantees create and update paths return the same durable projection.
 */
export async function getSubscriptionDb(
    executor: DrizzleExecutor,
    subscriptionId: string,
): Promise<WebhookSubscriptionSummary> {
    const [row] = await executor
        .select(subscriptionSelection)
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.id, subscriptionId));
    if (!row) throw new Error("Webhook subscription was not created");
    return asSubscription(row);
}
