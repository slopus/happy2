import type { ChatSummary, DeepReadonly, SidebarChatProjection } from "happy2-state";
import type { MenuItem } from "./ChatPageComponents.js";
import type { ChatPageActions } from "./ChatPage.js";
export interface ChatChannelModelOptions {
    activeChatId: () => string;
    activeChat: () => DeepReadonly<ChatSummary> | undefined;
    sidebarChats: () => readonly DeepReadonly<SidebarChatProjection>[];
    canEdit: () => boolean;
    actions: ChatPageActions;
    onInfoOpen(): void;
    onLeave(): void;
    onArchived(): void;
    onError(error: unknown): void;
}
export function chatChannelModelCreate(options: ChatChannelModelOptions) {
    const starred = () =>
        options.sidebarChats().find((projection) => projection.id === options.activeChatId())?.chat
            .starred ?? false;
    async function join() {
        await options.actions.chatJoin(options.activeChatId()).catch(options.onError);
    }
    async function leave() {
        const id = options.activeChatId();
        options.onLeave();
        await options.actions.chatLeave(id).catch(options.onError);
    }
    function starToggle() {
        const id = options.activeChatId();
        if (id) void options.actions.chatStarSet(id, !starred()).catch(options.onError);
    }
    function menuItems(): MenuItem[] {
        const chat = options.activeChat();
        return [
            { icon: "eye", id: "details", kind: "item", label: "View details" },
            {
                icon: "star",
                id: "star",
                kind: "item",
                label: starred() ? "Unstar" : "Star channel",
            },
            ...(options.canEdit()
                ? ([
                      {
                          icon: "settings" as const,
                          id: "edit",
                          kind: "item" as const,
                          label: "Edit settings",
                      },
                      ...(chat && !chat.isMain
                          ? [
                                {
                                    icon: "files" as const,
                                    id: chat.archivedAt ? "restore" : "archive",
                                    kind: "item" as const,
                                    label: chat.archivedAt ? "Restore chat" : "Archive chat",
                                },
                            ]
                          : []),
                  ] satisfies MenuItem[])
                : []),
            ...(chat?.kind !== "dm" && chat?.membershipRole && !chat.isMain
                ? ([
                      { kind: "separator" },
                      {
                          danger: true,
                          icon: "close",
                          id: "leave",
                          kind: "item",
                          label: "Leave channel",
                      },
                  ] satisfies MenuItem[])
                : []),
        ];
    }
    function menuSelect(id: string) {
        if (id === "details" || id === "edit") options.onInfoOpen();
        if (id === "star") starToggle();
        if (id === "leave") void leave();
        if (id === "archive")
            void options.actions
                .chatArchive(options.activeChatId())
                .then(options.onArchived)
                .catch(options.onError);
        if (id === "restore")
            void options.actions.chatRestore(options.activeChatId()).catch(options.onError);
    }
    return { join, menuItems, menuSelect, starred, starToggle };
}
