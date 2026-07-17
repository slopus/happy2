import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Marks a chat read through a displayably fallible awaited action and reconciles retained surfaces. */
export async function chatReadMark(
    context: ChatActionContext,
    chatId: string,
    messageId?: string,
): Promise<void> {
    const result = await context.runtime.operation("markChatRead", { chatId, messageId });
    await chatResultApply(context, result.chat);
}
