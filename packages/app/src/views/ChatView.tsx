import {
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
    ContextChips,
    DayDivider,
    DiffSnippet,
    EventCard,
    FormRow,
    Message,
    MessageList,
    Modal,
    ProfileCard,
    Select,
    Sidebar,
    TextField,
    type ApprovalResolution,
    type ContextItem,
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
    const composerContext = createMemo<ContextItem[]>(() => [
        ...(threadRootId()
            ? [
                  {
                      id: `thread:${threadRootId()}`,
                      kind: "thread" as const,
                      label: "Thread",
                      detail: "Replying in thread",
                  },
              ]
            : []),
        ...pendingFiles().map((file) => ({
            id: `file:${file.id}`,
            kind: "file" as const,
            label: file.originalName ?? "Attachment",
            detail: formatBytes(file.size),
        })),
    ]);
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
        const channels = chats.filter((chat) => chat.kind !== "dm");
        const directMessages = users.filter((item) => item.id !== user()?.id);
        setSidebar([
            {
                id: "channels",
                label: "Channels",
                action: { icon: "plus", label: "Add channel" },
                items: channels.map((chat) => ({
                    id: chat.id,
                    kind: "channel" as const,
                    label: chat.name ?? chat.slug ?? "Untitled channel",
                    meta: chat.membershipRole ? undefined : "join",
                })),
            },
            {
                id: "dms",
                label: "Direct messages",
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

            const nextChatId = chats.some((chat) => chat.id === preferredChatId)
                ? preferredChatId
                : (chats.find((chat) => chat.membershipRole)?.id ?? chats[0]?.id ?? "");
            setActiveConversationId(nextChatId);
            if (nextChatId) await loadConversation(nextChatId, threadRootId());
            else setEntries([]);
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    async function loadConversation(chatId: string, rootMessageId?: string) {
        const model = state();
        if (!model || !chatId) return;
        const currentRequest = ++requestNumber;
        startBusy();
        try {
            const membersPromise = model.execute("getChatMembers", { chatId });
            let messages: MessageSummary[];
            if (rootMessageId) {
                const history = await model.execute("getThread", {
                    messageId: rootMessageId,
                    limit: 100,
                });
                messages = [history.root, ...history.messages] as MessageSummary[];
            } else {
                messages = (await model.loadMessages(chatId)).map((item) => item.message);
            }
            const members = await membersPromise;
            if (currentRequest !== requestNumber) return;
            setEntries(toEntries(messages, user()));
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
        setDraft("");
        setPendingFiles([]);
        setThreadRootId(undefined);
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
        startBusy();
        try {
            await model.execute("leaveChat", { chatId: chat.id });
            await model.execute("getChats");
            await refreshWorkspace();
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
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
            model.sendMessage(chatId, {
                ...input,
                threadRootMessageId: threadRootId(),
            });
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
        const model = state();
        if (!model || !message.serverMessage) {
            setToggledReactions((current) => ({
                ...current,
                [`${message.id}:${emoji}`]: !current[`${message.id}:${emoji}`],
            }));
            return;
        }
        const active = message.serverMessage.reactions.some(
            (reaction) => reaction.emoji === emoji && reaction.reacted,
        );
        try {
            const response = active
                ? await model.execute("removeReaction", { messageId: message.id, emoji })
                : await model.execute("addReaction", { messageId: message.id, emoji });
            setEntries((current) =>
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
            return;
        }
        if (id.startsWith("thread:")) {
            setThreadRootId(undefined);
            void loadConversation(activeConversationId());
        }
    }

    function openThread(message: LiveThreadMessage) {
        if (!props.session || !message.serverMessage) return;
        setThreadRootId(message.id);
        void loadConversation(activeConversationId(), message.id);
    }

    async function downloadFile(file: FileSummary, event: MouseEvent) {
        event.preventDefault();
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

    onMount(() => {
        const model = state();
        if (!model || !props.session) return;
        void refreshWorkspace();
        stateCleanups.push(
            model.subscribe("chats", () => void refreshWorkspace()),
            model.subscribe("messages", (event) => {
                if (event.chatId !== activeConversationId()) return;
                const root = threadRootId();
                const messages = (model.get().messagesByChat[event.chatId] ?? [])
                    .map((item) => item.message)
                    .filter((message) =>
                        root
                            ? message.id === root || message.threadRootMessageId === root
                            : !message.threadRootMessageId,
                    );
                setEntries(toEntries(messages, user()));
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
                        footer={
                            <ProfileCard
                                imageUrl={user()?.avatarUrl}
                                initials={userInitials()}
                                name={userName()}
                                presence="online"
                                size="compact"
                                tone="brand"
                                username={user()?.username ?? "you"}
                            />
                        }
                        onItemSelect={(id) => void selectConversation(id)}
                        onSectionAction={(sectionId) => {
                            if (sectionId === "channels") setCreateOpen(true);
                        }}
                        sections={filteredSidebar()}
                        title={user() ? `${user()!.firstName}’s Rigged` : "Rigged"}
                    />
                }
                panel={
                    !connected ? (
                        <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                    ) : undefined
                }
            >
                <ChannelHeader
                    actions={
                        <Show when={connected && activeChat()?.kind !== "dm" && activeChat()}>
                            {(chat) => (
                                <Button
                                    disabled={busy()}
                                    onClick={() =>
                                        void (chat().membershipRole
                                            ? leaveActiveChannel()
                                            : joinActiveChannel())
                                    }
                                    size="small"
                                    variant={chat().membershipRole ? "ghost" : "secondary"}
                                >
                                    {chat().membershipRole ? "Leave" : "Join"}
                                </Button>
                            )}
                        </Show>
                    }
                    agentCount={conversation().agentCount}
                    icon={conversation().icon}
                    memberCount={conversation().memberCount}
                    members={conversation().members}
                    title={conversation().title}
                    topic={conversation().topic}
                />
                <MessageList intro={conversation().intro}>
                    <For each={conversationEntries()}>
                        {(entry) => (
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
                                                initials={item.initials}
                                                onReactionSelect={(emoji) =>
                                                    void toggleReaction(item, emoji)
                                                }
                                                onReplySelect={() => openThread(item)}
                                                reactions={reactionsFor(item)}
                                                replyCount={item.replyCount}
                                                time={item.time}
                                                tone={item.tone}
                                            >
                                                <For each={item.serverMessage?.attachments}>
                                                    {(file) => (
                                                        <a
                                                            aria-label={`Download ${file.originalName ?? "attachment"}`}
                                                            href="#"
                                                            onClick={(event) =>
                                                                void downloadFile(file, event)
                                                            }
                                                        >
                                                            <ContextChips
                                                                items={[
                                                                    {
                                                                        id: file.id,
                                                                        kind: "file",
                                                                        label:
                                                                            file.originalName ??
                                                                            "Attachment",
                                                                        detail: formatBytes(
                                                                            file.size,
                                                                        ),
                                                                    },
                                                                ]}
                                                                readOnly
                                                            />
                                                        </a>
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
                    agents={connected ? [] : mentionableAgents}
                    contextItems={composerContext()}
                    disabled={busy() || (connected && !activeConversationId())}
                    hint={liveComposerHint()}
                    onAttachFile={connected ? () => fileInput?.click() : undefined}
                    onContextRemove={removeContext}
                    onSend={() => void sendMessage()}
                    onValueChange={updateDraft}
                    placeholder={conversation().composerPlaceholder}
                    sendEnabled={draft().trim().length > 0 || pendingFiles().length > 0}
                    style={{ margin: "0 20px 16px" }}
                    value={draft()}
                />
            </AppShell>
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
