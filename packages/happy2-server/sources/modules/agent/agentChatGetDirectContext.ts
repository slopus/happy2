import { type AgentChatContext } from "./impl/agentChatContext.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages, agentRigBindings, chatMembers, users } from "../schema.js";

import { and, eq, isNull } from "drizzle-orm";

import { chatGetAccess } from "../chat/chatGetAccess.js";
/**
 * Resolves a member's direct DM to one non-system agent with a ready executable image, one human participant, and any existing Rig binding.
 * Returning no context for other chat shapes or incomplete images prevents workers from starting against an ambiguous identity or unusable container image.
 */
export async function agentChatGetDirectContext(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<AgentChatContext | undefined> {
    const access = await chatGetAccess(executor, userId, chatId, true);
    if (!access || access.kind !== "dm" || access.dmType !== "direct") return undefined;
    const [agent, human] = await Promise.all([
        executor
            .select({
                userId: users.id,
                effort: users.agentEffort,
                imageId: agentImages.id,
                dockerTag: agentImages.dockerTag,
                dockerImageId: agentImages.dockerImageId,
                imageStatus: agentImages.status,
            })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .innerJoin(agentImages, eq(agentImages.id, users.agentImageId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    isNull(chatMembers.leftAt),
                    isNull(users.deletedAt),
                    eq(users.kind, "agent"),
                    isNull(users.systemRole),
                ),
            )
            .orderBy(users.id)
            .limit(1)
            .then((rows) => rows[0]),
        executor
            .select({
                userId: users.id,
            })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    isNull(chatMembers.leftAt),
                    isNull(users.deletedAt),
                    eq(users.kind, "human"),
                ),
            )
            .orderBy(users.id)
            .limit(1)
            .then((rows) => rows[0]),
    ]);
    if (!agent || !human || agent.imageStatus !== "ready" || !agent.dockerImageId) return undefined;
    const [bound] = await executor
        .select({
            containerName: agentRigBindings.containerName,
            cwd: agentRigBindings.cwd,
            sessionId: agentRigBindings.sessionId,
        })
        .from(agentRigBindings)
        .where(and(eq(agentRigBindings.userId, agent.userId), eq(agentRigBindings.chatId, chatId)))
        .limit(1);
    return {
        agentUserId: agent.userId,
        ...(agent.effort
            ? {
                  agentEffort: agent.effort,
              }
            : {}),
        chatId,
        image: {
            id: agent.imageId,
            dockerImageId: agent.dockerImageId,
            dockerTag: agent.dockerTag,
        },
        privateUserId: human.userId,
        ...(bound
            ? {
                  binding: {
                      containerName: bound.containerName,
                      cwd: bound.cwd,
                      sessionId: bound.sessionId,
                  },
              }
            : {}),
    };
}
