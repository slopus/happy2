import type { CreateChannelInput } from "../../types.js";
import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Creates a channel with one idempotency key and publishes its authoritative sidebar summary. */
export async function channelCreate(
    context: ChatActionContext,
    input: CreateChannelInput,
): Promise<void> {
    const result = await context.runtime.operation("createChannel", input);
    await chatResultApply(context, result.chat);
}
