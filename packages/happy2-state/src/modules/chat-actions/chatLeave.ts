import type { ChatActionContext } from "./chatActionContext.js";
/** Leaves a chat durably and removes its sidebar projection without constructing another store. */
export async function chatLeave(context: ChatActionContext, chatId: string): Promise<void> {
    await context.runtime.operation("leaveChat", { chatId });
    context.sidebar.sidebarInput({ type: "chatSummaryRemoved", chatId });
}
