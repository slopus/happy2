import type { ChatStoreBinding } from "../chat/chatStore.js";
import type { StateRuntime } from "../runtime/stateRuntime.js";
import type { SidebarStoreBinding } from "../sidebar/sidebarStore.js";
import type { SidebarChatProjection } from "../sidebar/sidebarTypes.js";
import type { ChatSummary } from "../../types.js";

export interface ChatActionContext {
    readonly runtime: StateRuntime;
    readonly sidebar: SidebarStoreBinding;
    chatGet(chatId: string): ChatStoreBinding | undefined;
    sidebarChatProject(chat: ChatSummary): Promise<SidebarChatProjection>;
}

export async function chatResultApply(
    context: ChatActionContext,
    chat: ChatSummary,
): Promise<void> {
    context.sidebar.sidebarInput({
        type: "chatSummaryUpserted",
        chat: await context.sidebarChatProject(chat),
    });
    context.chatGet(chat.id)?.chatInput({ type: "chatSummaryReconciled", chat });
}
