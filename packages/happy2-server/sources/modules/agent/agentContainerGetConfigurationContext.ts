import { and, eq, inArray, isNull } from "drizzle-orm";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages, agentRigBindings, agentTurns, chats, users } from "../schema.js";

export interface AgentContainerConfigurationContext {
    agentDefaultEffort?: string;
    agentUserId: string;
    bindings: Array<{
        agentModelId?: string;
        chatId: string;
        cwd: string;
        effort?: string;
        sessionId: string;
    }>;
    hasUnfinishedWork: boolean;
    image: {
        dockerImageId: string;
        dockerTag: string;
        id: string;
    };
}

/**
 * Resolves every durable binding, ready image identity, and unfinished-work guard for one exact agent container.
 * Grouping shared parent/child bindings here lets orchestration replace one sandbox and all of its Rig sessions as a single compare-and-swap operation.
 */
export async function agentContainerGetConfigurationContext(
    executor: DrizzleExecutor,
    containerName: string,
): Promise<AgentContainerConfigurationContext | undefined> {
    const rows = await executor
        .select({
            agentUserId: agentRigBindings.userId,
            agentDefaultEffort: users.agentEffort,
            agentModelId: chats.agentModelId,
            chatId: agentRigBindings.chatId,
            cwd: agentRigBindings.cwd,
            dockerImageId: agentImages.dockerImageId,
            dockerTag: agentImages.dockerTag,
            effort: agentRigBindings.effort,
            imageId: agentImages.id,
            sessionId: agentRigBindings.sessionId,
        })
        .from(agentRigBindings)
        .innerJoin(users, eq(users.id, agentRigBindings.userId))
        .innerJoin(agentImages, eq(agentImages.id, agentRigBindings.imageId))
        .innerJoin(chats, eq(chats.id, agentRigBindings.chatId))
        .where(
            and(
                eq(agentRigBindings.containerName, containerName),
                eq(users.kind, "agent"),
                isNull(users.deletedAt),
                eq(agentImages.status, "ready"),
                isNull(agentImages.deletedAt),
            ),
        )
        .orderBy(agentRigBindings.chatId);
    const first = rows[0];
    if (!first) return undefined;
    if (!first.dockerImageId) throw new Error("Bound agent image has no Docker image identity");
    if (
        rows.some(
            (row) =>
                row.agentUserId !== first.agentUserId ||
                row.imageId !== first.imageId ||
                row.dockerImageId !== first.dockerImageId,
        )
    )
        throw new CollaborationError(
            "conflict",
            "Agent container has inconsistent durable bindings",
        );
    const sessionIds = rows.map(({ sessionId }) => sessionId);
    const [unfinished] = await executor
        .select({ id: agentTurns.userMessageId })
        .from(agentTurns)
        .where(
            and(
                inArray(agentTurns.sessionId, sessionIds),
                inArray(agentTurns.status, ["pending", "running"]),
            ),
        )
        .limit(1);
    return {
        ...(first.agentDefaultEffort ? { agentDefaultEffort: first.agentDefaultEffort } : {}),
        agentUserId: first.agentUserId,
        bindings: rows.map((row) => ({
            ...(row.agentModelId ? { agentModelId: row.agentModelId } : {}),
            chatId: row.chatId,
            cwd: row.cwd,
            ...(row.effort ? { effort: row.effort } : {}),
            sessionId: row.sessionId,
        })),
        hasUnfinishedWork: Boolean(unfinished),
        image: {
            dockerImageId: first.dockerImageId,
            dockerTag: first.dockerTag,
            id: first.imageId,
        },
    };
}
