import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";
import { and, eq } from "drizzle-orm";

import { agentChatGetContext } from "./agentChatGetContext.js";

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
        effort: string;
        imageId: string;
        sessionId: string;
    },
): Promise<{
    containerName: string;
    cwd: string;
    sessionId: string;
}> {
    return withTransaction(executor, async (tx) => {
        const context = await agentChatGetContext(
            tx,
            input.actorUserId,
            input.chatId,
            input.agentUserId,
        );
        if (!context || context.image.id !== input.imageId)
            throw new CollaborationError("not_found", "Agent conversation was not found");
        await tx
            .insert(agentRigBindings)
            .values({
                userId: input.agentUserId,
                chatId: input.chatId,
                imageId: input.imageId,
                sessionId: input.sessionId,
                containerName: input.containerName,
                cwd: input.cwd,
                effort: input.effort,
            })
            .onConflictDoNothing();
        const [binding] = await tx
            .select({
                agentUserId: agentRigBindings.userId,
                containerName: agentRigBindings.containerName,
                cwd: agentRigBindings.cwd,
                effort: agentRigBindings.effort,
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
        if (!binding.effort) throw new Error("Agent chat binding effort is missing");
        return {
            containerName: binding.containerName,
            cwd: binding.cwd,
            sessionId: binding.sessionId,
        };
    });
}
