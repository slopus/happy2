import { type DrizzleExecutor } from "../drizzle.js";
import { type QueuedWebhookDelivery } from "../integrations/types.js";
import { asDelivery } from "../integration/asDelivery.js";
import { deliverySelection } from "../integration/deliverySelection.js";
import { desc, eq } from "drizzle-orm";

import { positiveLimit } from "./impl/positiveLimit.js";
import { webhookDeliveries, webhookSubscriptions } from "../schema.js";

import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
import { integrationRequire } from "../integration/integrationRequire.js";
/**
 * Lists the newest queued deliveries for an existing integration after server-level integration-admin authorization.
 * The bounded projection exposes delivery state without allowing ordinary integration users to inspect payload history.
 */
export async function webhookDeliveryList(
    executor: DrizzleExecutor,
    actorUserId: string,
    integrationId: string,
    limit = 100,
): Promise<QueuedWebhookDelivery[]> {
    await userRequireIntegrationAdmin(executor, actorUserId);
    positiveLimit(limit, 200);
    await integrationRequire(executor, integrationId, false);
    const rows = await executor
        .select(deliverySelection)
        .from(webhookDeliveries)
        .innerJoin(
            webhookSubscriptions,
            eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
        )
        .where(eq(webhookSubscriptions.integrationId, integrationId))
        .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
        .limit(limit);
    return rows.map(asDelivery);
}
