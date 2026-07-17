import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Changes sidebar starring durably and replaces only that chat summary in retained surfaces. */
export async function chatStarSet(
    context: ChatActionContext,
    chatId: string,
    starred: boolean,
): Promise<void> {
    const result = await context.runtime.operation("setChatStar", { chatId, starred });
    await chatResultApply(context, result.chat);
}
