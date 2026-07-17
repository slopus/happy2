import type { ChatActionContext } from "./chatActionContext.js";

/** Sends ephemeral typing intent in the background; realtime expiry remains the display authority. */
export function typingSet(context: ChatActionContext, chatId: string, active: boolean): void {
    if (!context.runtime.connected || !context.runtime.active) return;
    context.runtime.background(
        context.runtime.operation("setTyping", { chatId, active }).then(() => undefined),
    );
}
