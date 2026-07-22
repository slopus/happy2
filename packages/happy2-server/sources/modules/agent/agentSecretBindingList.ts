import { type AgentSecretBinding } from "./impl/agentSecretBinding.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, inArray, isNull, type SQL } from "drizzle-orm";
import {
    agentRigBindings,
    agentSecretAgentAssignments,
    agentSecretChannelAssignments,
    chatMembers,
    users,
} from "../schema.js";

/**
 * Projects optional agent or chat Rig bindings with the union of direct-agent secrets and channel secrets available to an active agent member.
 * Excluding channel grants after membership ends prevents a retained runtime binding from continuing to inherit chat-scoped credentials.
 */
export async function agentSecretBindingList(
    executor: DrizzleExecutor,
    input: {
        agentUserId?: string;
        chatId?: string;
    } = {},
): Promise<AgentSecretBinding[]> {
    const conditions = [
        input.agentUserId ? eq(agentRigBindings.userId, input.agentUserId) : undefined,
        input.chatId ? eq(agentRigBindings.chatId, input.chatId) : undefined,
    ].filter((condition): condition is SQL => condition !== undefined);
    const bindings = await executor
        .select({
            agentUserId: agentRigBindings.userId,
            chatId: agentRigBindings.chatId,
            sessionId: agentRigBindings.sessionId,
            activeMemberUserId: chatMembers.userId,
        })
        .from(agentRigBindings)
        .innerJoin(users, eq(users.id, agentRigBindings.userId))
        .leftJoin(
            chatMembers,
            and(
                eq(chatMembers.chatId, agentRigBindings.chatId),
                eq(chatMembers.userId, agentRigBindings.userId),
                isNull(chatMembers.leftAt),
            ),
        )
        .where(
            and(
                eq(users.kind, "agent"),
                eq(users.active, 1),
                isNull(users.deletedAt),
                ...conditions,
            ),
        )
        .orderBy(agentRigBindings.userId, agentRigBindings.chatId);
    if (!bindings.length) return [];
    const agentUserIds = [...new Set(bindings.map((binding) => binding.agentUserId))];
    const chatIds = [...new Set(bindings.map((binding) => binding.chatId))];
    const [agentRows, channelRows] = await Promise.all([
        executor
            .select({
                secretId: agentSecretAgentAssignments.secretId,
                agentUserId: agentSecretAgentAssignments.agentUserId,
            })
            .from(agentSecretAgentAssignments)
            .where(inArray(agentSecretAgentAssignments.agentUserId, agentUserIds)),
        executor
            .select({
                secretId: agentSecretChannelAssignments.secretId,
                chatId: agentSecretChannelAssignments.chatId,
            })
            .from(agentSecretChannelAssignments)
            .where(inArray(agentSecretChannelAssignments.chatId, chatIds)),
    ]);
    const agentSecrets = new Map<string, Set<string>>();
    const channelSecrets = new Map<string, Set<string>>();
    for (const row of agentRows) {
        const ids = agentSecrets.get(row.agentUserId) ?? new Set<string>();
        ids.add(row.secretId);
        agentSecrets.set(row.agentUserId, ids);
    }
    for (const row of channelRows) {
        const ids = channelSecrets.get(row.chatId) ?? new Set<string>();
        ids.add(row.secretId);
        channelSecrets.set(row.chatId, ids);
    }
    return bindings.map((binding) => ({
        agentUserId: binding.agentUserId,
        chatId: binding.chatId,
        sessionId: binding.sessionId,
        secretIds: [
            ...new Set([
                ...(agentSecrets.get(binding.agentUserId) ?? []),
                ...(binding.activeMemberUserId ? (channelSecrets.get(binding.chatId) ?? []) : []),
            ]),
        ].sort(),
    }));
}
