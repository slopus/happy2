import { type AuthenticatedIntegration, type IntegrationScope } from "../integrations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { accounts, apiCredentials, integrations, users } from "../schema.js";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import { hashesEqual, secretHash, tokenPrefix } from "../integrations/secrets.js";

import { normalizeScopes } from "./impl/normalizeScopes.js";

import { parseScopes } from "./parseScopes.js";

/**
 * Validates an apiCredentials token against its hash, scopes, expiry, integration, administrator, and account state before touching lastUsedAt.
 * Keeping verification and usage telemetry together ensures only a currently authorized credential is reported as used to callers.
 */
export async function apiCredentialAuthenticate(
    executor: DrizzleExecutor,
    token: string,
    requiredScopes: readonly IntegrationScope[] = [],
): Promise<AuthenticatedIntegration | undefined> {
    if (!token.startsWith("happy2_api_") || token.length > 256) return undefined;
    const requested = normalizeScopes(requiredScopes);
    const candidates = await executor
        .select({
            id: apiCredentials.id,
            integrationId: apiCredentials.integrationId,
            tokenHash: apiCredentials.tokenHash,
            credentialScopesJson: apiCredentials.scopesJson,
            integrationScopesJson: integrations.scopesJson,
            botId: integrations.botId,
            createdByUserId: integrations.createdByUserId,
        })
        .from(apiCredentials)
        .innerJoin(integrations, eq(integrations.id, apiCredentials.integrationId))
        .innerJoin(users, eq(users.id, integrations.createdByUserId))
        .innerJoin(accounts, eq(accounts.id, users.accountId))
        .where(
            and(
                eq(apiCredentials.tokenPrefix, tokenPrefix(token)),
                isNull(apiCredentials.revokedAt),
                or(
                    isNull(apiCredentials.expiresAt),
                    gt(sql`datetime(${apiCredentials.expiresAt})`, sql`CURRENT_TIMESTAMP`),
                ),
                eq(integrations.active, 1),
                isNull(integrations.deletedAt),
                eq(users.role, "admin"),
                isNull(users.deletedAt),
                eq(accounts.active, 1),
                isNull(accounts.bannedAt),
                isNull(accounts.deletedAt),
            ),
        );
    const digest = secretHash(token);
    const row = candidates.find((candidate) => hashesEqual(candidate.tokenHash, digest));
    if (!row) return undefined;
    const credentialScopes = parseScopes(row.credentialScopesJson);
    const integrationScopeValues = parseScopes(row.integrationScopesJson);
    const effective = credentialScopes.filter((scope) => integrationScopeValues.includes(scope));
    if (requested.some((scope) => !effective.includes(scope))) return undefined;
    await executor
        .update(apiCredentials)
        .set({
            lastUsedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(apiCredentials.id, row.id), isNull(apiCredentials.revokedAt)));
    return {
        credentialId: row.id,
        integrationId: row.integrationId!,
        actorUserId: row.createdByUserId!,
        botId: row.botId ?? undefined,
        scopes: effective,
    };
}
