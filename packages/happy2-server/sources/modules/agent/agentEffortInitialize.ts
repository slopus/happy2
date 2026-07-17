import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { and, eq, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { users } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Initializes a users agent-effort preference only when no explicit value has been stored yet.
 * The conditional write preserves a user's later choice while still giving newly provisioned agents a deterministic default.
 */
export async function agentEffortInitialize(
    executor: DrizzleExecutor,
    agentUserId: string,
    effort: string,
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const [agent] = await tx
            .select({
                effort: users.agentEffort,
            })
            .from(users)
            .where(and(eq(users.id, agentUserId), eq(users.kind, "agent"), isNull(users.deletedAt)))
            .limit(1);
        if (!agent || agent.effort) return undefined;
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(users)
            .set({
                agentEffort: effort,
                syncSequence: sequence,
            })
            .where(and(eq(users.id, agentUserId), isNull(users.agentEffort)));
        await syncEventInsert(tx, {
            sequence,
            kind: "user.agentEffortInitialized",
            entityId: agentUserId,
        });
        return areaHint(sequence, "users");
    });
}
