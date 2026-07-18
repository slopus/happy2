import { createMemo, type Accessor } from "solid-js";
import type {
    DeepReadonly,
    DirectoryStore,
    DirectoryUserProjection,
    SidebarChatProjection,
    SidebarStore,
} from "happy2-state";
import type { MenuItem, SidebarItem, SidebarSection } from "./ChatPageComponents.js";
import { identityInitials, toneFor } from "./chatPageModels.js";
import type { ChatPageUser } from "./ChatPage.js";

export interface ChatSidebarModelOptions {
    user: Accessor<ChatPageUser>;
    activeConversationId: Accessor<string>;
    search: Accessor<string>;
    sidebarSnapshot: Accessor<ReturnType<SidebarStore["get"]>>;
    directorySnapshot: Accessor<ReturnType<DirectoryStore["get"]>>;
    avatarFor(userId?: string, fallback?: string): string | undefined;
}

export function chatSidebarModelCreate(options: ChatSidebarModelOptions) {
    const chats = (): readonly DeepReadonly<SidebarChatProjection>[] =>
        options.sidebarSnapshot().chats;
    const users = (): readonly DeepReadonly<DirectoryUserProjection>[] =>
        options.directorySnapshot().users;

    function item(projection: DeepReadonly<SidebarChatProjection>): SidebarItem {
        const chat = projection.chat;
        if (chat.kind !== "dm")
            return {
                id: chat.id,
                kind: "channel",
                label: projection.displayName,
                badge: chat.id === options.activeConversationId() ? 0 : chat.unreadCount,
            };
        const peer = projection.participants.find((person) => person.id !== options.user().id);
        return {
            id: chat.id,
            kind: peer?.kind === "agent" ? "agent" : "person",
            label: projection.displayName,
            initials: peer ? identityInitials(peer) : projection.displayName.slice(0, 2),
            tone: toneFor(peer?.id ?? chat.id),
            imageUrl: options.avatarFor(peer?.id, projection.avatarFileId),
            badge: chat.id === options.activeConversationId() ? 0 : chat.unreadCount,
            online:
                peer?.kind === "human"
                    ? users().find((person) => person.id === peer.id)?.presence === "online"
                    : undefined,
        };
    }

    const sections = createMemo<SidebarSection[]>(() => {
        const needle = options.search().trim().toLowerCase();
        const projections = chats().filter(
            (projection) => !needle || projection.displayName.toLowerCase().includes(needle),
        );
        const starred = projections.filter((projection) => projection.chat.starred);
        const normal = projections.filter((projection) => !projection.chat.starred);
        return [
            ...(starred.length
                ? [{ id: "starred", label: "Starred", items: starred.map(item) }]
                : []),
            {
                id: "agents",
                label: "Agents",
                action: { icon: "plus", label: "New agent" },
                items: normal
                    .filter(
                        (projection) =>
                            projection.chat.kind === "dm" &&
                            projection.participants.some((person) => person.kind === "agent"),
                    )
                    .map(item),
            },
            {
                id: "channels",
                label: "Channels",
                action: { icon: "plus", label: "Add channel" },
                items: normal.filter((projection) => projection.chat.kind !== "dm").map(item),
            },
            {
                id: "dms",
                label: "Direct messages",
                action: { icon: "edit", label: "New message" },
                items: normal
                    .filter(
                        (projection) =>
                            projection.chat.kind === "dm" &&
                            !projection.participants.some((person) => person.kind === "agent"),
                    )
                    .map(item),
            },
        ];
    });

    const directoryItems = createMemo<MenuItem[]>(() =>
        options
            .directorySnapshot()
            .channels.filter((chat) => !chat.membershipRole)
            .map((chat) => ({
                id: chat.id,
                icon: "hash",
                kind: "item",
                label: chat.name ?? chat.slug ?? "Untitled channel",
            })),
    );
    const isServerAdmin = () =>
        users().find((person) => person.id === options.user().id)?.role === "admin";
    return { chats, users, sections, directoryItems, isServerAdmin };
}
