import { and, eq, isNotNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { type MutationHint } from "../chat/types.js";
import { userRequireActive } from "../chat/userRequireActive.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { users } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Finalizes an active human's offline transition in users.syncSequence and syncEvents.
 * The last heartbeat already persisted users.lastSeenAt, so this one transaction exposes that exact
 * durable value once per ended lease instead of broadcasting every online renewal.
 */
export async function userLastSeenFinalize(
    executor: DrizzleExecutor,
    userId: string,
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        await userRequireActive(tx, userId);
        const sequence = await syncSequenceNext(tx);
        const updated = await tx
            .update(users)
            .set({ syncSequence: sequence })
            .where(and(eq(users.id, userId), eq(users.kind, "human"), isNotNull(users.lastSeenAt)))
            .returning({ id: users.id });
        if (updated.length !== 1) throw new Error("Human last seen was not finalized");
        await syncEventInsert(tx, {
            sequence,
            kind: "presence.lastSeenUpdated",
            entityId: userId,
            actorUserId: userId,
        });
        return areaHint(sequence, "presence");
    });
}
