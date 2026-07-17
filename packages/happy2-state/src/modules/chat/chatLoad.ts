import type { ChatStoreBinding } from "./chatStore.js";
import { messageItemProject } from "./messageProject.js";
import type { IdentityCatalog } from "../identity/identityCatalog.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import { userError } from "../runtime/stateRuntime.js";

export interface ChatLoadContext {
    readonly runtime: StateRuntime;
    readonly identities: IdentityCatalog;
    chatGet(chatId: string): ChatStoreBinding | undefined;
}

/** Loads one already materialized chat without creating a store for an absent consumer. */
export async function chatLoad(context: ChatLoadContext, chatId: string): Promise<void> {
    const binding = context.chatGet(chatId);
    if (!binding || !context.runtime.connected) return;
    binding.chatInput({ type: "chatLoading" });
    try {
        const [chatResult, messagesResult] = await Promise.all([
            context.runtime.operation("getChat", { chatId }),
            context.runtime.operation("getMessages", { chatId, limit: 100 }),
        ]);
        const current = context.chatGet(chatId);
        if (!current || !context.runtime.active) return;
        current.chatInput({
            type: "chatLoaded",
            chat: chatResult.chat,
            messages: messagesResult.messages.map((message) =>
                messageItemProject(context.identities, message),
            ),
            hasMoreMessages: messagesResult.hasMore,
        });
    } catch (error) {
        context.chatGet(chatId)?.chatInput({ type: "chatFailed", error: userError(error) });
    }
}
