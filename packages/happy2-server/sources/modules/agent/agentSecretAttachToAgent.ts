import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentSecretAgentAssignments, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Grants an agent access by inserting agentSecretAgentAssignments after requiring assignSecrets permission.
 * Keeping the grant, audit entry, and sync event together prevents silent expansion of an agent's runtime credentials.
 */
export async function agentSecretAttachToAgent(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        secretId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "assignSecrets");
        const [agent] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .where(
                and(
                    eq(users.id, input.agentUserId),
                    eq(users.kind, "agent"),
                    eq(users.active, 1),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!agent) throw new CollaborationError("not_found", "Agent was not found");
        const inserted = await tx
            .insert(agentSecretAgentAssignments)
            .values({
                secretId: input.secretId,
                agentUserId: input.agentUserId,
                createdByUserId: input.actorUserId,
            })
            .onConflictDoNothing()
            .returning({
                secretId: agentSecretAgentAssignments.secretId,
            });
        if (!inserted.length) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.attachedToAgent",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.attached_to_agent",
            targetType: "user",
            targetId: input.agentUserId,
            after: {
                secretId: input.secretId,
            },
        });
        return areaHint(sequence, "agent-secrets");
    });
}
