import type { MenuItem } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
import { emojiItems, type LiveChatMessage } from "./chatPageModels.js";
export interface ChatMessageActionsModelOptions {
    userId: () => string;
    actions: ChatPageActions;
    onError(error: unknown): void;
    onEdit(message: LiveChatMessage): void;
}
export function chatMessageActionsModelCreate(options: ChatMessageActionsModelOptions) {
    async function reactionToggle(message: LiveChatMessage, emoji: string) {
        const source = message.serverMessage;
        if (!source) return;
        const resolved = emojiItems.find((item) => item.id === emoji)?.char ?? emoji;
        const selected = source.reactions.some(
            (reaction) => reaction.emoji === resolved && reaction.reacted,
        );
        try {
            if (selected) await options.actions.reactionRemove(source.chatId, source.id, resolved);
            else await options.actions.reactionAdd(source.chatId, source.id, resolved);
        } catch (error) {
            options.onError(error);
        }
    }
    function menuItems(message: LiveChatMessage): MenuItem[] {
        const source = message.serverMessage;
        if (!source || source.deletedAt) return [];
        const own = source.sender?.id === options.userId();
        return [
            { icon: "doc", id: "copy", kind: "item", label: "Copy text" },
            ...(own
                ? ([
                      { icon: "edit", id: "edit", kind: "item", label: "Edit message" },
                      { kind: "separator" },
                      {
                          danger: true,
                          icon: "close",
                          id: "delete",
                          kind: "item",
                          label: "Delete message",
                      },
                  ] satisfies MenuItem[])
                : []),
        ];
    }
    async function menuSelect(message: LiveChatMessage, action: string) {
        const source = message.serverMessage;
        if (!source) return;
        try {
            if (action === "copy") return void (await navigator.clipboard?.writeText(source.text));
            if (source.sender?.id !== options.userId()) return;
            if (action === "edit") return options.onEdit(message);
            if (action === "delete" && window.confirm("Delete this message?"))
                await options.actions.messageDelete(source.chatId, source.id);
        } catch (error) {
            options.onError(error);
        }
    }
    return { menuItems, menuSelect, reactionToggle };
}
