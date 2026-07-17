import { type ChatMutation } from "./impl/chatMutation.js";
import { CollaborationError } from "./types.js";
import { type DrizzleTransaction } from "../drizzle.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chats } from "../schema.js";

import { chatUpdateInsert } from "./chatUpdateInsert.js";
/**
 * Advances a chats point and delegates insertion of the ordered channel and global updates at a caller-supplied sequence.
 * Requiring the caller's transaction ties the entity mutation to the exact synchronization cursors that announce it.
 */
export async function chatAdvanceWithSequence(
    tx: DrizzleTransaction,
    sequence: number,
    actorUserId: string | undefined,
    chatId: string,
    kind: string,
    entityId?: string,
    targetUserId?: string,
    incrementMessageSequence = false,
): Promise<
    ChatMutation & {
        messageSequence?: number;
    }
> {
    const [row] = await tx
        .update(chats)
        .set({
            pts: sql`${chats.pts} + 1`,
            lastMessageSequence: sql`${chats.lastMessageSequence} + ${incrementMessageSequence ? 1 : 0}`,
            lastChangeSequence: sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
        .returning({
            pts: chats.pts,
            lastMessageSequence: chats.lastMessageSequence,
        });
    if (!row) throw new CollaborationError("not_found", "Chat was not found");
    await chatUpdateInsert(tx, {
        sequence,
        pts: row.pts,
        chatId,
        kind,
        entityId,
        actorUserId,
        targetUserId,
    });
    return {
        sequence,
        pts: row.pts,
        chatId,
        messageSequence: incrementMessageSequence ? row.lastMessageSequence : undefined,
    };
}
