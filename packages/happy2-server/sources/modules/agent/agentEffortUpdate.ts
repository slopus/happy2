import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint, type UserSummary } from "../chat/types.js";

import { areaHint } from "../chat/areaHint.js";
import { asUser } from "../chat/asUser.js";
import { eq } from "drizzle-orm";
import { userSelection } from "../chat/userSelection.js";
import { users } from "../schema.js";
import { agentEffortContextDb } from "./impl/agentEffortContextDb.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Stores the selected reasoning effort on the target agent's users row and records the authorized change for sync and audit consumers.
 * Treating the preference, event, and audit entry as one transition keeps future turns from observing an unaccounted configuration change.
 */
export async function agentEffortUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        effort: string;
    },
): Promise<{
    user: UserSummary;
    hint?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const context = await agentEffortContextDb(tx, input.actorUserId, input.agentUserId, true);
        if (context.effort === input.effort) {
            const [user] = await tx
                .select(userSelection)
                .from(users)
                .where(eq(users.id, input.agentUserId));
            if (!user) throw new Error("Agent effort target is missing");
            return {
                user: asUser(user),
            };
        }
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(users)
            .set({
                agentEffort: input.effort,
                syncSequence: sequence,
            })
            .where(eq(users.id, input.agentUserId));
        await syncEventInsert(tx, {
            sequence,
            kind: "user.agentEffortChanged",
            entityId: input.agentUserId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent.effort_changed",
            targetType: "user",
            targetId: input.agentUserId,
            before: {
                effort: context.effort,
            },
            after: {
                effort: input.effort,
            },
        });
        const [user] = await tx
            .select(userSelection)
            .from(users)
            .where(eq(users.id, input.agentUserId));
        if (!user) throw new Error("Updated agent is missing");
        return {
            user: asUser(user),
            hint: areaHint(sequence, "users"),
        };
    });
}
