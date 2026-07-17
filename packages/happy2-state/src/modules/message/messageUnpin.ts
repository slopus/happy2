import type { MessageActionContext } from "./messageActionContext.js";

/** Unpins one message durably and refreshes pins only when that chat resource is materialized. */
export async function messageUnpin(
    context: MessageActionContext,
    chatId: string,
    messageId: string,
): Promise<void> {
    await context.runtime.operation("unpinMessage", { messageId });
    context.chatPinsReconcile(chatId);
}
