import { eq } from "drizzle-orm";
import { dirname, join } from "node:path";
import type { DrizzleExecutor } from "../drizzle.js";
import { agentRigBindings } from "../schema.js";

/** Derives one session's host-mounted isolated home from its durable Rig binding cwd and does not mutate durable state. This boundary centralizes the sandbox layout contract used by plugin skill reconciliation. */
export async function agentSkillHomeGet(
    executor: DrizzleExecutor,
    sessionId: string,
): Promise<string> {
    const [binding] = await executor
        .select({ cwd: agentRigBindings.cwd })
        .from(agentRigBindings)
        .where(eq(agentRigBindings.sessionId, sessionId))
        .limit(1);
    if (!binding) throw new Error("Agent Rig binding was not found for skill reconciliation");
    return join(dirname(binding.cwd), "home");
}
