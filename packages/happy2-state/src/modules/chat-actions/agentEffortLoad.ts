import { userError } from "../runtime/stateRuntime.js";
import type { ChatActionContext } from "./chatActionContext.js";

/** Loads effort controls only for an already retained chat and requested agent. */
export async function agentEffortLoad(
    context: ChatActionContext,
    chatId: string,
    agentUserId: string,
): Promise<void> {
    try {
        const value = await context.runtime.operation("getAgentEffort", { agentUserId });
        context.chatGet(chatId)?.chatInput({ type: "agentEffortLoaded", value });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({
            type: "agentEffortFailed",
            agentUserId,
            error: userError(error),
        });
    }
}
