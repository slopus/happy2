import { type DrizzleExecutor } from "../drizzle.js";
import {
    type IncomingWebhookSink,
    type IncomingWebhookSinkResult,
    IntegrationError,
} from "../integrations/types.js";

import { integrations, users, webhookSubscriptions } from "../schema.js";
import { and, eq, isNull, or } from "drizzle-orm";

import { parseScopes } from "../integration/parseScopes.js";
import { requiredText } from "./impl/requiredText.js";
import { secretHash } from "../integrations/secrets.js";

/**
 * Revalidates the incoming subscription, integration, and administrator before passing its configured bot and chat to the message sink.
 * The action performs no database write itself, but owns the external send boundary and forwards a validated idempotency key when supplied.
 */
export async function incomingWebhookInvoke(
    executor: DrizzleExecutor,
    token: string,
    textValue: string,
    sink: IncomingWebhookSink,
    idempotencyKey?: string,
): Promise<IncomingWebhookSinkResult> {
    if (!token.startsWith("happy2_hook_") || token.length > 256)
        throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
    const textBody = requiredText(textValue, "Webhook message", 40_000);
    if (
        idempotencyKey !== undefined &&
        (idempotencyKey.length === 0 ||
            idempotencyKey.length > 200 ||
            !/^[\x21-\x7e]+$/.test(idempotencyKey))
    )
        throw new IntegrationError("invalid", "Idempotency key is invalid");
    const [row] = await executor
        .select({
            id: webhookSubscriptions.id,
            chatId: webhookSubscriptions.chatId,
            integrationId: integrations.id,
            botId: integrations.botId,
            scopesJson: integrations.scopesJson,
            createdByUserId: integrations.createdByUserId,
        })
        .from(webhookSubscriptions)
        .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
        .innerJoin(users, eq(users.id, integrations.createdByUserId))
        .where(
            and(
                eq(webhookSubscriptions.direction, "incoming"),
                eq(webhookSubscriptions.tokenHash, secretHash(token)),
                eq(webhookSubscriptions.active, 1),
                eq(integrations.kind, "incoming_webhook"),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
                eq(users.kind, "human"),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(users.active, 1),
            ),
        );
    if (!row || !parseScopes(row.scopesJson).includes("messages:write"))
        throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
    const chatId = row.chatId ?? undefined;
    const botId = row.botId ?? undefined;
    const actorUserId = row.createdByUserId ?? undefined;
    if (!chatId || !botId || !actorUserId)
        throw new IntegrationError("forbidden", "Incoming webhook is no longer configured");
    return sink.sendMessage({
        actorUserId,
        integrationId: row.integrationId,
        subscriptionId: row.id,
        botId,
        chatId,
        text: textBody,
        ...(idempotencyKey
            ? {
                  idempotencyKey,
              }
            : {}),
    });
}
