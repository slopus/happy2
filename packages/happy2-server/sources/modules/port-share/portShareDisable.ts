import { and, eq, isNull, sql } from "drizzle-orm";
import { chatAdvanceWithSequence } from "../chat/chatAdvanceWithSequence.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { chatHint } from "../chat/chatHint.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { portShares } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import { PortShareError, type PortShareMutation } from "./types.js";

/**
 * Disables one active portShares row after confirming current chat membership and emits the same-transaction chat update that removes its public route.
 * Any chat member may close a share so an unwanted public exposure never depends on its original creator remaining available.
 */
export async function portShareDisable(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; portShareId: string },
): Promise<PortShareMutation> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, true)))
            throw new PortShareError("not_found", "Chat was not found");
        const [row] = await tx
            .update(portShares)
            .set({
                disabledAt: sql`CURRENT_TIMESTAMP`,
                disabledByUserId: input.actorUserId,
            })
            .where(
                and(
                    eq(portShares.id, input.portShareId),
                    eq(portShares.chatId, input.chatId),
                    isNull(portShares.disabledAt),
                ),
            )
            .returning(portShareSelection);
        if (!row) throw new PortShareError("not_found", "Active port share was not found");
        const sequence = await syncSequenceNext(tx);
        const mutation = await chatAdvanceWithSequence(
            tx,
            sequence,
            input.actorUserId,
            input.chatId,
            "portShare.disabled",
            input.portShareId,
        );
        return {
            portShare: asPortShare(row),
            hint: chatHint(sequence, input.chatId, mutation.pts),
        };
    });
}
