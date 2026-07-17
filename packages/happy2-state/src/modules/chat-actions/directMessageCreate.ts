import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Creates or resolves one direct conversation and publishes its authoritative sidebar summary. */
export async function directMessageCreate(
    context: ChatActionContext,
    userId: string,
): Promise<void> {
    const result = await context.runtime.operation("createDirectMessage", { userId });
    await chatResultApply(context, result.chat);
}
