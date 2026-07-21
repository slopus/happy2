import { type DrizzleExecutor } from "../drizzle.js";
import { chatAppearsInList } from "./chatAppearsInList.js";
import { chatGetAccess } from "./chatGetAccess.js";

/**
 * Reports whether current access and sidebar ancestry allow one chat to appear in a user's sync difference.
 * Walking nested channels to a listed ancestor preserves reactivity without letting later descendant activity resurrect a channel the user departed.
 */
export async function chatCanSync(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const chat = await chatGetAccess(executor, userId, chatId, false);
    if (!chat) return false;
    if (chat.parentChatId) return chatCanSync(executor, userId, chat.parentChatId);
    return chatAppearsInList(executor, userId, chatId);
}
