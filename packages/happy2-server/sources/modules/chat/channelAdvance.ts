import { and, eq, isNull, sql } from "drizzle-orm";
import { chats } from "../schema.js";
import { type DrizzleTransaction } from "../drizzle.js";

import { channelUpdateInsert } from "./channelUpdateInsert.js";

/**
 * Advances chats point and optional message counters, then records the matching channel update and sync events.
 * Requiring the caller's transaction prevents consumers from observing a counter increment without the delivery records that describe it.
 */
export async function channelAdvance(
    executor: DrizzleTransaction,
    input: {
        sequence: number;
        chatId: string;
        kind: string;
        entityId?: string;
        actorUserId?: string;
        targetUserId?: string;
        incrementMessageSequence?: boolean;
    },
): Promise<{
    pts: number;
    messageSequence?: number;
}> {
    const [row] = await executor
        .update(chats)
        .set({
            pts: sql`${chats.pts} + 1`,
            lastMessageSequence: sql`${chats.lastMessageSequence} + ${input.incrementMessageSequence ? 1 : 0}`,
            lastChangeSequence: input.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
        .returning({
            pts: chats.pts,
            lastMessageSequence: chats.lastMessageSequence,
        });
    if (!row) throw new Error("Channel no longer exists");
    await channelUpdateInsert(executor, {
        ...input,
        pts: row.pts,
    });
    return {
        pts: row.pts,
        ...(input.incrementMessageSequence
            ? {
                  messageSequence: row.lastMessageSequence,
              }
            : {}),
    };
}
