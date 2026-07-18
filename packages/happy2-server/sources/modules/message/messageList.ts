import { CollaborationError, type MessageSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { and, asc, desc, eq, gt, lt, type SQL } from "drizzle-orm";

import { messages } from "../schema.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { messageGetProjection } from "./messageGetProjection.js";
/**
 * Pages messages in an accessible chat before or after a sequence, returning chronological projections and the current chat point.
 * Loading one extra identifier detects continuation while projecting each message through current deletion, expiry, and viewer-access rules.
 */
export async function messageList(
    executor: DrizzleExecutor,
    input: {
        userId: string;
        chatId: string;
        beforeSequence?: number;
        afterSequence?: number;
        limit: number;
    },
): Promise<{
    messages: MessageSummary[];
    chatPts: string;
    hasMore: boolean;
}> {
    const chat = await chatGetAccess(executor, input.userId, input.chatId, false);
    if (!chat) throw new CollaborationError("not_found", "Chat was not found");
    const conditions: SQL[] = [eq(messages.chatId, input.chatId)];
    if (input.beforeSequence !== undefined) {
        conditions.push(lt(messages.sequence, input.beforeSequence));
    }
    if (input.afterSequence !== undefined) {
        conditions.push(gt(messages.sequence, input.afterSequence));
    }
    const ascending = input.afterSequence !== undefined;
    const result = await executor
        .select({
            id: messages.id,
        })
        .from(messages)
        .where(and(...conditions))
        .orderBy(ascending ? asc(messages.sequence) : desc(messages.sequence))
        .limit(input.limit + 1);
    const hasMore = result.length > input.limit;
    const ids = result.slice(0, input.limit).map((row) => row.id);
    const summaries: MessageSummary[] = [];
    for (const id of ids) {
        const message = await messageGetProjection(executor, input.userId, id);
        if (message) summaries.push(message);
    }
    if (!ascending) summaries.reverse();
    return {
        messages: summaries,
        chatPts: chat.pts,
        hasMore,
    };
}
