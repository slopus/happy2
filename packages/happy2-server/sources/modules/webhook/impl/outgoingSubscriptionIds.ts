import { and, asc, eq, isNull, or, sql } from "drizzle-orm";

import { type DrizzleExecutor } from "../../drizzle.js";

import { integrations, webhookSubscriptions } from "../../schema.js";

export function outgoingSubscriptionIds(
    executor: DrizzleExecutor,
    eventType: string,
    chatId?: string,
) {
    return executor
        .select({
            id: webhookSubscriptions.id,
        })
        .from(webhookSubscriptions)
        .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
        .where(
            and(
                eq(webhookSubscriptions.direction, "outgoing"),
                eq(webhookSubscriptions.active, 1),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
                or(
                    isNull(webhookSubscriptions.chatId),
                    eq(webhookSubscriptions.chatId, chatId ?? ""),
                ),
                sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = ${eventType})`,
                sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'events:read')`,
            ),
        )
        .orderBy(asc(webhookSubscriptions.id));
}
