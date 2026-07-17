import { number } from "../number.js";
import { optionalText } from "../optionalText.js";
import { type SlashCommandSummary } from "../../integrations/types.js";
import { text } from "../text.js";
export function asSlashCommand(row: Record<string, unknown>): SlashCommandSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        command: text(row.command),
        description: optionalText(row.description),
        usageHint: optionalText(row.usage_hint),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
