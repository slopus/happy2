import type { MessageActionContext } from "./messageActionContext.js";

/** Pins one message durably and refreshes pins only when that chat resource is materialized. */
export async function messagePin(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    await context.runtime.operation("pinMessage", { messageId });
    context.chatPinsReconcile(chatId);
}
