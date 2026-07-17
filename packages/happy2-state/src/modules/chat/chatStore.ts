import { storeCreate } from "../../kernel/store.js";
import { chatInputApply } from "./chatInputApply.js";
import type { ChatInput, ChatOutput, ChatSnapshot, ChatStore } from "./chatTypes.js";

export interface ChatStoreBinding {
    readonly store: ChatStore;
    chatInput(event: ChatInput): void;
    dispose(): void;
}

/** Creates one on-demand conversation surface with coarse render subscription and typed output. */
export function chatStoreCreateBinding(
    chatId: string,
    output: (event: ChatOutput) => void = () => undefined,
): ChatStoreBinding {
    const { store: readonlyStore, writer } = storeCreate<ChatSnapshot>({
        chatId,
        status: { type: "unloaded" },
        messages: [],
        hasMoreMessages: false,
        members: { type: "unloaded" },
        pins: { type: "unloaded" },
        reactionActors: {},
        typing: [],
        agentActivity: [],
        agentEffort: {},
    });
    let disposed = false;
    const store: ChatStore = {
        ...readonlyStore,
        membersRetain(): void {
            if (disposed) return;
            const current = readonlyStore.get().members;
            if (current.type === "loading" || current.type === "ready") return;
            chatInputApply(writer, { type: "membersLoading" });
            output({ type: "membersRetained", chatId });
        },
        pinsRetain(): void {
            if (disposed) return;
            const current = readonlyStore.get().pins;
            if (current.type === "loading" || current.type === "ready") return;
            chatInputApply(writer, { type: "pinsLoading" });
            output({ type: "pinsRetained", chatId });
        },
        reactionActorsRetain(messageId, reactionKey): void {
            if (disposed) return;
            const key = `${messageId}\u0000${reactionKey}`;
            const current = readonlyStore.get().reactionActors[key];
            if (current?.type === "loading" || current?.type === "ready") return;
            chatInputApply(writer, { type: "reactionActorsLoading", messageId, reactionKey });
            output({ type: "reactionActorsRetained", chatId, messageId, reactionKey });
        },
        agentEffortRetain(agentUserId): void {
            if (disposed) return;
            const current = readonlyStore.get().agentEffort[agentUserId];
            if (current?.type === "loading" || current?.type === "ready") return;
            chatInputApply(writer, { type: "agentEffortLoading", agentUserId });
            output({ type: "agentEffortRetained", chatId, agentUserId });
        },
        agentEffortChange(agentUserId, effort): void {
            if (!disposed) output({ type: "agentEffortSubmitted", chatId, agentUserId, effort });
        },
    };
    return {
        store,
        chatInput: (event) => {
            if (!disposed) chatInputApply(writer, event);
        },
        dispose: () => {
            if (disposed) return;
            disposed = true;
            writer.dispose();
        },
    };
}
