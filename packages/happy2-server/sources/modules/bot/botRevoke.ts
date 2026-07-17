import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type IntegrationChange, IntegrationError } from "../integrations/types.js";

import { and, eq, isNull, or, sql } from "drizzle-orm";
import { apiCredentials, botIdentities, integrations } from "../schema.js";

import { integrationAppendAudit } from "../integration/integrationAppendAudit.js";
import { integrationRecordChange } from "../integration/integrationRecordChange.js";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";

/**
 * Revokes botIdentities access, invalidates its apiCredentials, and disables the owning integrations relationship when required.
 * One administrator-audited transition ensures no usable credential survives after the bot is reported as revoked.
 */
export async function botRevoke(
    executor: DrizzleExecutor,
    actorUserId: string,
    botId: string,
): Promise<IntegrationChange> {
    return withTransaction(executor, async (tx) => {
        await userRequireIntegrationAdmin(tx, actorUserId);
        const changed = await tx
            .update(botIdentities)
            .set({
                active: 0,
                deletedAt: sql`CURRENT_TIMESTAMP`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(botIdentities.id, botId), isNull(botIdentities.deletedAt)))
            .returning({
                id: botIdentities.id,
            });
        if (changed.length === 0) throw new IntegrationError("not_found", "Bot was not found");
        const integrationIds = tx
            .select({
                id: integrations.id,
            })
            .from(integrations)
            .where(eq(integrations.botId, botId));
        await tx
            .update(apiCredentials)
            .set({
                revokedAt: sql`coalesce(${apiCredentials.revokedAt}, CURRENT_TIMESTAMP)`,
            })
            .where(
                or(
                    eq(apiCredentials.botId, botId),
                    sql`${apiCredentials.integrationId} in (${integrationIds})`,
                ),
            );
        await tx
            .update(integrations)
            .set({
                active: 0,
                deletedAt: sql`coalesce(${integrations.deletedAt}, CURRENT_TIMESTAMP)`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(integrations.botId, botId));
        const change = await integrationRecordChange(tx, actorUserId, "bot.revoked", botId);
        await integrationAppendAudit(tx, actorUserId, "bot.revoked", "bot", botId);
        return change;
    });
}
