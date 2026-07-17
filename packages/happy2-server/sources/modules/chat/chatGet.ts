import { type ChatSummary, CollaborationError } from "./types.js";

import { type DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "./chatGetAccess.js";
/**
 * Returns a live chat when the active user is a member or the target is a public channel under the shared access projection.
 * Mapping all inaccessible identifiers to not-found prevents callers from probing private chat existence.
 */
export async function chatGet(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<ChatSummary> {
    const chat = await chatGetAccess(executor, userId, chatId, false);
    if (!chat) throw new CollaborationError("not_found", "Chat was not found");
    return chat;
}
