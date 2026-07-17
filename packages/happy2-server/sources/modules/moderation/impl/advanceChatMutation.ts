import { type DrizzleTransaction } from "../../drizzle.js";
import { OperationsError } from "../../operations/types.js";
import { and, eq, isNull, sql } from "drizzle-orm";
import { chats, chatUpdates } from "../../schema.js";

import { syncEventInsert } from "../../sync/syncEventInsert.js";
/**
 * Advances the moderated chats point and inserts the matching chatUpdates delivery record for the supplied operation.
 * Requiring the enclosing moderation transaction prevents removal or restoration from committing without an ordered channel change.
 */
export async function advanceChatMutation(
    tx: DrizzleTransaction,
    input: {
        sequence: number;
        chatId: string;
        kind: string;
        entityId?: string;
        actorUserId?: string;
    },
): Promise<number> {
    const [chat] = await tx
        .update(chats)
        .set({
            pts: sql`${chats.pts} + 1`,
            lastChangeSequence: input.sequence,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        })
        .where(and(eq(chats.id, input.chatId), isNull(chats.deletedAt)))
        .returning({
            pts: chats.pts,
        });
    if (!chat) throw new OperationsError("not_found", "Chat was not found");
    const pts = chat.pts;
    await tx.insert(chatUpdates).values({
        chatId: input.chatId,
        pts,
        ptsCount: 1,
        kind: input.kind,
        entityId: input.entityId,
    });
    await syncEventInsert(tx, {
        ...input,
        chatPts: pts,
    });
    return pts;
}
