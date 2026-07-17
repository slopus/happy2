import { type DrizzleTransaction } from "../drizzle.js";
import { syncEvents } from "../schema.js";
/**
 * Records an entity, actor, target, and optional chat coordinates in syncEvents for an allocated sequence.
 * Requiring the caller's transaction prevents a durable entity mutation from committing without its corresponding reconciliation event.
 */
export async function syncEventInsert(
    tx: DrizzleTransaction,
    input: {
        sequence: number;
        kind: string;
        chatId?: string;
        chatPts?: number;
        entityId?: string;
        actorUserId?: string;
        targetUserId?: string;
    },
): Promise<void> {
    await tx.insert(syncEvents).values({
        sequence: input.sequence,
        kind: input.kind,
        chatId: input.chatId,
        chatPts: input.chatPts,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
        targetUserId: input.targetUserId,
    });
}
