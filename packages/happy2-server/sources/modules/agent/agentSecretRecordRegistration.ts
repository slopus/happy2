import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { areaHint } from "../chat/areaHint.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Records an administrator-authorized agent-secret registration as a global sync event and audit entry.
 * The transaction keeps both durable records on the same sequence so observers cannot see an unaudited registration signal.
 */
export async function agentSecretRecordRegistration(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        secretId: string;
    },
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.registered",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.registered",
            targetType: "agent_secret",
            targetId: input.secretId,
        });
        return areaHint(sequence, "agent-secrets");
    });
}
