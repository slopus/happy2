import { integrations } from "../../schema.js";
export const integrationSelection = {
    id: integrations.id,
    kind: integrations.kind,
    name: integrations.name,
    description: integrations.description,
    bot_id: integrations.botId,
    scopes_json: integrations.scopesJson,
    active: integrations.active,
    created_at: integrations.createdAt,
    updated_at: integrations.updatedAt,
};
