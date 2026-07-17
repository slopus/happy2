import { type DrizzleExecutor } from "../drizzle.js";
import { type WebhookSubscriptionSummary } from "../integrations/types.js";
import { asSubscription } from "./impl/asSubscription.js";
import { desc, eq } from "drizzle-orm";

import { subscriptionSelection } from "./impl/subscriptionSelection.js";
import { webhookSubscriptions } from "../schema.js";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
import { integrationRequire } from "../integration/integrationRequire.js";
/**
 * Lists an existing integration's webhook subscriptions for a server integration administrator.
 * Authorization and integration existence checks are kept at this boundary because subscription configuration is not exposed to ordinary members.
 */
export async function webhookSubscriptionList(
    executor: DrizzleExecutor,
    actorUserId: string,
    integrationId: string,
): Promise<WebhookSubscriptionSummary[]> {
    await userRequireIntegrationAdmin(executor, actorUserId);
    await integrationRequire(executor, integrationId, false);
    const rows = await executor
        .select(subscriptionSelection)
        .from(webhookSubscriptions)
        .where(eq(webhookSubscriptions.integrationId, integrationId))
        .orderBy(desc(webhookSubscriptions.createdAt), desc(webhookSubscriptions.id));
    return rows.map(asSubscription);
}
