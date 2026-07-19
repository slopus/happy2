import { type AgentSecretAssignment } from "./impl/agentSecretAssignment.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { agentSecretAgentAssignments, agentSecretChannelAssignments } from "../schema.js";

import { userRequireAnyPermission } from "../permission/userRequireAnyPermission.js";
/**
 * Groups secret assignments for a caller allowed to manage secrets or assign them to agents and channels.
 * Sorting both source rows and the merged result gives management clients stable agent and channel membership lists for each secret.
 */
export async function agentSecretAssignmentList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<AgentSecretAssignment[]> {
    await userRequireAnyPermission(executor, actorUserId, ["manageSecrets", "assignSecrets"]);
    const [agentRows, channelRows] = await Promise.all([
        executor
            .select({
                secretId: agentSecretAgentAssignments.secretId,
                agentUserId: agentSecretAgentAssignments.agentUserId,
            })
            .from(agentSecretAgentAssignments)
            .orderBy(agentSecretAgentAssignments.secretId, agentSecretAgentAssignments.agentUserId),
        executor
            .select({
                secretId: agentSecretChannelAssignments.secretId,
                channelId: agentSecretChannelAssignments.chatId,
            })
            .from(agentSecretChannelAssignments)
            .orderBy(agentSecretChannelAssignments.secretId, agentSecretChannelAssignments.chatId),
    ]);
    const assignments = new Map<string, AgentSecretAssignment>();
    const get = (secretId: string) => {
        let assignment = assignments.get(secretId);
        if (!assignment) {
            assignment = {
                secretId,
                agentUserIds: [],
                channelIds: [],
            };
            assignments.set(secretId, assignment);
        }
        return assignment;
    };
    for (const row of agentRows) get(row.secretId).agentUserIds.push(row.agentUserId);
    for (const row of channelRows) get(row.secretId).channelIds.push(row.channelId);
    return [...assignments.values()].sort((left, right) =>
        left.secretId.localeCompare(right.secretId),
    );
}
