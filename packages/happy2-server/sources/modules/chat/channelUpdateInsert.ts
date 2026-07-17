import { chatUpdates, syncEvents } from "../schema.js";
import { type DrizzleTransaction } from "../drizzle.js";

/**
 * Inserts the chatUpdates row and global or targeted syncEvents for one channel point change.
 * Requiring the caller's transaction keeps delivery hints in the same commit as the channel counter that produced their pts value.
 */
export async function channelUpdateInsert(
    executor: DrizzleTransaction,
    input: {
        sequence: number;
        pts: number;
        chatId: string;
        kind: string;
        entityId?: string;
        actorUserId?: string;
        targetUserId?: string;
    },
): Promise<void> {
    await executor.insert(chatUpdates).values({
        chatId: input.chatId,
        pts: input.pts,
        kind: input.kind,
        entityId: input.entityId,
    });
    await executor.insert(syncEvents).values({
        sequence: input.sequence,
        kind: input.kind,
        chatId: input.chatId,
        chatPts: input.pts,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
    });
    if (input.targetUserId)
        await executor.insert(syncEvents).values({
            sequence: input.sequence,
            kind: input.kind,
            chatId: input.chatId,
            chatPts: input.pts,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
}
