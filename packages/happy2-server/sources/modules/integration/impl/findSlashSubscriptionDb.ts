import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq, isNull, sql } from "drizzle-orm";

import { integrations, slashCommands, webhookSubscriptions } from "../../schema.js";

/**
 * Finds the active outgoing webhookSubscriptions target for a case-insensitive slashCommands name and commands:receive scope.
 * The joined predicate keeps command, integration, subscription, direction, and event-type eligibility in one dispatch decision.
 */
export async function findSlashSubscriptionDb(executor: DrizzleExecutor, command: string) {
    const [row] = await executor
        .select({
            id: slashCommands.id,
            integrationId: slashCommands.integrationId,
            subscriptionId: webhookSubscriptions.id,
        })
        .from(slashCommands)
        .innerJoin(integrations, eq(integrations.id, slashCommands.integrationId))
        .innerJoin(webhookSubscriptions, eq(webhookSubscriptions.integrationId, integrations.id))
        .where(
            and(
                sql`${slashCommands.command} = ${command} collate nocase`,
                eq(slashCommands.active, 1),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
                sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'commands:receive')`,
                eq(webhookSubscriptions.direction, "outgoing"),
                eq(webhookSubscriptions.active, 1),
                sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = 'slash_command:' || ${slashCommands.id})`,
            ),
        )
        .limit(1);
    return row;
}
