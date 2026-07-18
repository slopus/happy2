import { type DrizzleTransaction } from "../drizzle.js";
import { agentTurnPrompt } from "./impl/agentTurnPrompt.js";

/**
 * Builds one bounded immutable channel prompt from durable messages and messageAgentAudiences history for an agent turn that the caller is committing.
 * Keeping the projection behind the agent module preserves one reviewed prompt boundary while the surrounding message transaction owns all durable writes.
 */
export async function agentTurnPromptBuild(
    executor: DrizzleTransaction,
    input: Parameters<typeof agentTurnPrompt>[1],
): Promise<string> {
    return agentTurnPrompt(executor, input);
}
