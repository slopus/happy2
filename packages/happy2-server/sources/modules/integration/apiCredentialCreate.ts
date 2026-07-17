import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationScope, type IssuedApiCredential } from "../integrations/types.js";

import { apiCredentials } from "../schema.js";
import { asCredential } from "./impl/asCredential.js";
import { createId } from "@paralleldrive/cuid2";
import { credentialSelection } from "./impl/credentialSelection.js";
import { eq } from "drizzle-orm";
import { futureDate } from "./impl/futureDate.js";
import { generateApiToken, secretHash, tokenPrefix } from "../integrations/secrets.js";
import { normalizeScopes } from "./impl/normalizeScopes.js";
import { requireScopeSubset } from "./impl/requireScopeSubset.js";
import { requiredTrimmed } from "./requiredTrimmed.js";

import { integrationAppendAudit } from "./integrationAppendAudit.js";
import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";
import { integrationRequire } from "./integrationRequire.js";

/**
 * Creates a hashed apiCredentials secret whose scopes are a validated subset of the administrator-managed integration's capabilities.
 * Storing only the hash with its audit entry makes the returned plaintext a one-time credential and records who expanded external access.
 */
export async function apiCredentialCreate(
    executor: DrizzleExecutor,
    nowProvider: () => Date,
    input: {
        actorUserId: string;
        integrationId: string;
        name: string;
        scopes?: readonly IntegrationScope[];
        expiresAt?: string;
    },
): Promise<IssuedApiCredential> {
    const name = requiredTrimmed(input.name, "Credential name", 200);
    const expiresAt = input.expiresAt ? futureDate(input.expiresAt, nowProvider()) : undefined;
    const token = generateApiToken();
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, input.actorUserId);
        const integration = await integrationRequire(tx, input.integrationId, true);
        const scopes = input.scopes ? normalizeScopes(input.scopes) : integration.scopes;
        requireScopeSubset(scopes, integration.scopes);
        const id = createId();
        await tx.insert(apiCredentials).values({
            id,
            integrationId: input.integrationId,
            name,
            tokenPrefix: tokenPrefix(token),
            tokenHash: secretHash(token),
            scopesJson: JSON.stringify(scopes),
            createdByUserId: input.actorUserId,
            expiresAt: expiresAt ?? null,
        });
        await integrationAppendAudit(
            tx,
            input.actorUserId,
            "integration.credential_created",
            "api_credential",
            id,
            {
                integrationId: input.integrationId,
                scopes,
            },
        );
        const [row] = await tx
            .select(credentialSelection)
            .from(apiCredentials)
            .where(eq(apiCredentials.id, id));
        if (!row) throw new Error("API credential was not created");
        return {
            credential: asCredential(row),
            token,
        };
    });
}
