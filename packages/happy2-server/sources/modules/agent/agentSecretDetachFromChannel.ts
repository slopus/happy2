import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentSecretChannelAssignments } from "../schema.js";
import { and, eq } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";

/**
 * Revokes a channel's secret grant by removing the selected agentSecretChannelAssignments relationship after authorization.
 * The shared audit and sync transition makes the loss of runtime access immediate and attributable to its administrator.
 */
export async function agentSecretDetachFromChannel(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        channelId: string;
        secretId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, input.actorUserId);
        const removed = await tx
            .delete(agentSecretChannelAssignments)
            .where(
                and(
                    eq(agentSecretChannelAssignments.secretId, input.secretId),
                    eq(agentSecretChannelAssignments.chatId, input.channelId),
                ),
            )
            .returning({
                secretId: agentSecretChannelAssignments.secretId,
            });
        if (!removed.length) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.detachedFromChannel",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.detached_from_channel",
            targetType: "chat",
            targetId: input.channelId,
            chatId: input.channelId,
            after: {
                secretId: input.secretId,
            },
        });
        return areaHint(sequence, "agent-secrets");
    });
}
