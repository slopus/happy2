import type {
    DeepReadonly,
    DirectorySnapshot,
    DirectoryUserProjection,
    SidebarChatProjection,
    SidebarSnapshot,
} from "happy2-state";
import type { ChannelDirectoryItem, SidebarItem, SidebarSection } from "./ChatPageComponents.js";
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
            // Private channels carry the lock glyph; shared channels keep the
            // Sidebar's default hash for the channel kind.
            icon: chat.kind === "private_channel" ? "lock" : undefined,
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
     * Orders one project's public and private channels so each child renders
     * directly under its parent, one indent level deeper. A child whose parent
     * is absent from this filtered projection stays reachable as a top-level row
     * rather than disappearing.
     */
    function channelItems(
        projections: readonly DeepReadonly<SidebarChatProjection>[],
        projectId: string,
        ordered: (
            values: readonly DeepReadonly<SidebarChatProjection>[],
        ) => DeepReadonly<SidebarChatProjection>[],
    ): SidebarItem[] {
        const channels = projections.filter(
            (projection) =>
                projection.chat.kind !== "dm" && projection.chat.projectId === projectId,
        );
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
                id: "projects",
                label: "Projects",
                headingOnly: true,
                action: { icon: "plus", label: "New project" },
                items: [],
            },
            ...options.sidebarSnapshot().projects.map((project) => ({
                id: `project:${project.id}`,
                label: project.name,
                action: { icon: "plus" as const, label: `Add channel to ${project.name}` },
                empty: {
                    actionLabel: "Create channel",
                    description: needle ? "No matching channels." : "No channels are visible here.",
                },
                items: channelItems(projections, project.id, ordered),
            })),
            {
                id: "browse",
                label: "Discover channels",
                headingOnly: true,
                action: { icon: "search", label: "Browse channels" },
                items: [],
            },
            {
                id: "dms",
                label: "Humans",
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
    const directoryChannels = (): readonly ChannelDirectoryItem[] => {
        const directory = options.directorySnapshot().channels;
        const byId = new Map(directory.map((chat) => [chat.id, chat]));
        const projectsById = new Map(
            options.sidebarSnapshot().projects.map((project) => [project.id, project]),
        );
        for (const projection of chats()) byId.set(projection.chat.id, projection.chat);
        return directory
            .filter(
                (chat) =>
                    !chat.membershipRole && chat.kind !== "dm" && chat.archivedAt === undefined,
            )
            .map((chat) => {
                const parent = chat.parentChatId ? byId.get(chat.parentChatId) : undefined;
                return {
                    id: chat.id,
                    name: chat.name ?? chat.slug ?? "Untitled channel",
                    visibility: chat.kind === "public_channel" ? "public" : "private",
                    ...(chat.projectId && projectsById.get(chat.projectId)
                        ? { projectName: projectsById.get(chat.projectId)!.name }
                        : {}),
                    ...(parent
                        ? { parentName: parent.name ?? parent.slug ?? "Untitled channel" }
                        : {}),
                } satisfies ChannelDirectoryItem;
            });
    };
    const isServerAdmin = () =>
        users().find((person) => person.id === options.user().id)?.role === "admin";
    return { chats, users, sections, directoryChannels, isServerAdmin };
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
