import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationMutation, type IssuedOutgoingWebhook } from "../integrations/types.js";

import { generateSigningSecret, type SecretProtector } from "../integrations/secrets.js";
import { type WebhookUrlPolicy } from "../integrations/ssrf.js";
import { createId } from "@paralleldrive/cuid2";

import { normalizeEventTypes } from "./impl/normalizeEventTypes.js";
import { webhookSubscriptions } from "../schema.js";
import { integrationFinishChange } from "../integration/integrationFinishChange.js";
import { integrationGet } from "../integration/integrationGet.js";
import { getSubscriptionDb } from "./impl/getSubscriptionDb.js";
import { integrationInsert } from "../integration/integrationInsert.js";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
import { requireChatDb } from "./impl/requireChatDb.js";

/**
 * Creates an outgoing webhookSubscriptions route with validated event filters, destination URL, signing secret, and chat scope.
 * The administrator-authorized boundary gives delivery workers one complete subscription rather than independently configured routing pieces.
 */
export async function outgoingWebhookCreate(
    executor: DrizzleExecutor,
    urlPolicy: WebhookUrlPolicy,
    protector: SecretProtector,
    input: {
        actorUserId: string;
        name: string;
        description?: string;
        url: string;
        eventTypes: readonly string[];
        chatId?: string;
    },
): Promise<IntegrationMutation<IssuedOutgoingWebhook>> {
    const url = urlPolicy.validateForStorage(input.url);
    const eventTypes = normalizeEventTypes(input.eventTypes);
    const signingSecret = generateSigningSecret();
    const ciphertext = await protector.protect(signingSecret);
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        if (input.chatId) await requireChatDb(tx, input.chatId);
        const integration = await integrationInsert(tx, {
            actorUserId: input.actorUserId,
            kind: "outgoing_webhook",
            name: input.name,
            description: input.description,
            scopes: ["events:read"],
        });
        const subscriptionId = createId();
        await tx.insert(webhookSubscriptions).values({
            id: subscriptionId,
            integrationId: integration.id,
            direction: "outgoing",
            chatId: input.chatId ?? null,
            url,
            signingSecretCiphertext: ciphertext,
            eventTypesJson: JSON.stringify(eventTypes),
        });
        const change = await integrationFinishChange(
            tx,
            input.actorUserId,
            "integration.created",
            integration.id,
        );
        return {
            value: {
                integration: await integrationGet(tx, integration.id),
                subscription: await getSubscriptionDb(tx, subscriptionId),
                signingSecret,
            },
            change,
        };
    });
}
