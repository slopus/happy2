import { type DrizzleExecutor } from "../drizzle.js";
import { chatAppearsInListDb } from "./impl/chatListVisibility.js";

/**
 * Reports whether one live chat belongs in a user's sidebar under active-membership, public-discovery, and prior-departure rules.
 * Sync uses this boundary to project later chat events without reintroducing a channel the user already left or was removed from.
 */
export async function chatAppearsInList(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    return chatAppearsInListDb(executor, userId, chatId);
}
