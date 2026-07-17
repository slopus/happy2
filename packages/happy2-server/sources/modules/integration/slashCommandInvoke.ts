import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { IntegrationError, type QueuedWebhookDelivery } from "../integrations/types.js";

import { asDelivery } from "./asDelivery.js";
import { createId } from "@paralleldrive/cuid2";
import { deliverySelection } from "./deliverySelection.js";
import { eq } from "drizzle-orm";
import { normalizedCommand } from "./impl/normalizedCommand.js";
import { optionalTextBody } from "./impl/optionalTextBody.js";
import { serializedPayload } from "./serializedPayload.js";
import { slashEventType } from "./impl/slashEventType.js";
import { webhookDeliveries } from "../schema.js";
import { findSlashSubscriptionDb } from "./impl/findSlashSubscriptionDb.js";
import { requireChatMemberDb } from "./impl/requireChatMemberDb.js";

/**
 * Queues webhookDeliveries for an active slash command only after verifying the actor still belongs to the invocation chat.
 * Capturing command, chat, and actor context at enqueue time prevents asynchronous delivery from bypassing membership authorization.
 */
export async function slashCommandInvoke(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    input: {
        actorUserId: string;
        chatId: string;
        command: string;
        text?: string;
    },
): Promise<QueuedWebhookDelivery> {
    const command = normalizedCommand(input.command);
    const commandText = optionalTextBody(input.text, "Command text", 20_000) ?? "";
    return withTransaction(executor, async (tx) => {
        await requireChatMemberDb(tx, input.actorUserId, input.chatId);
        const commandRow = await findSlashSubscriptionDb(tx, command);
        if (!commandRow) throw new IntegrationError("not_found", "Slash command was not found");
        const eventId = `slash:${createId()}`;
        const eventType = slashEventType(commandRow.id);
        const payload = serializedPayload({
            eventId,
            eventType,
            occurredAt: nowProvider().toISOString(),
            payload: {
                command,
                text: commandText,
                chatId: input.chatId,
                actorUserId: input.actorUserId,
                integrationId: commandRow.integrationId,
            },
        });
        const deliveryId = createId();
        await tx.insert(webhookDeliveries).values({
            id: deliveryId,
            subscriptionId: commandRow.subscriptionId,
            eventId,
            eventType,
            payloadJson: payload,
            nextAttemptAt: nowProvider().toISOString(),
        });
        const [delivery] = await tx
            .select(deliverySelection)
            .from(webhookDeliveries)
            .where(eq(webhookDeliveries.id, deliveryId));
        if (!delivery) throw new Error("Slash command invocation was not queued");
        return asDelivery(delivery);
    });
}
