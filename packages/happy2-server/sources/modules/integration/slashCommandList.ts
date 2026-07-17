import { type DrizzleExecutor } from "../drizzle.js";
import { type SlashCommandSummary } from "../integrations/types.js";
import { and, asc, eq, isNull } from "drizzle-orm";
import { asSlashCommand } from "./impl/asSlashCommand.js";

import { integrations, slashCommands } from "../schema.js";

import { slashCommandSelection } from "./impl/slashCommandSelection.js";

import { userRequireIntegrationActive } from "./userRequireIntegrationActive.js";
/**
 * Lists active slash commands from active, non-deleted integrations in command-name order for an active user.
 * Filtering both command and owning integration lifecycle prevents autocomplete from advertising commands that invocation would reject.
 */
export async function slashCommandList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<SlashCommandSummary[]> {
    await userRequireIntegrationActive(executor, actorUserId);
    const rows = await executor
        .select(slashCommandSelection)
        .from(slashCommands)
        .innerJoin(integrations, eq(integrations.id, slashCommands.integrationId))
        .where(
            and(
                eq(slashCommands.active, 1),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
            ),
        )
        .orderBy(asc(slashCommands.command));
    return rows.map(asSlashCommand);
}
