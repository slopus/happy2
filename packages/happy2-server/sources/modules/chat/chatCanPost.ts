import { type DrizzleExecutor } from "../drizzle.js";
import { chatGetAccess } from "./chatGetAccess.js";
import { chatIsPostingRestricted } from "./chatIsPostingRestricted.js";
/**
 * Reports whether an active member can post to a live, unarchived chat without a current moderation restriction.
 * Combining membership, archive, and restriction checks gives every message-producing caller the same posting decision.
 */
export async function chatCanPost(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const chat = await chatGetAccess(executor, userId, chatId, true);
    return Boolean(
        chat && !chat.archivedAt && !(await chatIsPostingRestricted(executor, userId, chatId)),
    );
}
