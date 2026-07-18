import { createMemo, createSignal, type Accessor } from "solid-js";
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

    const itemSlots = new Map<
        string,
        { readonly item: SidebarItem; update(value: DeepReadonly<SidebarChatProjection>): void }
    >();

    function item(projection: DeepReadonly<SidebarChatProjection>): SidebarItem {
        const existing = itemSlots.get(projection.id);
        if (existing) {
            existing.update(projection);
            return existing.item;
        }
        const [value, setValue] = createSignal(projection, { equals: false });
        const chat = () => value().chat;
        const peer = () => value().participants.find((person) => person.id !== options.user().id);
        const inactive = () => chat().id !== options.activeConversationId();
        const stable: SidebarItem = {
            get badge() {
                return inactive() && chat().mentionCount > 0 ? chat().mentionCount : undefined;
            },
            get id() {
                return chat().id;
            },
            get imageUrl() {
                return options.avatarFor(peer()?.id, value().avatarFileId);
            },
            get initials() {
                const person = peer();
                return person ? identityInitials(person) : value().displayName.slice(0, 2);
            },
            get kind() {
                return chat().kind !== "dm"
                    ? "channel"
                    : peer()?.kind === "agent"
                      ? "agent"
                      : "person";
            },
            get label() {
                return value().displayName;
            },
            get online() {
                const person = peer();
                return person?.kind === "human"
                    ? users().find((candidate) => candidate.id === person.id)?.presence === "online"
                    : undefined;
            },
            get tone() {
                return toneFor(peer()?.id ?? chat().id);
            },
            get unread() {
                return inactive() && chat().unreadCount > 0;
            },
        };
        itemSlots.set(projection.id, { item: stable, update: setValue });
        return stable;
    }

    const pinnedItems = createMemo<SidebarItem[]>(() =>
        chats()
            .filter((projection) => projection.chat.isPinnedHappy)
            .map(item),
    );
    const sections = createMemo<SidebarSection[]>(() => {
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
    return { chats, users, pinnedItems, sections, directoryItems, isServerAdmin };
}
