import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings, chatMembers, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

import { chatGetAccess } from "../chat/chatGetAccess.js";

/**
 * Reassigns an agentRigBindings row only after the requested agent, rig, and chat relationship has been validated.
 * Keeping validation and the binding write together prevents workers from attaching a run to a stale or unrelated conversation.
 */
export async function agentChatBind(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        agentUserId: string;
        chatId: string;
        containerName: string;
        cwd: string;
        imageId: string;
        sessionId: string;
    },
): Promise<{
    containerName: string;
    cwd: string;
    sessionId: string;
}> {
    return withTransaction(executor, async (tx) => {
        const access = await chatGetAccess(tx, input.actorUserId, input.chatId, true);
        if (!access || access.kind !== "dm" || access.dmType !== "direct")
            throw new CollaborationError("not_found", "Agent direct message was not found");
        const [agent] = await tx
            .select({
                id: users.id,
            })
            .from(users)
            .innerJoin(
                chatMembers,
                and(
                    eq(chatMembers.userId, users.id),
                    eq(chatMembers.chatId, input.chatId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(
                and(
                    eq(users.id, input.agentUserId),
                    eq(users.kind, "agent"),
                    eq(users.agentImageId, input.imageId),
                    isNull(users.deletedAt),
                ),
            )
            .limit(1);
        if (!agent) throw new CollaborationError("not_found", "Agent direct message was not found");
        await tx
            .insert(agentRigBindings)
            .values({
                userId: input.agentUserId,
                chatId: input.chatId,
                imageId: input.imageId,
                sessionId: input.sessionId,
                containerName: input.containerName,
                cwd: input.cwd,
            })
            .onConflictDoNothing();
        const [binding] = await tx
            .select({
                agentUserId: agentRigBindings.userId,
                containerName: agentRigBindings.containerName,
                cwd: agentRigBindings.cwd,
                imageId: agentRigBindings.imageId,
                sessionId: agentRigBindings.sessionId,
            })
            .from(agentRigBindings)
            .where(
                and(
                    eq(agentRigBindings.userId, input.agentUserId),
                    eq(agentRigBindings.chatId, input.chatId),
                ),
            )
            .limit(1);
        if (!binding) throw new Error("Agent chat binding was not created");
        if (binding.imageId !== input.imageId)
            throw new Error("Agent chat binding uses a different image");
        return {
            containerName: binding.containerName,
            cwd: binding.cwd,
            sessionId: binding.sessionId,
        };
    });
}
