import { type IntegrationKind, type IntegrationSummary } from "../../integrations/types.js";

import { number } from "../number.js";
import { optionalText } from "../optionalText.js";
import { parseScopes } from "../parseScopes.js";
import { text } from "../text.js";
export function asIntegration(row: Record<string, unknown>): IntegrationSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as IntegrationKind,
        name: text(row.name),
        description: optionalText(row.description),
        botId: optionalText(row.bot_id),
        scopes: parseScopes(row.scopes_json),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
