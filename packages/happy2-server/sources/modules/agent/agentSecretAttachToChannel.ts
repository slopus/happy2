import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentSecretChannelAssignments, chats } from "../schema.js";
import { and, eq, inArray, isNull } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Grants a secret to an eligible channel through agentSecretChannelAssignments after requiring assignSecrets permission.
 * The assignment, audit entry, and sync event commit together so the resulting credential exposure is never silent or partially reported.
 */
export async function agentSecretAttachToChannel(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        channelId: string;
        secretId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "assignSecrets");
        const [channel] = await tx
            .select({
                id: chats.id,
            })
            .from(chats)
            .where(
                and(
                    eq(chats.id, input.channelId),
                    inArray(chats.kind, ["public_channel", "private_channel"]),
                    isNull(chats.deletedAt),
                ),
            )
            .limit(1);
        if (!channel) throw new CollaborationError("not_found", "Channel was not found");
        const inserted = await tx
            .insert(agentSecretChannelAssignments)
            .values({
                secretId: input.secretId,
                chatId: input.channelId,
                createdByUserId: input.actorUserId,
            })
            .onConflictDoNothing()
            .returning({
                secretId: agentSecretChannelAssignments.secretId,
            });
        if (!inserted.length) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentSecret.attachedToChannel",
            entityId: input.secretId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent_secret.attached_to_channel",
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
