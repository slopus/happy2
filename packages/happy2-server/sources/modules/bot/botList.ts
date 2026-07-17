import { type BotSummary } from "../integrations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { asBot } from "./impl/asBot.js";
import { botIdentities } from "../schema.js";
import { desc } from "drizzle-orm";
import { userRequireIntegrationAdmin } from "../integration/userRequireIntegrationAdmin.js";
/**
 * Lists all bot identities newest first for an active server integration administrator, including inactive historical records.
 * Retaining revoked bots in this management projection supports audit and repair without granting them runtime eligibility.
 */
export async function botList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<BotSummary[]> {
    await userRequireIntegrationAdmin(executor, actorUserId);
    const rows = await executor
        .select({
            id: botIdentities.id,
            name: botIdentities.name,
            username: botIdentities.username,
            description: botIdentities.description,
            photo_file_id: botIdentities.photoFileId,
            owner_user_id: botIdentities.ownerUserId,
            active: botIdentities.active,
            created_at: botIdentities.createdAt,
            updated_at: botIdentities.updatedAt,
        })
        .from(botIdentities)
        .orderBy(desc(botIdentities.createdAt), desc(botIdentities.id));
    return rows.map(asBot);
}
