import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq, isNull } from "drizzle-orm";
import { botIdentities } from "../../schema.js";

/**
 * Reports whether a bot identity exists in active, non-deleted form for automation target validation.
 * Keeping lifecycle filtering in this helper prevents automation definitions from accepting bots that runtime invocation would reject.
 */
export async function botExists(executor: DrizzleExecutor, botId: string): Promise<boolean> {
    return Boolean(
        (
            await executor
                .select({
                    id: botIdentities.id,
                })
                .from(botIdentities)
                .where(
                    and(
                        eq(botIdentities.id, botId),
                        eq(botIdentities.active, 1),
                        isNull(botIdentities.deletedAt),
                    ),
                )
                .limit(1)
        )[0],
    );
}
