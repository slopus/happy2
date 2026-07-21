import { type DrizzleExecutor } from "../drizzle.js";
import { messages } from "../schema.js";
import { eq } from "drizzle-orm";
import { chatAppearsInList } from "./chatAppearsInList.js";
import { chatGetAccess } from "./chatGetAccess.js";

/**
 * Reports whether current access and sidebar ancestry allow one chat to appear in a user's sync difference.
 * Walking nested chats to a listed ancestor preserves thread reactivity without letting later descendant activity resurrect a channel the user departed.
 */
export async function chatCanSync(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const chat = await chatGetAccess(executor, userId, chatId, false);
    if (!chat) return false;
    if (chat.parentChatId) return chatCanSync(executor, userId, chat.parentChatId);
    if (chat.parentMessageId) {
        const [parent] = await executor
            .select({ chatId: messages.chatId })
            .from(messages)
            .where(eq(messages.id, chat.parentMessageId))
            .limit(1);
        return parent ? chatCanSync(executor, userId, parent.chatId) : false;
    }
    return chatAppearsInList(executor, userId, chatId);
}
