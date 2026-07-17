import { type DrizzleExecutor } from "../../drizzle.js";
import { IntegrationError } from "../../integrations/types.js";
import { and, eq, isNull } from "drizzle-orm";
import { chats } from "../../schema.js";

/**
 * Requires the referenced chat to exist and not be deleted before webhook configuration continues.
 * This shared guard normalizes a missing target into the integration error contract.
 */
export async function requireChatDb(executor: DrizzleExecutor, chatId: string): Promise<void> {
    const [row] = await executor
        .select({
            id: chats.id,
        })
        .from(chats)
        .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)));
    if (!row) throw new IntegrationError("not_found", "Chat was not found");
}
