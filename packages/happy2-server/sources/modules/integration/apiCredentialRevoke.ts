import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { IntegrationError } from "../integrations/types.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { apiCredentials } from "../schema.js";

import { integrationAppendAudit } from "./integrationAppendAudit.js";
import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";

/**
 * Marks an unrevoked apiCredentials row by identifier after requiring the actor to be a server integration administrator.
 * Recording the revocation and audit entry together makes every server reject the credential without process-local token state.
 */
export async function apiCredentialRevoke(
    executor: DrizzleExecutor,
    actorUserId: string,
    credentialId: string,
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, actorUserId);
        const changed = await tx
            .update(apiCredentials)
            .set({
                revokedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(apiCredentials.id, credentialId), isNull(apiCredentials.revokedAt)))
            .returning({
                id: apiCredentials.id,
            });
        if (changed.length === 0)
            throw new IntegrationError("not_found", "API credential was not found");
        await integrationAppendAudit(
            tx,
            actorUserId,
            "integration.credential_revoked",
            "api_credential",
            credentialId,
        );
    });
}
