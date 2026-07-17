import { type DrizzleExecutor } from "../../drizzle.js";
import { and, eq, isNull } from "drizzle-orm";
import { chats } from "../../schema.js";

/**
 * Reports whether a chat identifier resolves to a non-deleted conversation for automation configuration validation.
 * This existence check deliberately does not grant user access; authorization remains with the action that owns the automation definition.
 */
export async function chatExists(executor: DrizzleExecutor, chatId: string): Promise<boolean> {
    return Boolean(
        (
            await executor
                .select({
                    id: chats.id,
                })
                .from(chats)
                .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
                .limit(1)
        )[0],
    );
}
