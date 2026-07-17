import { type ApiCredentialSummary } from "../../integrations/types.js";
import { optionalText } from "../optionalText.js";
import { parseScopes } from "../parseScopes.js";
import { text } from "../text.js";
export function asCredential(row: Record<string, unknown>): ApiCredentialSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        name: text(row.name),
        tokenPrefix: text(row.token_prefix),
        scopes: parseScopes(row.scopes_json),
        expiresAt: optionalText(row.expires_at),
        lastUsedAt: optionalText(row.last_used_at),
        revokedAt: optionalText(row.revoked_at),
        createdAt: text(row.created_at),
    };
}
