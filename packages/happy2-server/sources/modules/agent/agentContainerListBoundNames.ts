import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings, users } from "../schema.js";
import { and, eq, isNull } from "drizzle-orm";

/**
 * Lists distinct durable container bindings owned by active agents that startup must validate against the current runtime configuration generation.
 * Excluding inactive identities prevents startup repair from recreating their runtime sessions while returning only container identities keeps unrelated chat state out of orchestration.
 */
export async function agentContainerListBoundNames(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .selectDistinct({ containerName: agentRigBindings.containerName })
        .from(agentRigBindings)
        .innerJoin(users, eq(users.id, agentRigBindings.userId))
        .where(and(eq(users.kind, "agent"), eq(users.active, 1), isNull(users.deletedAt)))
        .orderBy(agentRigBindings.containerName);
    return rows.map(({ containerName }) => containerName);
}
