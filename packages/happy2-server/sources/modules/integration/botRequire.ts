import { type DrizzleExecutor } from "../drizzle.js";
import { botGet } from "../bot/botGet.js";
/**
 * Requires a bot identity to exist, remain active, and not be soft-deleted before an integration may bind or invoke it.
 * Exposing a void guard keeps mutation callers from accidentally accepting inactive bots while discarding an unused projection.
 */
export async function botRequire(executor: DrizzleExecutor, botId: string): Promise<void> {
    await botGet(executor, botId, true);
}
