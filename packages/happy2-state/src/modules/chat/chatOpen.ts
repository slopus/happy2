import type { ChatStoreBinding } from "./chatStore.js";
import type { ChatHandle } from "./chatTypes.js";

export interface ChatOpenContext {
    chatAcquire(chatId: string): ChatStoreBinding;
    chatRelease(chatId: string): void;
    chatLoad(chatId: string): void;
}

/** Acquires one keyed chat surface and starts loading only when its payload is still unloaded. */
export function chatOpen(context: ChatOpenContext, chatId: string): ChatHandle {
    const binding = context.chatAcquire(chatId);
    if (binding.store.get().status.type === "unloaded") context.chatLoad(chatId);
    let released = false;
    return {
        ...binding.store,
        [Symbol.dispose]: () => {
            if (released) return;
            released = true;
            context.chatRelease(chatId);
        },
    };
}
