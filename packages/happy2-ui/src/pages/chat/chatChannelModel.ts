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
    // Details and starring have dedicated header buttons beside the menu, so
    // the menu holds only the actions with no other affordance; an empty list
    // means the host should not render a menu at all.
    function menuItems(): MenuItem[] {
        const chat = options.activeChat();
        const edit: MenuItem[] = options.canEdit()
            ? [{ icon: "settings", id: "edit", kind: "item", label: "Edit settings" }]
            : [];
        const leave: MenuItem[] =
            chat?.kind !== "dm" && chat?.membershipRole && !chat.isMain
                ? [
                      ...(edit.length ? ([{ kind: "separator" }] satisfies MenuItem[]) : []),
                      {
                          danger: true,
                          icon: "close",
                          id: "leave",
                          kind: "item",
                          label: "Leave channel",
                      },
                  ]
                : [];
        return [...edit, ...leave];
    }
    function menuSelect(id: string) {
        if (id === "details" || id === "edit") options.onInfoOpen();
        if (id === "star") starToggle();
        if (id === "leave") void leave();
    }
    return { join, menuItems, menuSelect, starred, starToggle };
}
