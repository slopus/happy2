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
    onChildCreate(parentChatId: string): void;
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
    // Whether the active channel currently reads as archived (its own archive or,
    // for a child, a parent archive the server cascaded onto its summary).
    const effectiveArchived = () => options.activeChat()?.archivedAt !== undefined;
    // A child whose parent is archived is archived only by inheritance; the server
    // rejects independently unarchiving it, so we hide that action rather than error.
    const parentArchived = () => {
        const parentId = options.activeChat()?.parentChatId;
        if (parentId === undefined) return false;
        return (
            options.sidebarChats().find((projection) => projection.id === parentId)?.chat
                .archivedAt !== undefined
        );
    };
    async function archiveSet(archived: boolean) {
        const id = options.activeChatId();
        if (!id) return;
        await (
            archived ? options.actions.channelArchive(id) : options.actions.channelUnarchive(id)
        ).catch(options.onError);
    }
    function menuItems(): MenuItem[] {
        const chat = options.activeChat();
        const manageable = chat?.kind !== "dm" && chat?.membershipRole && !chat.isMain;
        const edit: MenuItem[] = options.canEdit()
            ? [{ icon: "settings", id: "edit", kind: "item", label: "Edit settings" }]
            : [];
        // Child channels require a top-level parent, so the affordance is offered
        // only on manageable, non-archived, non-child channels.
        const child: MenuItem[] =
            options.canEdit() && manageable && !chat?.parentChatId && !effectiveArchived()
                ? [{ icon: "branch", id: "child", kind: "item", label: "Create subchannel" }]
                : [];
        const archive: MenuItem[] =
            options.canEdit() && manageable
                ? effectiveArchived()
                    ? parentArchived()
                        ? []
                        : [
                              {
                                  icon: "inbox",
                                  id: "unarchive",
                                  kind: "item",
                                  label: "Unarchive channel",
                              },
                          ]
                    : [{ icon: "inbox", id: "archive", kind: "item", label: "Archive channel" }]
                : [];
        const leave: MenuItem[] = manageable
            ? [
                  {
                      danger: true,
                      icon: "close",
                      id: "leave",
                      kind: "item",
                      label: "Leave channel",
                  },
              ]
            : [];
        const groups = [edit, child, archive, leave].filter((group) => group.length > 0);
        return groups.flatMap((group, index) =>
            index === 0 ? group : [{ kind: "separator" }, ...group],
        );
    }
    function menuSelect(id: string) {
        if (id === "details" || id === "edit") options.onInfoOpen();
        if (id === "star") starToggle();
        if (id === "child") options.onChildCreate(options.activeChatId());
        if (id === "archive") void archiveSet(true);
        if (id === "unarchive") void archiveSet(false);
        if (id === "leave") void leave();
    }
    return { join, menuItems, menuSelect, starred, starToggle };
}
