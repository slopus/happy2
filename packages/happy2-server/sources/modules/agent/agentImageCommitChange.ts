import { CollaborationError, type MutationHint, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { agentImages, agentRigBindings, agentTurns, users } from "../schema.js";

import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";
import { asUser } from "../chat/asUser.js";

import { optionalText } from "../chat/optionalText.js";

import { userSelection } from "../chat/userSelection.js";

import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";

/**
 * Applies an assignImagesToChats-authorized change to the agent's users identity and affected agentRigBindings.
 * The shared commit keeps future runs, synchronized clients, and the audit trail aligned on the same effective image.
 */
export async function agentImageCommitChange(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        expectedImageId: string;
        imageId: string;
        replacements: Array<{
            chatId: string;
            containerName: string;
            cwd: string;
            previousContainerName: string;
            previousSessionId: string;
            sessionId: string;
        }>;
    },
): Promise<{
    user: UserSummary;
    sync?: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "assignImagesToChats");
        const [agent] = await tx
            .select(userSelection)
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
        const currentImageId = optionalText(agent.agent_image_id);
        if (currentImageId === input.imageId)
            return {
                user: asUser(agent),
            };
        if (currentImageId !== input.expectedImageId)
            throw new CollaborationError("conflict", "Agent image changed concurrently");
        const [image] = await tx
            .select({
                id: agentImages.id,
                status: agentImages.status,
                dockerImageId: agentImages.dockerImageId,
            })
            .from(agentImages)
            .where(and(eq(agentImages.id, input.imageId), isNull(agentImages.deletedAt)))
            .limit(1);
        if (!image) throw new CollaborationError("not_found", "Agent image was not found");
        if (image.status !== "ready" || !image.dockerImageId)
            throw new CollaborationError("conflict", "Agent image is not ready");
        const [unfinished] = await tx
            .select({
                id: agentTurns.userMessageId,
            })
            .from(agentTurns)
            .where(
                and(
                    eq(agentTurns.agentUserId, input.agentUserId),
                    inArray(agentTurns.status, ["pending", "running"]),
                ),
            )
            .limit(1);
        if (unfinished)
            throw new CollaborationError(
                "conflict",
                "Agent image cannot be changed while the agent has unfinished work",
            );
        const currentBindings = await tx
            .select({
                chatId: agentRigBindings.chatId,
                containerName: agentRigBindings.containerName,
                cwd: agentRigBindings.cwd,
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(eq(agentRigBindings.userId, input.agentUserId))
            .orderBy(agentRigBindings.chatId);
        if (
            currentBindings.length !== input.replacements.length ||
            currentBindings.some((binding, index) => {
                const replacement = input.replacements[index];
                return (
                    !replacement ||
                    replacement.chatId !== binding.chatId ||
                    replacement.cwd !== binding.cwd ||
                    replacement.previousContainerName !== binding.containerName ||
                    replacement.previousSessionId !== binding.sessionId
                );
            })
        )
            throw new CollaborationError("conflict", "Agent environment changed concurrently");
        const sequence = await syncSequenceNext(tx);
        for (const replacement of input.replacements) {
            const changed = await tx
                .update(agentRigBindings)
                .set({
                    imageId: input.imageId,
                    sessionId: replacement.sessionId,
                    containerName: replacement.containerName,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(agentRigBindings.userId, input.agentUserId),
                        eq(agentRigBindings.chatId, replacement.chatId),
                        eq(agentRigBindings.sessionId, replacement.previousSessionId),
                        eq(agentRigBindings.containerName, replacement.previousContainerName),
                        eq(agentRigBindings.imageId, input.expectedImageId),
                    ),
                )
                .returning({
                    id: agentRigBindings.sessionId,
                });
            if (changed.length !== 1)
                throw new CollaborationError("conflict", "Agent environment changed concurrently");
        }
        await tx
            .update(users)
            .set({
                agentImageId: input.imageId,
                syncSequence: sequence,
            })
            .where(
                and(eq(users.id, input.agentUserId), eq(users.agentImageId, input.expectedImageId)),
            );
        await syncEventInsert(tx, {
            sequence,
            kind: "user.updated",
            entityId: input.agentUserId,
            actorUserId: input.actorUserId,
        });
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "agent.image_changed",
            targetType: "user",
            targetId: input.agentUserId,
            after: {
                imageId: input.imageId,
            },
        });
        const [updated] = await tx
            .select(userSelection)
            .from(users)
            .where(eq(users.id, input.agentUserId));
        if (!updated) throw new Error("Updated agent is missing");
        return {
            user: asUser(updated),
            sync: areaHint(sequence, "users"),
        };
    });
}
