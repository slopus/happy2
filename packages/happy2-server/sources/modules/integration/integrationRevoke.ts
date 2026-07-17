import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationChange, IntegrationError } from "../integrations/types.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { apiCredentials, integrations, slashCommands, webhookSubscriptions } from "../schema.js";

import { integrationAppendAudit } from "./integrationAppendAudit.js";
import { integrationRecordChange } from "./integrationRecordChange.js";
import { userRequireIntegrationAdmin } from "./userRequireIntegrationAdmin.js";

/**
 * Revokes integrations and disables their apiCredentials, webhookSubscriptions, and slashCommands after administrator authorization.
 * The shared audit transaction guarantees no external entry point remains active after the parent integration is reported disabled.
 */
export async function integrationRevoke(
    executor: DrizzleExecutor,
    actorUserId: string,
    integrationId: string,
): Promise<IntegrationChange> {
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, actorUserId);
        const changed = await tx
            .update(integrations)
            .set({
                active: 0,
                deletedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(integrations.id, integrationId), isNull(integrations.deletedAt)))
            .returning({
                id: integrations.id,
            });
        if (changed.length === 0)
            throw new IntegrationError("not_found", "Integration was not found");
        await tx
            .update(apiCredentials)
            .set({
                revokedAt: sql`coalesce(${apiCredentials.revokedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(eq(apiCredentials.integrationId, integrationId));
        await tx
            .update(webhookSubscriptions)
            .set({
                active: 0,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(webhookSubscriptions.integrationId, integrationId));
        await tx
            .update(slashCommands)
            .set({
                active: 0,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(slashCommands.integrationId, integrationId));
        const change = await integrationRecordChange(
            tx,
            actorUserId,
            "integration.revoked",
            integrationId,
        );
        await integrationAppendAudit(
            tx,
            actorUserId,
            "integration.revoked",
            "integration",
            integrationId,
        );
        return change;
    });
}
