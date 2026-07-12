import { createMemo, createSignal, For, Match, onCleanup, onMount, Show, Switch } from "solid-js";
import {
    AgentDesk,
    AgentRunCard,
    AppShell,
    ApprovalCard,
    Avatar,
    Button,
    ChannelHeader,
    Composer,
    ContextChips,
    DayDivider,
    DiffSnippet,
    EventCard,
    Icon,
    Message,
    MessageList,
    Rail,
    Sidebar,
    TitleBar,
    type ApprovalResolution,
    type ContextItem,
    type SidebarSection,
    type ToneName,
} from "rigged-ui";
import { AuthGate, type AuthSession } from "./components/AuthGate";
import {
    chatSections,
    composerHint,
    conversations,
    deskDone,
    deskQueued,
    deskRunning,
    featureEmptyStates,
    initialEntries,
    mentionableAgents,
    railItems,
    type Conversation,
    type ThreadDivider,
    type ThreadMessage,
} from "./mockData";
import type {
    ChatSummary,
    FileSummary,
    MessageSummary,
    PresenceSnapshot,
    UploadedFile,
    UserSummary,
} from "./server";

type AppProps = {
    platform?: "desktop" | "web";
    serverUrl?: string;
};

type LiveThreadMessage = ThreadMessage & { serverMessage?: MessageSummary };
type WorkspaceEntry = ThreadDivider | LiveThreadMessage;

const asDivider = (entry: WorkspaceEntry): ThreadDivider | undefined =>
    entry.kind === "divider" ? entry : undefined;
const asMessage = (entry: WorkspaceEntry): LiveThreadMessage | undefined =>
    entry.kind === "message" ? entry : undefined;

const tones: ToneName[] = ["violet", "ember", "mint", "ocean", "rose", "amber", "slate"];

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

function toThreadMessage(message: MessageSummary): LiveThreadMessage {
    const sender = message.sender;
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

function toEntries(messages: MessageSummary[]): WorkspaceEntry[] {
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
        result.push(toThreadMessage(message));
    }
    return result;
}

function Workspace(props: AppProps & { session?: AuthSession }) {
    const connected = Boolean(props.session);
    const [activeFeatureId, setActiveFeatureId] = createSignal("chat");
    const [activeConversationId, setActiveConversationId] = createSignal(
        connected ? "" : "launch-week",
    );
    const [search, setSearch] = createSignal("");
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
    let fileInput: HTMLInputElement | undefined;
    let requestNumber = 0;
    let realtimeCleanup: (() => void) | undefined;
    let realtimeRetry: ReturnType<typeof setTimeout> | undefined;
    let refreshTimer: ReturnType<typeof setTimeout> | undefined;
    let typingTimer: ReturnType<typeof setTimeout> | undefined;
    let sentTyping = false;

    const busy = () => busyCount() > 0;
    const startBusy = () => setBusyCount((count) => count + 1);
    const finishBusy = () => setBusyCount((count) => Math.max(0, count - 1));

    const user = () => props.session?.user;
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
    const emptyState = () => featureEmptyStates[activeFeatureId()] ?? featureEmptyStates["home"]!;
    const filteredSidebar = createMemo(() => {
        const needle = search().trim().toLowerCase();
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
        const session = props.session;
        if (!session) return;
        try {
            const [chatResponse, contactResponse] = await Promise.all([
                session.client.chats(session.token),
                session.client.contacts(session.token),
            ]);
            const chats = chatResponse.chats;
            const peers: Record<string, UserSummary> = {};
            await Promise.all(
                chats
                    .filter((chat) => chat.kind === "dm")
                    .map(async (chat) => {
                        const response = await session.client.chatMembers(chat.id, session.token);
                        const peer = response.users.find((item) => item.id !== session.user.id);
                        if (peer) peers[chat.id] = peer;
                    }),
            );
            const snapshots = Object.fromEntries(
                contactResponse.presence.map((item) => [item.userId, item]),
            );
            setServerChats(chats);
            setContacts(contactResponse.users);
            setDmPeers(peers);
            setPresence(snapshots);
            applyNavigation(chats, contactResponse.users, peers, snapshots);

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
        const session = props.session;
        if (!session || !chatId) return;
        const currentRequest = ++requestNumber;
        startBusy();
        try {
            const membersPromise = session.client.chatMembers(chatId, session.token);
            let messages: MessageSummary[];
            if (rootMessageId) {
                const history = await session.client.thread(rootMessageId, session.token, {
                    limit: 100,
                });
                messages = [history.root, ...history.messages];
            } else {
                messages = (await session.client.messages(chatId, session.token, { limit: 100 }))
                    .messages;
            }
            const members = await membersPromise;
            if (currentRequest !== requestNumber) return;
            setEntries(toEntries(messages));
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
        setDraft("");
        setPendingFiles([]);
        setThreadRootId(undefined);
        if (!props.session) {
            setActiveConversationId(id);
            return;
        }
        await stopTyping();
        if (id.startsWith("contact:")) {
            startBusy();
            try {
                const response = await props.session.client.createDirectMessage(
                    id.slice("contact:".length),
                    props.session.token,
                );
                await refreshWorkspace(response.chat.id);
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
        const session = props.session;
        if (!session) return;
        const name = window.prompt("Channel name")?.trim();
        if (!name) return;
        const slug = name
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "")
            .slice(0, 64);
        if (!slug) {
            setStatusHint("Channel names need at least one letter or number.");
            return;
        }
        startBusy();
        try {
            const response = await session.client.createChannel(
                { kind: "public_channel", name, slug },
                session.token,
            );
            await refreshWorkspace(response.chat.id);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    function updateDraft(value: string) {
        setDraft(value);
        const session = props.session;
        const chatId = activeConversationId();
        if (!session || !chatId) return;
        const active = value.trim().length > 0;
        if (active === sentTyping) return;
        sentTyping = active;
        void session.client.setTyping(chatId, active, session.token).catch(() => undefined);
    }

    async function stopTyping() {
        const session = props.session;
        const chatId = activeConversationId();
        if (!session || !chatId || !sentTyping) return;
        sentTyping = false;
        await session.client.setTyping(chatId, false, session.token).catch(() => undefined);
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
        const attachments = pendingFiles();
        if (!chatId || (!body && attachments.length === 0)) return;
        startBusy();
        try {
            const chat = activeChat();
            if (chat?.kind === "public_channel" && !chat.membershipRole) {
                const joined = await props.session.client.joinChat(chatId, props.session.token);
                setServerChats((current) =>
                    current.map((item) => (item.id === joined.chat.id ? joined.chat : item)),
                );
            }
            const input = {
                text: body,
                attachmentFileIds: attachments.map((file) => file.id),
                clientMutationId: mutationId(),
            };
            const response = threadRootId()
                ? await props.session.client.sendThreadMessage(
                      threadRootId()!,
                      input,
                      props.session.token,
                  )
                : await props.session.client.sendMessage(chatId, input, props.session.token);
            setDraft("");
            setPendingFiles([]);
            await stopTyping();
            setEntries((current) => {
                const messages = current
                    .filter((entry): entry is LiveThreadMessage => entry.kind === "message")
                    .flatMap((entry) => (entry.serverMessage ? [entry.serverMessage] : []))
                    .filter((message) => message.id !== response.message.id);
                messages.push(response.message);
                messages.sort(
                    (left, right) =>
                        Number(left.sequence) - Number(right.sequence) ||
                        left.createdAt.localeCompare(right.createdAt),
                );
                return toEntries(messages);
            });
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    async function toggleReaction(message: LiveThreadMessage, emoji: string) {
        if (!props.session || !message.serverMessage) {
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
                ? await props.session.client.removeReaction(message.id, emoji, props.session.token)
                : await props.session.client.addReaction(message.id, emoji, props.session.token);
            setEntries((current) =>
                current.map((entry) =>
                    entry.kind === "message" && entry.id === message.id
                        ? toThreadMessage(response.message)
                        : entry,
                ),
            );
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    async function uploadFiles(files: FileList | null) {
        if (!props.session || !files?.length) return;
        startBusy();
        setStatusHint(
            `Uploading ${files.length === 1 ? files[0]!.name : `${files.length} files`}…`,
        );
        try {
            const uploaded = await Promise.all(
                Array.from(files).map((file) =>
                    props.session!.client.uploadFile(file, props.session!.token),
                ),
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
        if (!props.session) return;
        const download = window.open("about:blank", "_blank");
        if (download) download.opener = null;
        try {
            const response = await props.session.client.createFileUrl(file.id, props.session.token);
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

    function scheduleRefresh() {
        if (refreshTimer) clearTimeout(refreshTimer);
        refreshTimer = setTimeout(() => void refreshWorkspace(), 80);
    }

    function connectRealtime() {
        const session = props.session;
        if (!session) return;
        realtimeCleanup?.();
        realtimeCleanup = session.client.subscribe(
            session.token,
            (event) => {
                if (event.type === "sync") scheduleRefresh();
                if (event.type === "presence") {
                    setPresence((current) => ({
                        ...current,
                        [event.snapshot.userId]: event.snapshot,
                    }));
                    applyNavigation(serverChats(), contacts(), dmPeers(), {
                        ...presence(),
                        [event.snapshot.userId]: event.snapshot,
                    });
                }
                if (event.type === "typing" && event.userId !== session.user.id) {
                    if (typingTimer) clearTimeout(typingTimer);
                    setTypingUser(
                        event.active ? { chatId: event.chatId, userId: event.userId } : undefined,
                    );
                    if (event.active) {
                        typingTimer = setTimeout(() => setTypingUser(undefined), 10_000);
                    }
                }
            },
            () => {
                realtimeRetry = setTimeout(connectRealtime, 2_000);
            },
        );
    }

    onMount(() => {
        if (!props.session) return;
        void refreshWorkspace();
        connectRealtime();
    });
    onCleanup(() => {
        realtimeCleanup?.();
        if (realtimeRetry) clearTimeout(realtimeRetry);
        if (refreshTimer) clearTimeout(refreshTimer);
        if (typingTimer) clearTimeout(typingTimer);
        void stopTyping();
    });

    return (
        <AppShell
            titleBar={
                <TitleBar
                    onSearchChange={setSearch}
                    searchPlaceholder="Search Rigged…"
                    searchValue={search()}
                    showWindowControls={props.platform === "desktop"}
                    trailing={
                        <>
                            <Button
                                aria-label="History"
                                icon="clock"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                            <Button
                                aria-label="Settings"
                                icon="settings"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        </>
                    }
                />
            }
            rail={
                <Rail
                    activeItemId={activeFeatureId()}
                    footer={
                        <Avatar
                            aria-label={`${userName()} — online`}
                            imageUrl={user()?.avatarUrl}
                            initials={userInitials()}
                            online
                            size="md"
                            tone="brand"
                        />
                    }
                    items={railItems}
                    onItemSelect={setActiveFeatureId}
                />
            }
            sidebar={
                activeFeatureId() === "chat" ? (
                    <Sidebar
                        activeItemId={activeConversationId()}
                        footer={
                            <div class="sidebar-user">
                                <Avatar
                                    imageUrl={user()?.avatarUrl}
                                    initials={userInitials()}
                                    online
                                    size="sm"
                                    tone="brand"
                                />
                                <span class="sidebar-user-name">{userName()}</span>
                                <span class="sidebar-user-meta">online</span>
                            </div>
                        }
                        onItemSelect={(id) => void selectConversation(id)}
                        onSectionAction={(sectionId) => {
                            if (sectionId === "channels") void createChannel();
                        }}
                        sections={filteredSidebar()}
                        title={user() ? `${user()!.firstName}’s Rigged` : "Rigged"}
                    />
                ) : undefined
            }
            panel={
                activeFeatureId() === "chat" && !connected ? (
                    <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                ) : undefined
            }
        >
            <Show
                when={activeFeatureId() === "chat"}
                fallback={
                    <div class="feature-empty">
                        <Icon name={emptyState().icon} size={20} />
                        <h2>{emptyState().title}</h2>
                        <p>{emptyState().description}</p>
                    </div>
                }
            >
                <ChannelHeader
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
            </Show>
        </AppShell>
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

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}

export function App(props: AppProps) {
    return props.serverUrl ? (
        <AuthGate serverUrl={props.serverUrl}>
            {(session) => <Workspace {...props} session={session} />}
        </AuthGate>
    ) : (
        <Workspace {...props} />
    );
}
