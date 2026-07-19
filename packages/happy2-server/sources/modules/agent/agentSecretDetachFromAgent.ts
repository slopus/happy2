import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentSecretAgentAssignments } from "../schema.js";
import { and, eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Revokes a direct grant by deleting agentSecretAgentAssignments after requiring assignSecrets permission.
 * Publishing revocation and audit evidence in the same commit ensures future runs cannot retain a grant clients still believe exists.
 */
export async function agentSecretDetachFromAgent(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        secretId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "assignSecrets");
        const removed = await tx
            .delete(agentSecretAgentAssignments)
            .where(
                and(
                    eq(agentSecretAgentAssignments.secretId, input.secretId),
                    eq(agentSecretAgentAssignments.agentUserId, input.agentUserId),
                ),
            )
            .returning({
                secretId: agentSecretAgentAssignments.secretId,
            });
        if (!removed.length) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.detachedFromAgent",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.detached_from_agent",
            targetType: "user",
            targetId: input.agentUserId,
            after: {
                secretId: input.secretId,
            },
        });
        return areaHint(sequence, "agent-secrets");
    });
}
