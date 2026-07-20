import { type ChatSummary, CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages, chatMembers, chats, users } from "../schema.js";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";
import { chatAdvanceWithSequence } from "./chatAdvanceWithSequence.js";
import { chatRequireManager } from "./chatRequireManager.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { chatDescendantIds } from "./impl/chatDescendantIds.js";

/**
 * Assigns one ready executable agent by updating chats, chatMembers, and chatUpdates after channel-manager authorization.
 * Keeping assignment, membership, channel history, and sync in one transaction prevents routing a turn to an inaccessible agent.
 */
export async function channelDefaultAgentUpdate(
    executor: DrizzleExecutor,
    input: { actorUserId: string; chatId: string; agentUserId: string },
): Promise<{ chat: ChatSummary; hint: MutationHint }> {
    return withTransaction(executor, async (tx) => {
        const access = await chatRequireManager(tx, input.actorUserId, input.chatId);
        if (access.kind === "dm")
            throw new CollaborationError("invalid", "Direct messages do not have a default agent");
        if (access.parentChatId)
            throw new CollaborationError(
                "invalid",
                "Child channels inherit the parent channel's default agent",
            );
        const [agent] = await tx
            .select({ id: users.id })
            .from(users)
            .innerJoin(agentImages, eq(agentImages.id, users.agentImageId))
            .where(
                and(
                    eq(users.id, input.agentUserId),
                    eq(users.kind, "agent"),
                    isNull(users.deletedAt),
                    eq(agentImages.status, "ready"),
                    sql`${agentImages.dockerImageId} IS NOT NULL`,
                ),
            )
            .limit(1);
        if (!agent) throw new CollaborationError("not_found", "Executable agent was not found");
        if (access.defaultAgentUserId === input.agentUserId)
            throw new CollaborationError("conflict", "Agent is already the channel default");
        const sequence = await syncSequenceNext(tx);
        const descendantIds = await chatDescendantIds(tx, input.chatId);
        const affectedChatIds = [input.chatId, ...descendantIds];
        for (const chatId of affectedChatIds)
            await tx
                .insert(chatMembers)
                .values({
                    chatId,
                    userId: input.agentUserId,
                    role: "member",
                    membershipEpoch: createId(),
                    syncSequence: sequence,
                })
                .onConflictDoUpdate({
                    target: [chatMembers.chatId, chatMembers.userId],
                    set: {
                        membershipEpoch: sql`CASE WHEN ${chatMembers.leftAt} IS NULL THEN ${chatMembers.membershipEpoch} ELSE ${createId()} END`,
                        joinedAt: sql`CASE WHEN ${chatMembers.leftAt} IS NULL THEN ${chatMembers.joinedAt} ELSE CURRENT_TIMESTAMP END`,
                        leftAt: null,
                        removedByUserId: null,
                        syncSequence: sequence,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    },
                });
        const mutations = [];
        for (const chatId of affectedChatIds)
            mutations.push(
                await chatAdvanceWithSequence(
                    tx,
                    sequence,
                    input.actorUserId,
                    chatId,
                    "chat.defaultAgentUpdated",
                    input.agentUserId,
                ),
            );
        await tx
            .update(chats)
            .set({
                defaultAgentUserId: input.agentUserId,
                lifecycleVersion: sql`${chats.lifecycleVersion} + 1`,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(inArray(chats.id, affectedChatIds));
        const chat = await chatRequireManager(tx, input.actorUserId, input.chatId);
        return {
            chat,
            hint: {
                sequence: String(sequence),
                chats: mutations.map((mutation) => ({
                    chatId: mutation.chatId,
                    pts: String(mutation.pts),
                })),
                areas: [],
            },
        };
    });
}
