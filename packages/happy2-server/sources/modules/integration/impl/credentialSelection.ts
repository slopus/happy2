import { apiCredentials } from "../../schema.js";
export const credentialSelection = {
    id: apiCredentials.id,
    integration_id: apiCredentials.integrationId,
    name: apiCredentials.name,
    token_prefix: apiCredentials.tokenPrefix,
    scopes_json: apiCredentials.scopesJson,
    expires_at: apiCredentials.expiresAt,
    last_used_at: apiCredentials.lastUsedAt,
    revoked_at: apiCredentials.revokedAt,
    created_at: apiCredentials.createdAt,
};
