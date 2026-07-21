import { type DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";

/**
 * Lists the distinct durable agent container bindings that startup must validate against the current runtime configuration generation.
 * This read boundary deliberately returns only container identities so lifecycle orchestration can inspect and repair them without loading unrelated chat state.
 */
export async function agentContainerListBoundNames(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .selectDistinct({ containerName: agentRigBindings.containerName })
        .from(agentRigBindings)
        .orderBy(agentRigBindings.containerName);
    return rows.map(({ containerName }) => containerName);
}
