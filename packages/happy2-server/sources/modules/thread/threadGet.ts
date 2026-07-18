import { CollaborationError, type ChatSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, eq, isNull } from "drizzle-orm";
import { chats } from "../schema.js";
import { chatGet } from "../chat/chatGet.js";

/**
 * Resolves the live child chat rooted at one parent message and applies ordinary chat visibility to the requesting user.
 * Keeping lookup separate from creation lets navigation inspect an existing thread without turning a GET into a durable mutation.
 */
export async function threadGet(
    executor: DrizzleExecutor,
    userId: string,
    parentMessageId: string,
): Promise<ChatSummary> {
    const [child] = await executor
        .select({ id: chats.id })
        .from(chats)
        .where(and(eq(chats.parentMessageId, parentMessageId), isNull(chats.deletedAt)))
        .limit(1);
    if (!child) throw new CollaborationError("not_found", "Thread was not found");
    return chatGet(executor, userId, child.id);
}
