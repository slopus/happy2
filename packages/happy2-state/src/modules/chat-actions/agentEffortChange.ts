import { userError } from "../runtime/stateRuntime.js";
import type { ChatActionContext } from "./chatActionContext.js";

/** Changes one agent's durable reasoning effort and reconciles the retained chat control. */
export async function agentEffortChange(
    context: ChatActionContext,
    chatId: string,
    agentUserId: string,
    effort: string,
): Promise<void> {
    try {
        const value = await context.runtime.operation("changeAgentEffort", { agentUserId, effort });
        context.chatGet(chatId)?.chatInput({ type: "agentEffortLoaded", value });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({
            type: "agentEffortFailed",
            agentUserId,
            error: userError(error),
        });
    }
}
