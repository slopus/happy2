import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Lists every Rig session bound to a non-deleted agent together with that agent's optional reasoning effort, ordered by agent and chat.
 * The deterministic projection lets runtime reconciliation update sessions without loading deleted identities or depending on database row order.
 */
export async function agentEffortBindingList(executor: DrizzleExecutor): Promise<
    Array<{
        agentUserId: string;
        effort?: string;
        sessionId: string;
    }>
> {
    return executor
        .select({
            agentUserId: agentRigBindings.userId,
            effort: users.agentEffort,
            sessionId: agentRigBindings.sessionId,
        })
        .from(agentRigBindings)
        .innerJoin(users, eq(users.id, agentRigBindings.userId))
        .where(and(eq(users.kind, "agent"), isNull(users.deletedAt)))
        .orderBy(agentRigBindings.userId, agentRigBindings.chatId)
        .then((rows) =>
            rows.map((row) => ({
                agentUserId: row.agentUserId,
                ...(row.effort
                    ? {
                          effort: row.effort,
                      }
                    : {}),
                sessionId: row.sessionId,
            })),
        );
}
