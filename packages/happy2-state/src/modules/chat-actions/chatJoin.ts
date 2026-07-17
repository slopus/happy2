import type { ChatActionContext } from "./chatActionContext.js";
import { chatResultApply } from "./chatActionContext.js";
/** Joins a discoverable chat and inserts its authoritative summary into the sidebar surface. */
export async function chatJoin(context: ChatActionContext, chatId: string): Promise<void> {
    const result = await context.runtime.operation("joinChat", { chatId });
    await chatResultApply(context, result.chat);
}
