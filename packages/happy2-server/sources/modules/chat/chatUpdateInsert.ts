import { type DrizzleTransaction } from "../drizzle.js";
import { chatUpdates } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
/**
 * Inserts the per-channel chatUpdates row and delegates global or targeted event delivery for one already allocated point.
 * Requiring the surrounding transaction prevents durable chat state from committing without the coordinates clients need to reconcile it.
 */
export async function chatUpdateInsert(
    tx: DrizzleTransaction,
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
    await tx.insert(chatUpdates).values({
        chatId: input.chatId,
        pts: input.pts,
        ptsCount: 1,
        kind: input.kind,
        entityId: input.entityId,
    });
    await syncEventInsert(tx, {
        sequence: input.sequence,
        kind: input.kind,
        chatId: input.chatId,
        chatPts: input.pts,
        entityId: input.entityId,
        actorUserId: input.actorUserId,
    });
    if (input.targetUserId)
        await syncEventInsert(tx, {
            sequence: input.sequence,
            kind: input.kind,
            chatId: input.chatId,
            chatPts: input.pts,
            entityId: input.entityId,
            actorUserId: input.actorUserId,
            targetUserId: input.targetUserId,
        });
}
