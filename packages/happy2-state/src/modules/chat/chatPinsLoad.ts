import { userError } from "../runtime/stateRuntime.js";
import { messageProject } from "./messageProject.js";
import type { ChatLoadContext } from "./chatLoad.js";

/** Loads render-ready pinned messages only after the retained chat surface requests them. */
export async function chatPinsLoad(context: ChatLoadContext, chatId: string): Promise<void> {
    const chat = context.chatGet(chatId);
    if (!chat || !context.runtime.connected) return;
    chat.chatInput({ type: "pinsLoading" });
    try {
        const result = await context.runtime.operation("getChatPins", { chatId });
        const current = context.chatGet(chatId);
        if (!current) return;
        current.chatInput({
            type: "pinsLoaded",
            pins: result.pins.map((pin) => ({
                ...pin,
                message: messageProject(context.identities, pin.message),
            })),
        });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({ type: "pinsFailed", error: userError(error) });
    }
}
