import type {
    DeepReadonly,
    DirectorySnapshot,
    DirectoryUserProjection,
    SidebarChatProjection,
    SidebarSnapshot,
} from "happy2-state";
import type { MenuItem, SidebarItem, SidebarSection } from "./ChatPageComponents.js";
import { identityInitials, toneFor } from "./chatPageModels.js";
import type { ChatPageUser } from "./ChatPage.js";
export interface ChatSidebarModelOptions {
    user: () => ChatPageUser;
    activeConversationId: () => string;
    search: () => string;
    sidebarSnapshot: () => SidebarSnapshot;
    directorySnapshot: () => DirectorySnapshot;
    avatarFor(userId?: string, fallback?: string): string | undefined;
}
export function chatSidebarModelCreate(options: ChatSidebarModelOptions) {
    const chats = (): readonly DeepReadonly<SidebarChatProjection>[] =>
        options.sidebarSnapshot().chats;
    const users = (): readonly DeepReadonly<DirectoryUserProjection>[] =>
        options.directorySnapshot().users;
    function item(projection: DeepReadonly<SidebarChatProjection>): SidebarItem {
        const chat = projection.chat;
        const peer = projection.participants.find((person) => person.id !== options.user().id);
        const inactive = chat.id !== options.activeConversationId();
        return {
            badge: inactive && chat.mentionCount > 0 ? chat.mentionCount : undefined,
            id: chat.id,
            imageUrl: options.avatarFor(peer?.id, projection.avatarFileId),
            initials: peer ? identityInitials(peer) : projection.displayName.slice(0, 2),
            kind: chat.kind !== "dm" ? "channel" : peer?.kind === "agent" ? "agent" : "person",
            label: projection.displayName,
            online:
                peer?.kind === "human"
                    ? users().find((candidate) => candidate.id === peer.id)?.presence === "online"
                    : undefined,
            tone: toneFor(peer?.id ?? chat.id),
            unread: inactive && chat.unreadCount > 0,
        };
    }
    const pinnedItems = chats()
        .filter((projection) => projection.chat.isPinnedHappy)
        .map(item);
    const sections: SidebarSection[] = (() => {
        const needle = options.search().trim().toLowerCase();
        const projections = chats().filter(
            (projection) =>
                !projection.chat.isPinnedHappy &&
                (!needle || projection.displayName.toLowerCase().includes(needle)),
        );
        const ordered = (values: readonly DeepReadonly<SidebarChatProjection>[]) => [
            ...values.filter((projection) => projection.chat.starred),
            ...values.filter((projection) => !projection.chat.starred),
        ];
        return [
            {
                id: "channels",
                label: "Channels",
                action: { icon: "plus", label: "Add channel" },
                empty: { actionLabel: "Create", description: "No channels yet." },
                items: ordered(
                    projections.filter((projection) => projection.chat.kind !== "dm"),
                ).map(item),
            },
            {
                id: "dms",
                label: "Direct messages",
                action: { icon: "edit", label: "New message" },
                empty: { actionLabel: "Message", description: "No teammate chats yet." },
                items: ordered(
                    projections.filter(
                        (projection) =>
                            projection.chat.kind === "dm" &&
                            !projection.participants.some((person) => person.kind === "agent"),
                    ),
                ).map(item),
            },
            {
                id: "agents",
                label: "Agents",
                action: { icon: "plus", label: "New agent" },
                empty: { actionLabel: "New agent", description: "No agent chats yet." },
                items: ordered(
                    projections.filter(
                        (projection) =>
                            projection.chat.kind === "dm" &&
                            projection.participants.some((person) => person.kind === "agent"),
                    ),
                ).map(item),
            },
        ];
    })();
    const directoryItems: MenuItem[] = options
        .directorySnapshot()
        .channels.filter((chat) => !chat.membershipRole)
        .map((chat) => ({
            id: chat.id,
            icon: "hash",
            kind: "item",
            label: chat.name ?? chat.slug ?? "Untitled channel",
        }));
    const isServerAdmin = () =>
        users().find((person) => person.id === options.user().id)?.role === "admin";
    return { chats, users, pinnedItems, sections, directoryItems, isServerAdmin };
}
