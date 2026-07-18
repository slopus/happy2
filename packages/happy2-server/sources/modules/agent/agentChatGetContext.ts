import { type AgentChatContext } from "./impl/agentChatContext.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages, agentRigBindings, chatMembers, users } from "../schema.js";

import { and, eq, isNull } from "drizzle-orm";

import { chatGetAccess } from "../chat/chatGetAccess.js";

/**
 * Resolves one executable agent inside an accessible direct message or channel, including its stable conversation sandbox scope and optional Rig binding.
 * Rejecting inactive or unready identities here keeps session creation tied to a concrete agent-conversation authorization boundary.
 */
export async function agentChatGetContext(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
    requestedAgentUserId?: string,
): Promise<AgentChatContext | undefined> {
    const access = await chatGetAccess(executor, actorUserId, chatId, true);
    if (!access || access.dmType === "group") return undefined;
    const [agent] = await executor
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
                requestedAgentUserId ? eq(users.id, requestedAgentUserId) : undefined,
            ),
        )
        .orderBy(users.id)
        .limit(1);
    if (!agent || agent.imageStatus !== "ready" || !agent.dockerImageId) return undefined;
    if (access.kind === "dm") {
        if (access.dmType !== "direct") return undefined;
        const activeAgentCount = await executor
            .select({ id: users.id })
            .from(chatMembers)
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    isNull(chatMembers.leftAt),
                    isNull(users.deletedAt),
                    eq(users.kind, "agent"),
                ),
            );
        if (activeAgentCount.length !== 1) return undefined;
    } else if (!requestedAgentUserId) return undefined;
    const [human] =
        access.kind === "dm"
            ? await executor
                  .select({ userId: users.id })
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
            : [];
    if (access.kind === "dm" && !human) return undefined;
    const [bound] = await executor
        .select({
            containerName: agentRigBindings.containerName,
            cwd: agentRigBindings.cwd,
            sessionId: agentRigBindings.sessionId,
        })
        .from(agentRigBindings)
        .where(
            and(
                eq(agentRigBindings.userId, agent.userId),
                eq(agentRigBindings.chatId, chatId),
                eq(agentRigBindings.imageId, agent.imageId),
            ),
        )
        .limit(1);
    return {
        agentUserId: agent.userId,
        ...(agent.effort ? { agentEffort: agent.effort } : {}),
        chatId,
        image: {
            id: agent.imageId,
            dockerImageId: agent.dockerImageId,
            dockerTag: agent.dockerTag,
        },
        sandboxScope: {
            kind: access.kind === "dm" ? "users" : "chats",
            id: human?.userId ?? chatId,
            ...(access.kind === "dm" ? { conversationId: chatId } : {}),
        },
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
