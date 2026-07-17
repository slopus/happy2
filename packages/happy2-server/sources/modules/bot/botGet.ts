import { type BotSummary, IntegrationError } from "../integrations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { asBot } from "./impl/asBot.js";
import { botIdentities } from "../schema.js";
import { botSelection } from "./impl/botSelection.js";
import { eq } from "drizzle-orm";
/**
 * Returns a bot identity by identifier and optionally requires it to remain active and non-deleted.
 * The explicit lifecycle switch lets administrative history views load revoked bots while runtime guards expose them as not-found.
 */
export async function botGet(
    executor: DrizzleExecutor,
    botId: string,
    active = false,
): Promise<BotSummary> {
    const [row] = await executor
        .select(botSelection)
        .from(botIdentities)
        .where(eq(botIdentities.id, botId));
    if (!row || (active && (row.active !== 1 || row.deleted_at !== null)))
        throw new IntegrationError("not_found", "Bot was not found");
    return asBot(row);
}
