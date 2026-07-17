import { type ApiCredentialSummary } from "../integrations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { apiCredentials } from "../schema.js";
import { asCredential } from "./impl/asCredential.js";
import { credentialSelection } from "./impl/credentialSelection.js";
import { desc, eq } from "drizzle-orm";

import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";
import { integrationRequire } from "./integrationRequire.js";
/**
 * Lists an existing integration's credential metadata newest first after requiring an active server integration administrator.
 * Including revoked credentials supports rotation and audit while never projecting the stored secret hash itself.
 */
export async function apiCredentialList(
    executor: DrizzleExecutor,
    actorUserId: string,
    integrationId: string,
): Promise<ApiCredentialSummary[]> {
    await userRequireIntegrationAdmin(executor, actorUserId);
    await integrationRequire(executor, integrationId, false);
    const rows = await executor
        .select(credentialSelection)
        .from(apiCredentials)
        .where(eq(apiCredentials.integrationId, integrationId))
        .orderBy(desc(apiCredentials.createdAt), desc(apiCredentials.id));
    return rows.map(asCredential);
}
