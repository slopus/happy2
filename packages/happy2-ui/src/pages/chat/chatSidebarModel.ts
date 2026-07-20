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
    function item(projection: DeepReadonly<SidebarChatProjection>, depth = 0): SidebarItem {
        const chat = projection.chat;
        const peer = projection.participants.find((person) => person.id !== options.user().id);
        const agentConversation = isAgentConversation(projection);
        const inactive = chat.id !== options.activeConversationId();
        return {
            archived: chat.archivedAt !== undefined ? true : undefined,
            badge: inactive && chat.mentionCount > 0 ? chat.mentionCount : undefined,
            depth: depth > 0 ? depth : undefined,
            id: chat.id,
            imageUrl: options.avatarFor(peer?.id, projection.avatarFileId),
            initials: peer ? identityInitials(peer) : projection.displayName.slice(0, 2),
            kind: chat.kind !== "dm" ? "channel" : agentConversation ? "agent" : "person",
            label: projection.displayName,
            online:
                peer?.kind === "human"
                    ? users().find((candidate) => candidate.id === peer.id)?.presence === "online"
                    : undefined,
            tone: toneFor(peer?.id ?? chat.id),
            unread: inactive && chat.unreadCount > 0,
        };
    }
    /**
     * Orders channels so each child renders directly under its parent, one indent
     * level deeper. A child whose parent is absent from the current (searched)
     * projection set stays reachable as a top-level row rather than disappearing.
     */
    function channelItems(
        projections: readonly DeepReadonly<SidebarChatProjection>[],
        ordered: (
            values: readonly DeepReadonly<SidebarChatProjection>[],
        ) => DeepReadonly<SidebarChatProjection>[],
    ): SidebarItem[] {
        const channels = projections.filter((projection) => projection.chat.kind !== "dm");
        const present = new Set(channels.map((projection) => projection.chat.id));
        const childrenByParent = new Map<string, DeepReadonly<SidebarChatProjection>[]>();
        const roots: DeepReadonly<SidebarChatProjection>[] = [];
        for (const projection of channels) {
            const parentId = projection.chat.parentChatId;
            if (parentId !== undefined && present.has(parentId)) {
                const bucket = childrenByParent.get(parentId) ?? [];
                bucket.push(projection);
                childrenByParent.set(parentId, bucket);
            } else roots.push(projection);
        }
        const items: SidebarItem[] = [];
        for (const root of ordered(roots)) {
            items.push(item(root, 0));
            for (const childProjection of ordered(childrenByParent.get(root.chat.id) ?? []))
                items.push(item(childProjection, 1));
        }
        return items;
    }
    /**
     * Keeps every composed agent conversation directly under the server-managed
     * main conversation. If search removes that main row, matching conversations
     * stay reachable at the top level instead of appearing as orphaned children.
     */
    function agentItems(
        projections: readonly DeepReadonly<SidebarChatProjection>[],
        ordered: (
            values: readonly DeepReadonly<SidebarChatProjection>[],
        ) => DeepReadonly<SidebarChatProjection>[],
    ): SidebarItem[] {
        const agents = projections.filter(
            (projection) => projection.chat.kind === "dm" && isAgentConversation(projection),
        );
        const main = agents.find((projection) => projection.chat.isDefaultAgentConversation);
        if (!main) return ordered(agents).map((projection) => item(projection));
        return [
            item(main),
            ...ordered(agents.filter((projection) => projection.id !== main.id)).map((projection) =>
                item(projection, 1),
            ),
        ];
    }
    const sections: SidebarSection[] = (() => {
        const needle = options.search().trim().toLowerCase();
        const projections = chats().filter(
            (projection) => !needle || projection.displayName.toLowerCase().includes(needle),
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
                items: channelItems(projections, ordered),
            },
            {
                id: "dms",
                label: "Direct messages",
                action: { icon: "edit", label: "New message" },
                empty: { actionLabel: "Message", description: "No teammate chats yet." },
                items: ordered(
                    projections.filter(
                        (projection) =>
                            projection.chat.kind === "dm" && !isAgentConversation(projection),
                    ),
                ).map(item),
            },
            {
                id: "agents",
                label: "Agents",
                action: { icon: "plus", label: "New agent" },
                empty: { actionLabel: "New agent", description: "No agent chats yet." },
                items: agentItems(projections, ordered),
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
    return { chats, users, sections, directoryItems, isServerAdmin };
}

/**
 * Classifies ordinary agent DMs from their projected participants. The durable
 * default-conversation marker is used only when that projection is unavailable,
 * so a transient member request failure cannot move the required row into the
 * human-DM section; it never creates a privileged position or ordering rule.
 */
function isAgentConversation(projection: DeepReadonly<SidebarChatProjection>): boolean {
    return (
        projection.participants.some((person) => person.kind === "agent") ||
        projection.chat.isDefaultAgentConversation
    );
}
