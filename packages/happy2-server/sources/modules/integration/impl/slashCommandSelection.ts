import { slashCommands } from "../../schema.js";
export const slashCommandSelection = {
    id: slashCommands.id,
    integration_id: slashCommands.integrationId,
    command: slashCommands.command,
    description: slashCommands.description,
    usage_hint: slashCommands.usageHint,
    active: slashCommands.active,
    created_at: slashCommands.createdAt,
    updated_at: slashCommands.updatedAt,
};
