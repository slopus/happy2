import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentSecretAgentAssignments, agentSecretChannelAssignments } from "../schema.js";

import { areaHint } from "../chat/areaHint.js";
import { eq } from "drizzle-orm";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Removes every agentSecretAgentAssignments or agentSecretChannelAssignments row identified by an administrator-owned assignment.
 * Deleting the assignment alongside sync and audit evidence makes secret access disappear as one reviewable authorization change.
 */
export async function agentSecretAssignmentDelete(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        secretId: string;
    },
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        await tx
            .delete(agentSecretAgentAssignments)
            .where(eq(agentSecretAgentAssignments.secretId, input.secretId));
        await tx
            .delete(agentSecretChannelAssignments)
            .where(eq(agentSecretChannelAssignments.secretId, input.secretId));
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.deleted",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.deleted",
            targetType: "agent_secret",
            targetId: input.secretId,
        });
        return areaHint(sequence, "agent-secrets");
    });
}
