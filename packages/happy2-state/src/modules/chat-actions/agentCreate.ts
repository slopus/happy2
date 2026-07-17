import type { CreateAgentInput } from "../../types.js";
import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Creates an agent conversation idempotently and publishes its authoritative summary. */
export async function agentCreate(
    context: ChatActionContext,
    input: CreateAgentInput,
): Promise<void> {
    const result = await context.runtime.operation("createAgent", input);
    await chatResultApply(context, result.chat);
}
