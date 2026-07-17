import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Creates one group conversation and publishes its authoritative sidebar summary. */
export async function groupDirectMessageCreate(
    context: ChatActionContext,
    userIds: readonly string[],
    name?: string,
): Promise<void> {
    const result = await context.runtime.operation("createGroupDirectMessage", { userIds, name });
    await chatResultApply(context, result.chat);
}
