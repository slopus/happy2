import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Lists every live agent's Rig bindings with their chat override and agent-level default, ordered by agent and chat.
 * The projection lets restart reconciliation restore each session independently instead of broadcasting one agent preference to every conversation.
 */
export async function agentEffortBindingList(executor: DrizzleExecutor): Promise<
    Array<{
        agentUserId: string;
        chatId: string;
        defaultEffort?: string;
        effort?: string;
        sessionId: string;
    }>
> {
    return executor
        .select({
            agentUserId: agentRigBindings.userId,
            chatId: agentRigBindings.chatId,
            defaultEffort: users.agentEffort,
            effort: agentRigBindings.effort,
            sessionId: agentRigBindings.sessionId,
        })
        .from(agentRigBindings)
        .innerJoin(users, eq(users.id, agentRigBindings.userId))
        .where(and(eq(users.kind, "agent"), isNull(users.deletedAt)))
        .orderBy(agentRigBindings.userId, agentRigBindings.chatId)
        .then((rows) =>
            rows.map((row) => ({
                agentUserId: row.agentUserId,
                chatId: row.chatId,
                ...(row.defaultEffort ? { defaultEffort: row.defaultEffort } : {}),
                ...(row.effort ? { effort: row.effort } : {}),
                sessionId: row.sessionId,
            })),
        );
}
