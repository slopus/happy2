import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings, agentTurns, portShares } from "../schema.js";

/**
 * Atomically moves one exact idle agent container's agentRigBindings and active portShares rows to a newly provisioned configuration generation.
 * Expected session and container identities provide the durable race guard beneath the process-local provisioning lock, while unfinished work prevents replacing an executing Rig session.
 */
export async function agentContainerCommitConfiguration(
    executor: DrizzleExecutor,
    input: {
        agentUserId: string;
        previousContainerName: string;
        replacements: Array<{
            chatId: string;
            containerName: string;
            previousSessionId: string;
            sessionId: string;
        }>;
    },
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        const current = await tx
            .select({
                chatId: agentRigBindings.chatId,
                containerName: agentRigBindings.containerName,
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(
                and(
                    eq(agentRigBindings.userId, input.agentUserId),
                    eq(agentRigBindings.containerName, input.previousContainerName),
                ),
            )
            .orderBy(agentRigBindings.chatId);
        if (
            current.length !== input.replacements.length ||
            current.some((binding, index) => {
                const replacement = input.replacements[index];
                return (
                    !replacement ||
                    replacement.chatId !== binding.chatId ||
                    replacement.previousSessionId !== binding.sessionId ||
                    binding.containerName !== input.previousContainerName
                );
            })
        )
            throw new CollaborationError(
                "conflict",
                "Agent container configuration changed concurrently",
            );
        const [unfinished] = await tx
            .select({ id: agentTurns.userMessageId })
            .from(agentTurns)
            .where(
                and(
                    inArray(
                        agentTurns.sessionId,
                        current.map(({ sessionId }) => sessionId),
                    ),
                    inArray(agentTurns.status, ["pending", "running"]),
                ),
            )
            .limit(1);
        if (unfinished)
            throw new CollaborationError(
                "conflict",
                "Agent container configuration cannot change while it has unfinished work",
            );
        for (const replacement of input.replacements) {
            const changed = await tx
                .update(agentRigBindings)
                .set({
                    containerName: replacement.containerName,
                    sessionId: replacement.sessionId,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentRigBindings.userId, input.agentUserId),
                        eq(agentRigBindings.chatId, replacement.chatId),
                        eq(agentRigBindings.containerName, input.previousContainerName),
                        eq(agentRigBindings.sessionId, replacement.previousSessionId),
                    ),
                )
                .returning({ id: agentRigBindings.sessionId });
            if (changed.length !== 1)
                throw new CollaborationError(
                    "conflict",
                    "Agent container configuration changed concurrently",
                );
        }
        const replacementContainerName = input.replacements[0]?.containerName;
        if (!replacementContainerName)
            throw new Error("Agent container replacement has no durable bindings");
        await tx
            .update(portShares)
            .set({ containerName: replacementContainerName })
            .where(
                and(
                    eq(portShares.containerName, input.previousContainerName),
                    isNull(portShares.disabledAt),
                ),
            );
    });
}
