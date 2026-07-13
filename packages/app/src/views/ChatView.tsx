import {
    createEffect,
    createMemo,
    createSignal,
    For,
    Match,
    onCleanup,
    onMount,
    Show,
    Switch,
    type JSX,
} from "solid-js";
import {
    AgentDesk,
    AgentRunCard,
    AppShell,
    ApprovalCard,
    Box,
    Button,
    ChannelHeader,
    Composer,
    DayDivider,
    DiffSnippet,
    EmptyState,
    EventCard,
    FileAttachment,
    FormRow,
    InfoPanel,
    Lightbox,
    Message,
    MessageList,
    Menu,
    Modal,
    Select,
    Sidebar,
    TextField,
    ThreadPanel,
    type ApprovalResolution,
    type ContextItem,
    type InfoPanelProfile,
    type MemberItem,
    type MemberRole,
    type MenuItem,
    type MessageImage,
    type SidebarSection,
    type SelectOption,
    type ToneName,
} from "rigged-ui";
import type {
    ChatSummary,
    FileSummary,
    MessageSummary,
    PresenceSnapshot,
    UploadedFile,
    UserSummary,
} from "rigged-state";
import { type AuthSession } from "../components/AuthGate";
import {
    chatSections,
    composerHint,
    conversations,
    deskDone,
    deskQueued,
    deskRunning,
    emojiItems,
    initialEntries,
    mentionableAgents,
    type Conversation,
    type ThreadDivider,
    type ThreadMessage,
} from "../mockData";

export type ChatViewProps = {
    platform?: "desktop" | "web";
    session?: AuthSession;
    /** Shared TitleBar search value, owned by the App shell. */
    search: () => string;
    /** Monotonic nonce from the rail "+" action that opens the create dialog. */
    createRequest?: () => number;
    /** App-owned navigation rail element. */
    rail: JSX.Element;
    /** App-owned title bar element (carries the shared search field). */
    titleBar: JSX.Element;
};

type LiveThreadMessage = ThreadMessage & { serverMessage?: MessageSummary };
type WorkspaceEntry = ThreadDivider | LiveThreadMessage;

const asDivider = (entry: WorkspaceEntry): ThreadDivider | undefined =>
    entry.kind === "divider" ? entry : undefined;
const asMessage = (entry: WorkspaceEntry): LiveThreadMessage | undefined =>
    entry.kind === "message" ? entry : undefined;

const tones: ToneName[] = ["violet", "ember", "mint", "ocean", "rose", "amber", "slate"];
/* Friendly names for the mock (no-server) roster, keyed by avatar initials. */
const mockMemberNames: Record<string, string> = {
    MC: "Maya Chen",
    TG: "Theo Grant",
    NK: "Nora Kim",
    ST: "Steve",
    F: "Forge",
    P: "Patch",
    S: "Scout",
};
const channelKindOptions: SelectOption[] = [
    { value: "public_channel", label: "Public channel" },
    { value: "private_channel", label: "Private channel" },
];
const overlayStyle: JSX.CSSProperties = {
    position: "absolute",
    inset: 0,
    display: "flex",
    "align-items": "center",
    "justify-content": "center",
    padding: "24px",
    "z-index": 30,
};
const modalStackStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
};
const modalActionsStyle: JSX.CSSProperties = {
    display: "flex",
    "align-items": "center",
    gap: "8px",
};
const panelFooterStyle: JSX.CSSProperties = {
    display: "flex",
    "justify-content": "flex-end",
    gap: "8px",
    "padding-top": "4px",
};
/* The channel edit form is one block in the InfoPanel body; the FormRows carry
   their own dividers and padding, so the container just stacks them. */
const infoFormStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
};

function toneFor(id: string): ToneName {
    let hash = 0;
    for (const character of id) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
    return tones[hash % tones.length]!;
}

function fullName(user: Pick<UserSummary, "firstName" | "lastName">): string {
    return [user.firstName, user.lastName].filter(Boolean).join(" ");
}

function initials(user: Pick<UserSummary, "firstName" | "lastName">): string {
    return `${user.firstName[0] ?? ""}${user.lastName?.[0] ?? ""}`.toUpperCase();
}

function messageTime(value: string): string {
    return new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(
        new Date(value),
    );
}

/* The grouped gutter is only 36px wide, so drop the meridiem: "12:55 AM" → "12:55".
   Locale-aware (keeps the locale's hour/minute), just without " AM"/" PM". */
function compactTime(value: string): string {
    const parts = new Intl.DateTimeFormat(undefined, {
        hour: "numeric",
        minute: "2-digit",
    }).formatToParts(new Date(value));
    const hour = parts.find((part) => part.type === "hour")?.value;
    const minute = parts.find((part) => part.type === "minute")?.value;
    return hour && minute ? `${hour}:${minute}` : messageTime(value);
}

function dayLabel(value: string): string {
    const date = new Date(value);
    const now = new Date();
    if (date.toDateString() === now.toDateString()) return "Today";
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);
    if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
    return new Intl.DateTimeFormat(undefined, {
        month: "long",
        day: "numeric",
        year: date.getFullYear() === now.getFullYear() ? undefined : "numeric",
    }).format(date);
}

function toThreadMessage(
    message: MessageSummary,
    currentUser?: Pick<UserSummary, "id" | "firstName" | "lastName">,
): LiveThreadMessage {
    const sender =
        message.sender ??
        (message.id.startsWith("local:") && currentUser ? currentUser : undefined);
    const deleted = Boolean(message.deletedAt);
    return {
        kind: "message",
        id: message.id,
        conversationId: message.chatId,
        author: sender ? fullName(sender) : "Rigged",
        initials: sender ? initials(sender) : "R",
        tone: sender ? toneFor(sender.id) : "brand",
        agent: message.kind === "automated",
        time: messageTime(message.createdAt),
        gutterTime: compactTime(message.createdAt),
        body: deleted ? "Message deleted" : message.text,
        replyCount: message.threadReplyCount || undefined,
        reactions: message.reactions
            .map((reaction) => ({
                active: reaction.reacted,
                count: reaction.count,
                emoji: reaction.emoji ?? (reaction.customEmojiId ? `:${reaction.key}:` : ""),
            }))
            .filter((reaction) => reaction.emoji.length > 0),
        serverMessage: message,
    };
}

function toEntries(
    messages: readonly MessageSummary[],
    currentUser?: Pick<UserSummary, "id" | "firstName" | "lastName">,
): WorkspaceEntry[] {
    const result: WorkspaceEntry[] = [];
    let previousDay = "";
    for (const message of messages) {
        const date = new Date(message.createdAt).toDateString();
        if (date !== previousDay) {
            result.push({
                kind: "divider",
                id: `day-${date}`,
                conversationId: message.chatId,
                label: dayLabel(message.createdAt),
            });
            previousDay = date;
        }
        result.push(toThreadMessage(message, currentUser));
    }
    return result;
}

function groupedWithPrevious(entries: WorkspaceEntry[], index: number, message: LiveThreadMessage) {
    const previous = entries[index - 1];
    return previous?.kind === "message" && previous.author === message.author;
}

export function ChatView(props: ChatViewProps) {
    const connected = Boolean(props.session);
    const [activeConversationId, setActiveConversationId] = createSignal(
        connected ? "" : "launch-week",
    );
    const [draft, setDraft] = createSignal("");
    const [entries, setEntries] = createSignal<WorkspaceEntry[]>(connected ? [] : initialEntries);
    const [sidebar, setSidebar] = createSignal<SidebarSection[]>(connected ? [] : chatSections);
    const [conversationData, setConversationData] = createSignal<Record<string, Conversation>>(
        connected ? {} : conversations,
    );
    const [serverChats, setServerChats] = createSignal<ChatSummary[]>([]);
    const [contacts, setContacts] = createSignal<UserSummary[]>([]);
    const [dmPeers, setDmPeers] = createSignal<Record<string, UserSummary>>({});
    const [presence, setPresence] = createSignal<Record<string, PresenceSnapshot>>({});
    const [threadRootId, setThreadRootId] = createSignal<string>();
    const [threadEntries, setThreadEntries] = createSignal<WorkspaceEntry[]>([]);
    const [threadDraft, setThreadDraft] = createSignal("");
    const [panelMode, setPanelMode] = createSignal<"info" | "thread">();
    const [panelMembers, setPanelMembers] = createSignal<MemberItem[]>([]);
    const [starredChats, setStarredChats] = createSignal<Record<string, boolean>>({});
    const [lightbox, setLightbox] = createSignal<{
        caption?: string;
        detail?: string;
        url: string;
    }>();
    const [fileUrls, setFileUrls] = createSignal<Record<string, string>>({});
    const [pendingFiles, setPendingFiles] = createSignal<UploadedFile[]>([]);
    const [busyCount, setBusyCount] = createSignal(0);
    const [statusHint, setStatusHint] = createSignal<string>();
    const [typingUser, setTypingUser] = createSignal<{ chatId: string; userId: string }>();
    const [expandedRuns, setExpandedRuns] = createSignal<Record<string, boolean>>({});
    const [expandedApprovals, setExpandedApprovals] = createSignal<Record<string, boolean>>({});
    const [approvalResolutions, setApprovalResolutions] = createSignal<
        Record<string, ApprovalResolution>
    >({});
    const [toggledReactions, setToggledReactions] = createSignal<Record<string, boolean>>({});
    const [createOpen, setCreateOpen] = createSignal(false);
    const [directoryOpen, setDirectoryOpen] = createSignal(false);
    const [manualEmptySelection, setManualEmptySelection] = createSignal(false);
    const [channelNameDraft, setChannelNameDraft] = createSignal("");
    const [channelTopicDraft, setChannelTopicDraft] = createSignal("");
    const [newChannelName, setNewChannelName] = createSignal("");
    const [newChannelSlug, setNewChannelSlug] = createSignal("");
    const [channelSlugEdited, setChannelSlugEdited] = createSignal(false);
    const [newChannelKind, setNewChannelKind] = createSignal<"public_channel" | "private_channel">(
        "public_channel",
    );
    let fileInput: HTMLInputElement | undefined;
    let requestNumber = 0;
    let workspaceRequestNumber = 0;
    const stateCleanups: Array<() => void> = [];
    let sentTyping = false;

    const busy = () => busyCount() > 0;
    const startBusy = () => setBusyCount((count) => count + 1);
    const finishBusy = () => setBusyCount((count) => Math.max(0, count - 1));

    const user = () => props.session?.user;
    const state = () => props.session?.state;
    const userName = () => user()?.firstName ?? "Steve";
    const userInitials = () => user()?.firstName.slice(0, 2).toUpperCase() ?? "ST";
    const activeChat = () => serverChats().find((chat) => chat.id === activeConversationId());
    const directoryChannels = () =>
        serverChats().filter((chat) => chat.kind !== "dm" && !chat.membershipRole);
    const directoryItems = createMemo<MenuItem[]>(() =>
        directoryChannels().map((chat) => ({
            id: chat.id,
            icon: "hash",
            kind: "item",
            label: chat.name ?? chat.slug ?? "Untitled channel",
        })),
    );
    const canEditChannel = () => {
        const role = activeChat()?.membershipRole;
        return role === "owner" || role === "admin";
    };
    const threadRoot = () =>
        threadEntries().find((entry): entry is LiveThreadMessage => entry.kind === "message");
    const mentionCandidates = () =>
        connected
            ? contacts().map((contact) => ({
                  id: contact.id,
                  initials: initials(contact),
                  name: fullName(contact),
                  tone: toneFor(contact.id),
              }))
            : mentionableAgents;
    const conversation = () =>
        conversationData()[activeConversationId()] ?? {
            id: "empty",
            title: connected ? "Your Rigged" : "launch-week",
            topic: connected ? "Create a channel or select a person to start chatting" : undefined,
            composerPlaceholder: "Message Rigged…",
            intro: connected
                ? {
                      title: "No conversation selected",
                      description: "Create a channel or choose a teammate from the sidebar.",
                  }
                : undefined,
        };
    const conversationEntries = () =>
        entries().filter((entry) => entry.conversationId === activeConversationId());
    const filteredSidebar = createMemo(() => {
        const needle = props.search().trim().toLowerCase();
        if (!needle) return sidebar();
        return sidebar()
            .map((section) => ({
                ...section,
                items: section.items.filter((item) => item.label.toLowerCase().includes(needle)),
            }))
            .filter((section) => section.items.length > 0);
    });
    const composerContext = createMemo<ContextItem[]>(() =>
        pendingFiles().map((file) => ({
            id: `file:${file.id}`,
            kind: "file" as const,
            label: file.originalName ?? "Attachment",
            detail: formatBytes(file.size),
        })),
    );
    const liveComposerHint = () => {
        const typing = typingUser();
        if (typing?.chatId === activeConversationId()) {
            const contact = contacts().find((item) => item.id === typing.userId);
            if (contact) return `${fullName(contact)} is typing…`;
        }
        return statusHint() ?? composerHint;
    };

    const reactionsFor = (message: LiveThreadMessage) =>
        message.reactions?.map((reaction) =>
            toggledReactions()[`${message.id}:${reaction.emoji}`]
                ? { ...reaction, count: reaction.count + 1, active: true }
                : reaction,
        );

    function applyNavigation(
        chats = serverChats(),
        users = contacts(),
        peers = dmPeers(),
        snapshots = presence(),
    ) {
        const dmByUserId = new Map<string, ChatSummary>();
        for (const chat of chats) {
            const peer = peers[chat.id];
            if (peer) dmByUserId.set(peer.id, chat);
        }
        const channels = chats.filter((chat) => chat.kind !== "dm" && chat.membershipRole);
        const directMessages = users.filter(
            (item) => item.id !== user()?.id && dmByUserId.has(item.id),
        );
        setSidebar([
            {
                id: "channels",
                label: "Channels",
                action: { icon: "plus", label: "Add channel" },
                empty: {
                    actionLabel: "Browse channels",
                    description: "Join one from the directory or create a new channel.",
                    icon: "hash",
                    title: "No channels yet",
                },
                items: channels.map((chat) => ({
                    id: chat.id,
                    kind: "channel" as const,
                    label: chat.name ?? chat.slug ?? "Untitled channel",
                })),
            },
            {
                id: "dms",
                label: "Direct messages",
                action: { icon: "edit", label: "New message" },
                empty: {
                    actionLabel: "Start a conversation",
                    description: "Message a teammate to start a direct chat.",
                    icon: "chat",
                    title: "No direct messages",
                },
                items: directMessages.map((contact) => {
                    const chat = dmByUserId.get(contact.id);
                    return {
                        id: chat?.id ?? `contact:${contact.id}`,
                        kind: "person" as const,
                        label: fullName(contact),
                        initials: initials(contact),
                        tone: toneFor(contact.id),
                        online: snapshots[contact.id]?.status === "online",
                    };
                }),
            },
        ]);

        const nextConversations: Record<string, Conversation> = {};
        for (const chat of chats) {
            const peer = peers[chat.id];
            const title =
                chat.kind === "dm" ? (peer ? fullName(peer) : "Direct message") : chat.name;
            nextConversations[chat.id] = {
                id: chat.id,
                title: title ?? chat.slug ?? "Untitled channel",
                icon: chat.kind === "dm" ? undefined : "hash",
                topic:
                    chat.topic ??
                    (chat.kind === "dm"
                        ? "Direct message"
                        : chat.membershipRole
                          ? undefined
                          : "Public channel — sending a message will join it"),
                composerPlaceholder:
                    chat.kind === "dm"
                        ? `Message ${title ?? "this person"}`
                        : `Message #${chat.slug ?? title ?? "channel"}`,
                intro: {
                    title:
                        chat.kind === "dm"
                            ? (title ?? "Direct message")
                            : `Welcome to #${chat.slug ?? title ?? "channel"}`,
                    description:
                        chat.topic ??
                        (chat.kind === "dm"
                            ? `This conversation is between you and ${title ?? "a teammate"}.`
                            : "This channel is ready for its first message."),
                },
            };
        }
        setConversationData(nextConversations);
    }

    async function refreshWorkspace(preferredChatId = activeConversationId()) {
        const model = state();
        if (!model || !props.session) return;
        const currentWorkspaceRequest = ++workspaceRequestNumber;
        try {
            const [contactResponse, directoryResponse] = await Promise.all([
                model.execute("getContacts"),
                model.execute("getDirectoryChannels"),
            ]);
            const chatsById = new Map(
                directoryResponse.channels.map((chat) => [chat.id, chat] as const),
            );
            for (const chat of model.get().chats) chatsById.set(chat.id, chat);
            const chats = [...chatsById.values()];
            const peers: Record<string, UserSummary> = {};
            await Promise.all(
                chats
                    .filter((chat) => chat.kind === "dm")
                    .map(async (chat) => {
                        const response = await model.execute("getChatMembers", {
                            chatId: chat.id,
                        });
                        const peer = response.users.find(
                            (item) => item.id !== props.session!.user.id,
                        );
                        if (peer) peers[chat.id] = peer;
                    }),
            );
            const snapshots = Object.fromEntries(
                contactResponse.presence.map((item) => [item.userId, item]),
            );
            if (currentWorkspaceRequest !== workspaceRequestNumber) return;
            setServerChats(chats);
            setContacts([...contactResponse.users]);
            setDmPeers(peers);
            setPresence(snapshots);
            applyNavigation(chats, [...contactResponse.users], peers, snapshots);

            const preferredChat = chats.find((chat) => chat.id === preferredChatId);
            const nextChatId = manualEmptySelection()
                ? ""
                : preferredChat && (preferredChat.kind === "dm" || preferredChat.membershipRole)
                  ? preferredChat.id
                  : (chats.find((chat) => chat.kind === "dm" || chat.membershipRole)?.id ?? "");
            setActiveConversationId(nextChatId);
            if (nextChatId) await loadConversation(nextChatId);
            else setEntries([]);
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    async function loadConversation(chatId: string) {
        const model = state();
        if (!model || !chatId) return;
        const currentRequest = ++requestNumber;
        startBusy();
        try {
            const membersPromise = model.execute("getChatMembers", { chatId });
            const messages = (await model.loadMessages(chatId)).map((item) => item.message);
            const members = await membersPromise;
            if (currentRequest !== requestNumber) return;
            setEntries(toEntries(messages, user()));
            prefetchImages(messages);
            setConversationData((current) => ({
                ...current,
                [chatId]: {
                    ...current[chatId]!,
                    memberCount: members.users.length,
                    members: members.users.slice(0, 4).map((member) => ({
                        initials: initials(member),
                        tone: toneFor(member.id),
                    })),
                },
            }));
            setStatusHint(undefined);
        } catch (reason) {
            if (currentRequest === requestNumber) setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function selectConversation(id: string) {
        // A direct user selection wins over any workspace refresh already in flight.
        workspaceRequestNumber += 1;
        setManualEmptySelection(false);
        setDraft("");
        setPendingFiles([]);
        setThreadRootId(undefined);
        setThreadEntries([]);
        setPanelMode(undefined);
        if (!props.session) {
            setActiveConversationId(id);
            return;
        }
        await stopTyping();
        const model = state();
        if (!model) return;
        if (id.startsWith("contact:")) {
            startBusy();
            try {
                const chat = await model.createDirectMessage(id.slice("contact:".length));
                await refreshWorkspace(chat.id);
            } catch (reason) {
                setStatusHint(errorMessage(reason));
            } finally {
                finishBusy();
            }
            return;
        }
        setActiveConversationId(id);
        await loadConversation(id);
    }

    async function createChannel() {
        const model = state();
        if (!model) return;
        const name = newChannelName().trim();
        if (!name) return;
        const slug = channelSlug(newChannelSlug() || name);
        if (!slug) {
            setStatusHint("Channel names need at least one letter or number.");
            return;
        }
        startBusy();
        try {
            const chat = await model.createChannel({ kind: newChannelKind(), name, slug });
            setManualEmptySelection(false);
            setCreateOpen(false);
            setNewChannelName("");
            setNewChannelSlug("");
            setChannelSlugEdited(false);
            await refreshWorkspace(chat.id);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function joinActiveChannel() {
        const model = state();
        const chat = activeChat();
        if (!model || !chat) return;
        startBusy();
        try {
            await model.joinChat(chat.id);
            setManualEmptySelection(false);
            await refreshWorkspace(chat.id);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function leaveActiveChannel() {
        const model = state();
        const chat = activeChat();
        if (!model || !chat) return;
        setManualEmptySelection(true);
        setActiveConversationId("");
        setEntries([]);
        setThreadRootId(undefined);
        setThreadEntries([]);
        setPanelMode(undefined);
        startBusy();
        try {
            await model.execute("leaveChat", { chatId: chat.id });
            await model.execute("getChats");
            await refreshWorkspace("");
        } catch (reason) {
            setManualEmptySelection(false);
            setActiveConversationId(chat.id);
            await refreshWorkspace(chat.id);
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function startDirectMessage() {
        const teammates = contacts().filter((contact) => contact.id !== user()?.id);
        if (teammates.length === 0) {
            setStatusHint("No teammates are available to message yet.");
            return;
        }
        const query = window.prompt("Message teammate by name or username")?.trim().toLowerCase();
        if (!query) return;
        const teammate = teammates.find(
            (contact) =>
                fullName(contact).toLowerCase() === query ||
                contact.username.toLowerCase() === query,
        );
        if (!teammate) {
            setStatusHint("No teammate matched that name or username.");
            return;
        }
        await selectConversation(`contact:${teammate.id}`);
    }

    function updateDraft(value: string) {
        setDraft(value);
        const model = state();
        const chatId = activeConversationId();
        if (!model || !chatId) return;
        const active = value.trim().length > 0;
        if (active === sentTyping) return;
        sentTyping = active;
        model.setTyping(chatId, active);
    }

    async function stopTyping() {
        const model = state();
        const chatId = activeConversationId();
        if (!model || !chatId || !sentTyping) return;
        sentTyping = false;
        model.setTyping(chatId, false);
    }

    async function sendMessage() {
        const body = draft().trim();
        if (!props.session) {
            if (!body) return;
            setEntries((current) => [
                ...current,
                {
                    kind: "message",
                    id: `sent-${current.length}`,
                    conversationId: activeConversationId(),
                    author: userName(),
                    initials: userInitials(),
                    tone: "brand",
                    time: "Now",
                    body,
                },
            ]);
            setDraft("");
            return;
        }
        const chatId = activeConversationId();
        const model = state();
        const attachments = pendingFiles();
        if (!model || !chatId || (!body && attachments.length === 0)) return;
        startBusy();
        try {
            const chat = activeChat();
            if (chat?.kind === "public_channel" && !chat.membershipRole) {
                const joined = await model.joinChat(chatId);
                setServerChats((current) =>
                    current.map((item) => (item.id === joined.id ? joined : item)),
                );
            }
            const input = {
                text: body,
                attachmentFileIds: attachments.map((file) => file.id),
                clientMutationId: mutationId(),
            };
            model.sendMessage(chatId, input);
            setDraft("");
            setPendingFiles([]);
            await stopTyping();
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function toggleReaction(message: LiveThreadMessage, emoji: string) {
        const resolvedEmoji = emojiItems.find((item) => item.id === emoji)?.char ?? emoji;
        const model = state();
        if (!model || !message.serverMessage) {
            setToggledReactions((current) => ({
                ...current,
                [`${message.id}:${resolvedEmoji}`]: !current[`${message.id}:${resolvedEmoji}`],
            }));
            return;
        }
        const active = message.serverMessage.reactions.some(
            (reaction) => reaction.emoji === resolvedEmoji && reaction.reacted,
        );
        try {
            const response = active
                ? await model.execute("removeReaction", {
                      messageId: message.id,
                      emoji: resolvedEmoji,
                  })
                : await model.execute("addReaction", {
                      messageId: message.id,
                      emoji: resolvedEmoji,
                  });
            setEntries((current) =>
                current.map((entry) =>
                    entry.kind === "message" && entry.id === message.id
                        ? toThreadMessage(response.message, user())
                        : entry,
                ),
            );
            setThreadEntries((current) =>
                current.map((entry) =>
                    entry.kind === "message" && entry.id === message.id
                        ? toThreadMessage(response.message, user())
                        : entry,
                ),
            );
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    function messageMenuItems(message: LiveThreadMessage): MenuItem[] {
        if (!message.serverMessage || message.serverMessage.deletedAt) return [];
        const own = message.serverMessage.sender?.id === user()?.id;
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

    async function handleMessageMenu(message: LiveThreadMessage, action: string) {
        const model = state();
        if (!message.serverMessage) return;
        try {
            if (action === "copy") {
                await navigator.clipboard?.writeText(message.serverMessage.text);
                return;
            }
            if (!model || message.serverMessage.sender?.id !== user()?.id) return;
            if (action === "edit") {
                const text = window.prompt("Edit message", message.serverMessage.text)?.trim();
                if (!text || text === message.serverMessage.text) return;
                await model.execute("editMessage", {
                    expectedRevision: message.serverMessage.revision,
                    messageId: message.id,
                    text,
                });
                return;
            }
            if (action === "delete" && window.confirm("Delete this message?")) {
                await model.execute("deleteMessage", { messageId: message.id });
            }
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    async function uploadFiles(files: FileList | null) {
        const model = state();
        if (!model || !files?.length) return;
        startBusy();
        setStatusHint(
            `Uploading ${files.length === 1 ? files[0]!.name : `${files.length} files`}…`,
        );
        try {
            const uploaded = await Promise.all(
                Array.from(files).map((file) => {
                    const body = new FormData();
                    body.set("file", file, file.name);
                    return model.execute("uploadFile", { body });
                }),
            );
            setPendingFiles((current) => [...current, ...uploaded.map((item) => item.file)]);
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            if (fileInput) fileInput.value = "";
            finishBusy();
        }
    }

    function removeContext(id: string) {
        if (id.startsWith("file:")) {
            setPendingFiles((current) => current.filter((file) => `file:${file.id}` !== id));
        }
    }

    async function loadThread(messageId: string) {
        const model = state();
        if (!model) return;
        startBusy();
        try {
            const history = await model.execute("getThread", { messageId, limit: 100 });
            setThreadEntries(toEntries([history.root, ...history.messages], user()));
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    function openThread(message: LiveThreadMessage) {
        setThreadRootId(message.id);
        setPanelMode("thread");
        setThreadDraft("");
        if (!props.session || !message.serverMessage) {
            setThreadEntries([message]);
            return;
        }
        void loadThread(message.id);
    }

    async function sendThreadReply() {
        const body = threadDraft().trim();
        const rootId = threadRootId();
        if (!body || !rootId) return;
        const model = state();
        if (!model) {
            setThreadEntries((current) => [
                ...current,
                {
                    body,
                    conversationId: activeConversationId(),
                    id: `thread-local-${current.length}`,
                    initials: userInitials(),
                    kind: "message",
                    author: userName(),
                    time: "Now",
                    tone: "brand",
                },
            ]);
            setThreadDraft("");
            return;
        }
        startBusy();
        try {
            await model.execute("sendThreadMessage", {
                clientMutationId: mutationId(),
                messageId: rootId,
                text: body,
            });
            setThreadDraft("");
            await loadThread(rootId);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    const toggleStar = (chatId: string) => {
        if (!chatId) return;
        setStarredChats((current) => ({ ...current, [chatId]: !current[chatId] }));
    };

    function isImageAttachment(file: FileSummary): boolean {
        return (
            file.kind === "photo" ||
            file.kind === "gif" ||
            (file.contentType?.startsWith("image/") ?? false)
        );
    }

    async function ensureFileUrl(fileId: string): Promise<string | undefined> {
        const cached = fileUrls()[fileId];
        if (cached) return cached;
        const model = state();
        if (!model) return undefined;
        try {
            const response = await model.execute("createFileSignedUrl", { fileId });
            setFileUrls((current) => ({ ...current, [fileId]: response.signedUrl.url }));
            return response.signedUrl.url;
        } catch (reason) {
            setStatusHint(errorMessage(reason));
            return undefined;
        }
    }

    function prefetchImages(messages: readonly MessageSummary[]) {
        for (const message of messages) {
            for (const file of message.attachments) {
                if (isImageAttachment(file)) void ensureFileUrl(file.id);
            }
        }
    }

    function messageImages(message: LiveThreadMessage): MessageImage[] {
        if (!message.serverMessage) return message.images ?? [];
        return message.serverMessage.attachments
            .filter(isImageAttachment)
            .map((file) => ({
                id: file.id,
                alt: file.originalName ?? "Photo",
                height: file.height,
                url: fileUrls()[file.id] ?? "",
                width: file.width,
            }))
            .filter((image) => image.url.length > 0);
    }

    function fileAttachments(message: LiveThreadMessage): FileSummary[] {
        return (message.serverMessage?.attachments ?? []).filter(
            (file) => !isImageAttachment(file),
        );
    }

    /* Unified non-image file list for a message — real server attachments (with a
       signed-URL download) or the mock roster — rendered as FileAttachment. */
    function messageFiles(message: LiveThreadMessage): Array<{
        id: string;
        kind: "file" | "video" | "archive";
        name: string;
        onOpen?: () => void;
        size?: string;
    }> {
        if (message.serverMessage) {
            return fileAttachments(message).map((file) => ({
                id: file.id,
                kind: file.kind === "video" ? "video" : "file",
                name: file.originalName ?? "Attachment",
                onOpen: () => void downloadFile(file),
                size: formatBytes(file.size),
            }));
        }
        return (message.files ?? []).map((file) => ({
            id: file.id,
            kind: file.kind ?? "file",
            name: file.name,
            size: file.size,
        }));
    }

    async function openImage(message: LiveThreadMessage, imageId: string) {
        if (!message.serverMessage) {
            const image = message.images?.find((item) => item.id === imageId);
            if (image) setLightbox({ url: image.url, caption: image.alt });
            return;
        }
        const file = message.serverMessage.attachments.find((item) => item.id === imageId);
        if (!file) return;
        const url = fileUrls()[file.id] ?? (await ensureFileUrl(file.id));
        if (url) {
            setLightbox({
                caption: file.originalName ?? "Photo",
                detail: formatBytes(file.size),
                url,
            });
        }
    }

    function memberRoleFor(member: UserSummary): MemberRole {
        if (member.id === user()?.id && activeChat()?.membershipRole)
            return activeChat()!.membershipRole!;
        return member.role === "admin" ? "admin" : "member";
    }

    async function loadPanelMembers(chatId: string) {
        const model = state();
        if (!model) return;
        try {
            const response = await model.execute("getChatMembers", { chatId });
            const snapshots = presence();
            setPanelMembers(
                response.users.map(
                    (member): MemberItem => ({
                        id: member.id,
                        initials: initials(member),
                        name: fullName(member),
                        presence: snapshots[member.id]?.status === "online" ? "online" : "offline",
                        role: memberRoleFor(member),
                        title: member.title,
                        tone: toneFor(member.id),
                        username: member.username,
                    }),
                ),
            );
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    function openInfoPanel() {
        const chat = activeChat();
        setPanelMode("info");
        if (chat) {
            setChannelNameDraft(chat.name ?? "");
            setChannelTopicDraft(chat.topic ?? "");
            if (props.session) void loadPanelMembers(chat.id);
        } else {
            setPanelMembers(mockPanelMembers());
        }
    }

    const infoPeer = () => dmPeers()[activeConversationId()];
    const infoProfile = (): InfoPanelProfile | undefined => {
        const peer = infoPeer();
        if (!peer) return undefined;
        return {
            initials: initials(peer),
            name: fullName(peer),
            presence: presence()[peer.id]?.status === "online" ? "online" : "offline",
            title: peer.title,
            tone: toneFor(peer.id),
            username: peer.username,
        };
    };
    const mockPanelMembers = (): MemberItem[] =>
        (conversation().members ?? []).map(
            (member, index): MemberItem => ({
                id: `mock:${member.initials}:${index}`,
                initials: member.initials,
                name: mockMemberNames[member.initials] ?? member.initials,
                presence: index % 2 === 0 ? "online" : "offline",
                role: index === 0 ? "owner" : "member",
                tone: member.tone,
            }),
        );

    function channelMenuItems(): MenuItem[] {
        const chat = activeChat();
        const starred = starredChats()[activeConversationId()];
        const items: MenuItem[] = [
            { icon: "eye", id: "details", kind: "item", label: "View details" },
            { icon: "star", id: "star", kind: "item", label: starred ? "Unstar" : "Star channel" },
        ];
        if (canEditChannel())
            items.push({ icon: "settings", id: "edit", kind: "item", label: "Edit settings" });
        if (chat?.kind !== "dm" && chat?.membershipRole) {
            items.push(
                { kind: "separator" },
                { danger: true, icon: "close", id: "leave", kind: "item", label: "Leave channel" },
            );
        }
        return items;
    }

    function handleChannelMenu(id: string) {
        if (id === "details" || id === "edit") return openInfoPanel();
        if (id === "star") return toggleStar(activeConversationId());
        if (id === "leave") void leaveActiveChannel();
    }

    async function saveChannelInfo() {
        const model = state();
        const chat = activeChat();
        const name = channelNameDraft().trim();
        if (!model || !chat || !name || !canEditChannel()) return;
        startBusy();
        try {
            await model.execute("updateChannel", {
                chatId: chat.id,
                name,
                topic: channelTopicDraft().trim() || null,
            });
            await model.execute("getChats");
            await refreshWorkspace(chat.id);
            setStatusHint("Channel details saved.");
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    function previewDirectoryChannel(id: string) {
        workspaceRequestNumber += 1;
        setManualEmptySelection(false);
        setDirectoryOpen(false);
        setPanelMode(undefined);
        setActiveConversationId(id);
        void loadConversation(id);
    }

    async function downloadFile(file: FileSummary) {
        const model = state();
        if (!model) return;
        const download = window.open("about:blank", "_blank");
        if (download) download.opener = null;
        try {
            const response = await model.execute("createFileSignedUrl", { fileId: file.id });
            if (download) download.location.replace(response.signedUrl.url);
            else {
                const link = document.createElement("a");
                link.href = response.signedUrl.url;
                link.rel = "noopener noreferrer";
                link.target = "_blank";
                link.click();
            }
        } catch (reason) {
            download?.close();
            setStatusHint(errorMessage(reason));
        }
    }

    let seenCreateRequest: number | undefined;
    createEffect(() => {
        const nonce = props.createRequest?.() ?? 0;
        if (seenCreateRequest === undefined) {
            seenCreateRequest = nonce;
            return;
        }
        if (nonce !== seenCreateRequest) {
            seenCreateRequest = nonce;
            setCreateOpen(true);
        }
    });

    onMount(() => {
        const model = state();
        if (!model || !props.session) return;
        void refreshWorkspace();
        stateCleanups.push(
            model.subscribe("chats", () => void refreshWorkspace()),
            model.subscribe("messages", (event) => {
                if (event.chatId !== activeConversationId()) return;
                const messages = (model.get().messagesByChat[event.chatId] ?? [])
                    .map((item) => item.message)
                    .filter((message) => !message.threadRootMessageId);
                setEntries(toEntries(messages, user()));
                prefetchImages(messages);
                const root = threadRootId();
                if (root) void loadThread(root);
            }),
            model.subscribe("presence", () => {
                const snapshots = Object.fromEntries(
                    model.get().presence.map((item) => [item.userId, item]),
                );
                setPresence(snapshots);
                applyNavigation(serverChats(), contacts(), dmPeers(), snapshots);
            }),
            model.subscribe("typing", (event) => {
                if (event.userId === props.session!.user.id) return;
                setTypingUser(
                    event.active ? { chatId: event.chatId, userId: event.userId } : undefined,
                );
            }),
            model.subscribe("background-error", (event) => setStatusHint(event.error.message)),
        );
    });
    onCleanup(() => {
        workspaceRequestNumber += 1;
        requestNumber += 1;
        for (const cleanup of stateCleanups) cleanup();
        void stopTyping();
    });

    return (
        <>
            <AppShell
                titleBar={props.titleBar}
                rail={props.rail}
                sidebar={
                    <Sidebar
                        activeItemId={activeConversationId()}
                        onCompose={() => void startDirectMessage()}
                        onItemSelect={(id) => void selectConversation(id)}
                        onSectionAction={(sectionId) => {
                            if (sectionId === "channels") setDirectoryOpen(true);
                            if (sectionId === "dms") void startDirectMessage();
                        }}
                        sections={filteredSidebar()}
                        title={user() ? `${user()!.firstName}’s Rigged` : "Rigged"}
                    />
                }
                panel={
                    panelMode() === "thread" ? (
                        <ThreadPanel
                            composer={
                                <Composer
                                    emoji={emojiItems}
                                    hint="Reply in thread"
                                    mentions={mentionCandidates()}
                                    onSend={() => void sendThreadReply()}
                                    onValueChange={setThreadDraft}
                                    pending={busy()}
                                    placeholder="Reply…"
                                    sendEnabled={threadDraft().trim().length > 0}
                                    value={threadDraft()}
                                />
                            }
                            data-testid="thread-panel"
                            onClose={() => {
                                setThreadRootId(undefined);
                                setThreadEntries([]);
                                setPanelMode(undefined);
                            }}
                            subtitle={threadRoot()?.author}
                        >
                            <MessageList
                                intro={{ title: "Thread", description: "No replies yet." }}
                            >
                                <For each={threadEntries()}>
                                    {(entry, index) => (
                                        <Show when={asMessage(entry)}>
                                            {(message) => (
                                                <Message
                                                    author={message().author}
                                                    body={message().body}
                                                    deliveryState={
                                                        message().id.startsWith("local:")
                                                            ? "sending"
                                                            : "sent"
                                                    }
                                                    grouped={groupedWithPrevious(
                                                        threadEntries(),
                                                        index(),
                                                        message(),
                                                    )}
                                                    gutterTime={message().gutterTime}
                                                    initials={message().initials}
                                                    menuItems={messageMenuItems(message())}
                                                    onMenuSelect={(action) =>
                                                        void handleMessageMenu(message(), action)
                                                    }
                                                    onReactionSelect={(emoji) =>
                                                        void toggleReaction(message(), emoji)
                                                    }
                                                    reactionOptions={emojiItems}
                                                    reactions={reactionsFor(message())}
                                                    time={message().time}
                                                    tone={message().tone}
                                                />
                                            )}
                                        </Show>
                                    )}
                                </For>
                            </MessageList>
                        </ThreadPanel>
                    ) : panelMode() === "info" ? (
                        <InfoPanel
                            about={
                                !infoPeer() && !canEditChannel()
                                    ? (conversation().topic ?? "No topic set yet.")
                                    : undefined
                            }
                            data-testid="channel-info-panel"
                            leadingIcon={infoPeer() ? undefined : "hash"}
                            members={panelMembers()}
                            onClose={() => setPanelMode(undefined)}
                            profile={infoProfile()}
                            subtitle={
                                infoPeer()
                                    ? "Direct message"
                                    : canEditChannel()
                                      ? "Edit details"
                                      : "Details"
                            }
                            title={conversation().title}
                        >
                            <Show when={!infoPeer() && canEditChannel()}>
                                <Box style={infoFormStyle}>
                                    <FormRow
                                        control={
                                            <TextField
                                                fullWidth
                                                onValueChange={setChannelNameDraft}
                                                value={channelNameDraft()}
                                            />
                                        }
                                        description="Shown in the channel header and sidebar."
                                        label="Name"
                                        layout="stacked"
                                    />
                                    <FormRow
                                        control={
                                            <TextField
                                                fullWidth
                                                onValueChange={setChannelTopicDraft}
                                                placeholder="What is this channel for?"
                                                value={channelTopicDraft()}
                                            />
                                        }
                                        description="The channel topic and about text."
                                        label="About"
                                        layout="stacked"
                                    />
                                    <Box style={panelFooterStyle}>
                                        <Button
                                            disabled={busy() || !channelNameDraft().trim()}
                                            onClick={() => void saveChannelInfo()}
                                        >
                                            {busy() ? "Saving…" : "Save changes"}
                                        </Button>
                                    </Box>
                                </Box>
                            </Show>
                        </InfoPanel>
                    ) : !connected ? (
                        <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                    ) : undefined
                }
            >
                <ChannelHeader
                    actions={
                        <Show
                            when={
                                connected &&
                                activeChat()?.kind !== "dm" &&
                                activeChat() &&
                                !activeChat()?.membershipRole
                            }
                        >
                            <Button
                                disabled={busy()}
                                onClick={() => void joinActiveChannel()}
                                size="small"
                                variant="secondary"
                            >
                                Join
                            </Button>
                        </Show>
                    }
                    agentCount={conversation().agentCount}
                    icon={conversation().icon}
                    memberCount={conversation().memberCount}
                    menuItems={activeConversationId() ? channelMenuItems() : undefined}
                    onMembersClick={activeConversationId() ? openInfoPanel : undefined}
                    onMenuSelect={handleChannelMenu}
                    onStarToggle={
                        activeConversationId()
                            ? () => toggleStar(activeConversationId())
                            : undefined
                    }
                    onTitleClick={activeConversationId() ? openInfoPanel : undefined}
                    starLabel={starredChats()[activeConversationId()] ? "Unstar" : "Star channel"}
                    starred={starredChats()[activeConversationId()] ?? false}
                    title={conversation().title}
                    topic={conversation().topic}
                />
                <MessageList intro={conversation().intro}>
                    <For each={conversationEntries()}>
                        {(entry, index) => (
                            <Switch>
                                <Match when={asDivider(entry)}>
                                    {(divider) => <DayDivider label={divider().label} />}
                                </Match>
                                <Match when={asMessage(entry)}>
                                    {(message) => {
                                        const item = message();
                                        const attachment = item.attachment;
                                        return (
                                            <Message
                                                agent={item.agent}
                                                author={item.author}
                                                body={item.body}
                                                deliveryState={
                                                    item.id.startsWith("local:")
                                                        ? "sending"
                                                        : "sent"
                                                }
                                                grouped={groupedWithPrevious(
                                                    conversationEntries(),
                                                    index(),
                                                    item,
                                                )}
                                                gutterTime={item.gutterTime}
                                                images={messageImages(item)}
                                                initials={item.initials}
                                                menuItems={messageMenuItems(item)}
                                                onImageOpen={(id) => void openImage(item, id)}
                                                onMenuSelect={(action) =>
                                                    void handleMessageMenu(item, action)
                                                }
                                                onReactionSelect={(emoji) =>
                                                    void toggleReaction(item, emoji)
                                                }
                                                onReplySelect={() => openThread(item)}
                                                reactionOptions={emojiItems}
                                                reactions={reactionsFor(item)}
                                                replyCount={item.replyCount}
                                                time={item.time}
                                                tone={item.tone}
                                            >
                                                <For each={messageFiles(item)}>
                                                    {(file) => (
                                                        <FileAttachment
                                                            aria-label={`Download ${file.name}`}
                                                            kind={file.kind}
                                                            name={file.name}
                                                            onOpen={file.onOpen}
                                                            size={file.size}
                                                        />
                                                    )}
                                                </For>
                                                {attachment?.kind === "run" && (
                                                    <AgentRunCard
                                                        actions={attachment.actions}
                                                        expanded={expandedRuns()[item.id] ?? false}
                                                        onExpandedChange={(expanded) =>
                                                            setExpandedRuns((current) => ({
                                                                ...current,
                                                                [item.id]: expanded,
                                                            }))
                                                        }
                                                        run={attachment.run}
                                                    >
                                                        {attachment.diff && (
                                                            <DiffSnippet
                                                                file={attachment.diff.file}
                                                                lines={attachment.diff.lines}
                                                                stats={attachment.diff.stats}
                                                            />
                                                        )}
                                                    </AgentRunCard>
                                                )}
                                                {attachment?.kind === "approval" && (
                                                    <ApprovalCard
                                                        expanded={
                                                            expandedApprovals()[item.id] ?? false
                                                        }
                                                        onExpandedChange={(expanded) =>
                                                            setExpandedApprovals((current) => ({
                                                                ...current,
                                                                [item.id]: expanded,
                                                            }))
                                                        }
                                                        onResolutionChange={(resolution) =>
                                                            setApprovalResolutions((current) => ({
                                                                ...current,
                                                                [item.id]: resolution,
                                                            }))
                                                        }
                                                        request={attachment.request}
                                                        resolution={
                                                            approvalResolutions()[item.id] ??
                                                            "pending"
                                                        }
                                                    />
                                                )}
                                                {attachment?.kind === "event" && (
                                                    <EventCard
                                                        badge={attachment.event.badge}
                                                        from={attachment.event.from}
                                                        icon={attachment.event.icon}
                                                        meta={attachment.event.meta}
                                                        time={attachment.event.time}
                                                        title={attachment.event.title}
                                                        to={attachment.event.to}
                                                    />
                                                )}
                                            </Message>
                                        );
                                    }}
                                </Match>
                            </Switch>
                        )}
                    </For>
                </MessageList>
                <input
                    hidden
                    multiple
                    onChange={(event) => void uploadFiles(event.currentTarget.files)}
                    ref={(element) => (fileInput = element)}
                    type="file"
                />
                <Composer
                    contextItems={composerContext()}
                    disabled={connected && !activeConversationId()}
                    emoji={emojiItems}
                    hint={liveComposerHint()}
                    mentions={mentionCandidates()}
                    onAttachFile={connected ? () => fileInput?.click() : undefined}
                    onContextRemove={removeContext}
                    onSend={() => void sendMessage()}
                    onValueChange={updateDraft}
                    pending={busy()}
                    placeholder={conversation().composerPlaceholder}
                    sendEnabled={draft().trim().length > 0 || pendingFiles().length > 0}
                    style={{ margin: "0 20px 16px" }}
                    value={draft()}
                />
            </AppShell>
            <Show when={directoryOpen()}>
                <Box onClick={() => setDirectoryOpen(false)} style={overlayStyle}>
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            footer={
                                <Box style={modalActionsStyle}>
                                    <Button
                                        onClick={() => {
                                            setDirectoryOpen(false);
                                            setCreateOpen(true);
                                        }}
                                        variant="secondary"
                                    >
                                        Create channel
                                    </Button>
                                    <Button onClick={() => setDirectoryOpen(false)}>Done</Button>
                                </Box>
                            }
                            icon="hash"
                            onClose={() => setDirectoryOpen(false)}
                            size="small"
                            title="Channel directory"
                        >
                            <Show
                                fallback={
                                    <EmptyState
                                        action={{
                                            icon: "plus",
                                            label: "Create channel",
                                            onClick: () => {
                                                setDirectoryOpen(false);
                                                setCreateOpen(true);
                                            },
                                        }}
                                        description="There are no public channels waiting to be joined."
                                        icon="hash"
                                        size="inline"
                                        title="No channels to join"
                                    />
                                }
                                when={directoryItems().length > 0}
                            >
                                <Menu
                                    items={directoryItems()}
                                    onSelect={previewDirectoryChannel}
                                    width={328}
                                />
                            </Show>
                        </Modal>
                    </Box>
                </Box>
            </Show>
            <Show when={createOpen()}>
                <Box onClick={() => setCreateOpen(false)} style={overlayStyle}>
                    <Box onClick={(event) => event.stopPropagation()}>
                        <Modal
                            footer={
                                <Box style={modalActionsStyle}>
                                    <Button onClick={() => setCreateOpen(false)} variant="ghost">
                                        Cancel
                                    </Button>
                                    <Button
                                        disabled={busy() || !newChannelName().trim()}
                                        icon="plus"
                                        onClick={() => void createChannel()}
                                    >
                                        Create channel
                                    </Button>
                                </Box>
                            }
                            icon="hash"
                            onClose={() => setCreateOpen(false)}
                            size="small"
                            title="Create channel"
                        >
                            <Box style={modalStackStyle}>
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={(value) => {
                                                setNewChannelName(value);
                                                if (!channelSlugEdited())
                                                    setNewChannelSlug(channelSlug(value));
                                            }}
                                            placeholder="e.g. Product launch"
                                            value={newChannelName()}
                                        />
                                    }
                                    description="Shown in the channel list."
                                    label="Name"
                                    layout="stacked"
                                />
                                <FormRow
                                    control={
                                        <TextField
                                            fullWidth
                                            onValueChange={(value) => {
                                                setChannelSlugEdited(true);
                                                setNewChannelSlug(channelSlug(value));
                                            }}
                                            placeholder="product-launch"
                                            value={newChannelSlug()}
                                        />
                                    }
                                    description="Used for mentions and channel links."
                                    label="Slug"
                                    layout="stacked"
                                />
                                <FormRow
                                    control={
                                        <Select
                                            fullWidth
                                            onValueChange={(value) =>
                                                setNewChannelKind(
                                                    value as "public_channel" | "private_channel",
                                                )
                                            }
                                            options={channelKindOptions}
                                            value={newChannelKind()}
                                        />
                                    }
                                    description="Public channels are discoverable by everyone."
                                    label="Visibility"
                                    layout="stacked"
                                />
                            </Box>
                        </Modal>
                    </Box>
                </Box>
            </Show>
            <Show when={lightbox()}>
                {(image) => (
                    <Box
                        onClick={() => setLightbox(undefined)}
                        style={{ ...overlayStyle, background: "rgb(0 0 0 / 0.72)" }}
                    >
                        <Box onClick={(event) => event.stopPropagation()}>
                            <Lightbox
                                alt={image().caption}
                                caption={image().caption}
                                detail={image().detail}
                                imageUrl={image().url}
                                onClose={() => setLightbox(undefined)}
                            />
                        </Box>
                    </Box>
                )}
            </Show>
        </>
    );
}

function formatBytes(size: number): string {
    if (size < 1024) return `${size} B`;
    if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;
    return `${Math.round(size / (102.4 * 1024)) / 10} MB`;
}

function mutationId(): string {
    return globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
}

function channelSlug(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-|-$/g, "")
        .slice(0, 64);
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
