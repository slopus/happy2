import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationMutation, type IssuedIncomingWebhook } from "../integrations/types.js";

import { createId } from "@paralleldrive/cuid2";
import { generateIncomingWebhookToken, secretHash } from "../integrations/secrets.js";

import { webhookSubscriptions } from "../schema.js";
import { integrationFinishChange } from "../integration/integrationFinishChange.js";
import { integrationGet } from "../integration/integrationGet.js";
import { getSubscriptionDb } from "./impl/getSubscriptionDb.js";
import { integrationInsert } from "../integration/integrationInsert.js";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
import { botRequire } from "../integration/botRequire.js";
import { requireChatDb } from "./impl/requireChatDb.js";

/**
 * Creates an incoming webhookSubscriptions endpoint for a validated bot and chat under integration-administrator control.
 * Binding secret, bot, and destination at creation prevents external requests from posting through an incomplete or unauthorized route.
 */
export async function incomingWebhookCreate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        name: string;
        description?: string;
        botId: string;
        chatId: string;
    },
): Promise<IntegrationMutation<IssuedIncomingWebhook>> {
    const token = generateIncomingWebhookToken();
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        await botRequire(tx, input.botId);
        await requireChatDb(tx, input.chatId);
        const integration = await integrationInsert(tx, {
            actorUserId: input.actorUserId,
            kind: "incoming_webhook",
            name: input.name,
            description: input.description,
            botId: input.botId,
            scopes: ["messages:write"],
        });
        const subscriptionId = createId();
        await tx.insert(webhookSubscriptions).values({
            id: subscriptionId,
            integrationId: integration.id,
            direction: "incoming",
            chatId: input.chatId,
            tokenHash: secretHash(token),
            eventTypesJson: "[]",
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
                token,
            },
            change,
        };
    });
}
