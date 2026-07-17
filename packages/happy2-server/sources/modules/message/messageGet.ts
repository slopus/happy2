import { CollaborationError, type MessageSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { messageGetProjection } from "./messageGetProjection.js";
/**
 * Returns the complete message projection only when the viewer can access its chat, including tombstone handling and visible related content.
 * Converting a missing or inaccessible projection to not-found prevents message identifiers from revealing private chat history.
 */
export async function messageGet(
    executor: DrizzleExecutor,
    userId: string,
    messageId: string,
): Promise<MessageSummary> {
    const message = await messageGetProjection(executor, userId, messageId);
    if (!message) throw new CollaborationError("not_found", "Message was not found");
    return message;
}
