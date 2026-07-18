import { CollaborationError, type UserSummary } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { agentImages, agentRigBindings, agentTurns, users } from "../schema.js";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { asUser } from "../chat/asUser.js";

import { optionalText } from "../chat/optionalText.js";
import { userSelection } from "../chat/userSelection.js";

import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
/**
 * Validates an administrator-requested image change against a live agent, a ready target image, all Rig bindings, and unfinished turns.
 * Rejecting a different image while work is pending prevents the later mutation from switching the execution substrate beneath an active turn.
 */
export async function agentImageGetChangeContext(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        imageId: string;
    },
): Promise<{
    bindings: Array<{
        chatId: string;
        containerName: string;
        cwd: string;
        sessionId: string;
    }>;
    currentImageId: string;
    image: {
        dockerImageId: string;
        dockerTag: string;
        id: string;
    };
    user: UserSummary;
}> {
    await userRequireServerAdmin(executor, input.actorUserId);
    const [agent, image, bindings, unfinished] = await Promise.all([
        executor
            .select(userSelection)
            .from(users)
            .where(
                and(
                    eq(users.id, input.agentUserId),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1)
            .then((rows) => rows[0]),
        executor
            .select({
                id: agentImages.id,
                dockerImageId: agentImages.dockerImageId,
                dockerTag: agentImages.dockerTag,
                status: agentImages.status,
            })
            .from(agentImages)
            .where(eq(agentImages.id, input.imageId))
            .limit(1)
            .then((rows) => rows[0]),
        executor
            .select({
                chatId: agentRigBindings.chatId,
                containerName: agentRigBindings.containerName,
                cwd: agentRigBindings.cwd,
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(eq(agentRigBindings.userId, input.agentUserId))
            .orderBy(agentRigBindings.chatId),
        executor
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
            .limit(1)
            .then((rows) => rows[0]),
    ]);
    if (!agent) throw new CollaborationError("not_found", "Agent was not found");
    const currentImageId = optionalText(agent.agent_image_id);
    if (!currentImageId) throw new Error("Agent image assignment is missing");
    if (!image) throw new CollaborationError("not_found", "Agent image was not found");
    if (image.status !== "ready" || !image.dockerImageId)
        throw new CollaborationError("conflict", "Agent image is not ready");
    if (unfinished && currentImageId !== image.id)
        throw new CollaborationError(
            "conflict",
            "Agent image cannot be changed while the agent has unfinished work",
        );
    return {
        bindings,
        currentImageId,
        image: {
            id: image.id,
            dockerImageId: image.dockerImageId,
            dockerTag: image.dockerTag,
        },
        user: asUser(agent),
    };
}
