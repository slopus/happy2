import {
    For,
    Show,
    createEffect,
    createMemo,
    createSignal,
    onCleanup,
    type Accessor,
    type JSX,
} from "solid-js";
import {
    AppShell,
    Lightbox,
    ModalOverlay,
    Sidebar,
    type ContextItem,
} from "./ChatPageComponents.js";
import type {
    AgentActivityState,
    ChatSummary,
    ChatStore,
    ComposerStore,
    DeepReadonly,
    DirectoryStore,
    DirectoryUserProjection,
    SidebarStore,
    SidebarChatProjection,
    ThreadStore,
    WorkspaceStore,
    WorkspaceFileStore,
} from "happy2-state";
import {
    composerHint,
    entriesProjectorCreate,
    formatBytes,
    identityInitials,
    messagesGrouped,
    mutationId,
    toneFor,
    type Conversation,
    type LiveThreadMessage,
    type WorkspaceEntrySlot,
} from "./chatPageModels.js";
import { ChatMessageEntry } from "./ChatMessageEntry.js";
import { ChatAgentCreateDialog } from "./ChatAgentCreateDialog.js";
import { ChatChannelCreateDialog } from "./ChatChannelCreateDialog.js";
import { ChatDirectoryDialog } from "./ChatDirectoryDialog.js";
import { ChatInfoPanel } from "./ChatInfoPanel.js";
import { ChatThreadPanel } from "./ChatThreadPanel.js";
import { ChatWorkspaceEditor } from "./ChatWorkspaceEditor.js";
import { ChatWorkspacePanel } from "./ChatWorkspacePanel.js";
import { chatWorkspaceModelCreate } from "./chatWorkspaceModel.js";
import { chatMessageMediaModelCreate } from "./chatMessageMediaModel.js";
import { ChatConversation } from "./ChatConversation.js";
import { chatSidebarModelCreate } from "./chatSidebarModel.js";
import { chatInfoModelCreate } from "./chatInfoModel.js";
import { chatMessageActionsModelCreate } from "./chatMessageActionsModel.js";
import { chatCreationModelCreate, chatCreateRequestFollow } from "./chatCreationModel.js";
import { chatChannelModelCreate } from "./chatChannelModel.js";
import {
    createAvatarImages,
    createAvatarProjection,
    createDynamicSnapshot,
    createStoreSnapshot,
} from "./chatStoreBindings.js";

export interface ChatPageUser {
    readonly id: string;
    readonly firstName: string;
    readonly photoFileId?: string;
}

export type ChatPageProps = {
    user: ChatPageUser;
    sidebar: SidebarStore;
    directory: DirectoryStore;
    chat?: ChatStore;
    composer?: ComposerStore;
    thread?: ThreadStore;
    workspace?: WorkspaceStore;
    workspaceFile?: WorkspaceFileStore;
    actions: ChatPageActions;
    navigation: ChatPageNavigation;
    search: () => string;
    createRequest?: () => { kind: "agent" | "channel"; nonce: number };
    rail: JSX.Element;
    titleBar: JSX.Element;
};

export type ChatPageConversationKind = "chat" | "channel";

export type ChatPagePanel =
    | { readonly kind: "info" }
    | { readonly kind: "profile"; readonly userId: string }
    | { readonly kind: "thread"; readonly rootMessageId: string }
    | { readonly kind: "workspace" };

export interface ChatPageNavigation {
    readonly chatId?: string;
    readonly panel?: ChatPagePanel;
    readonly workspaceFilePath?: string;
}

export interface ChatPageActions {
    chatSelect(chatId: string, kind: ChatPageConversationKind, replace?: boolean): void;
    infoOpen(): void;
    profileOpen(userId: string): void;
    panelClose(): void;
    threadOpen(rootMessageId: string): void;
    threadClose(): void;
    workspaceOpen(chatId: string): void;
    workspaceClose(): void;
    workspaceFileOpen(chatId: string, path: string): void;
    workspaceFileReload(chatId: string, path: string): void;
    workspaceFileClose(): void;
    fileUpload(body: FormData): Promise<import("happy2-state").UploadedFile>;
    fileDownload(fileId: string): Promise<ArrayBuffer>;
    filePreviewDownload(fileId: string): Promise<ArrayBuffer>;
    chatReadMark(chatId: string, messageId?: string): Promise<void>;
    typingSet(chatId: string, active: boolean): void;
    reactionAdd(chatId: string, messageId: string, emoji: string): Promise<void>;
    reactionRemove(chatId: string, messageId: string, emoji: string): Promise<void>;
    messageEdit(chatId: string, messageId: string, text: string, revision: number): Promise<void>;
    messageDelete(chatId: string, messageId: string): Promise<void>;
    chatJoin(chatId: string): Promise<void>;
    chatLeave(chatId: string): Promise<void>;
    chatStarSet(chatId: string, starred: boolean): Promise<void>;
    channelCreate(input: import("happy2-state").CreateChannelInput): Promise<void>;
    channelUpdate(chatId: string, input: import("happy2-state").ChannelUpdateInput): Promise<void>;
    agentCreate(input: import("happy2-state").CreateAgentInput): Promise<void>;
    directMessageCreate(userId: string): Promise<void>;
}

export function ChatPage(props: ChatPageProps) {
    const user = () => props.user;
    const avatarImages = createAvatarImages(props.actions);
    const sidebarSnapshot = createStoreSnapshot(props.sidebar);
    const directorySnapshot = createStoreSnapshot(props.directory);

    const chatReader = createDynamicSnapshot<ReturnType<ChatStore["get"]>>();
    const composerReader = createDynamicSnapshot<ReturnType<ComposerStore["get"]>>();
    const threadReader = createDynamicSnapshot<ReturnType<ThreadStore["get"]>>();
    createEffect(() => chatReader.follow(props.chat));
    createEffect(() => composerReader.follow(props.composer));
    createEffect(() => threadReader.follow(props.thread));

    const [threadDraft, setThreadDraft] = createSignal("");
    const [statusHint, setStatusHint] = createSignal<string>();
    const [busyCount, setBusyCount] = createSignal(0);
    const [createOpen, setCreateOpen] = createSignal(false);
    const [agentCreateOpen, setAgentCreateOpen] = createSignal(false);
    const [directoryOpen, setDirectoryOpen] = createSignal(false);
    const [activityNow, setActivityNow] = createSignal(Date.now());
    const [pendingSelection, setPendingSelection] = createSignal<
        | { kind: "channel"; name: string }
        | { kind: "agent"; username: string }
        | { kind: "dm"; userId: string }
    >();
    const activeConversationId = () => props.navigation.chatId ?? "";
    const activePanel = () => props.navigation.panel;
    let threadDraftRootId: string | undefined;
    createEffect(() => {
        const panel = activePanel();
        const nextRootId = panel?.kind === "thread" ? panel.rootMessageId : undefined;
        if (nextRootId === threadDraftRootId) return;
        threadDraftRootId = nextRootId;
        setThreadDraft("");
    });
    const panelMode = (): "info" | "thread" | "files" | undefined => {
        const panel = activePanel();
        if (panel?.kind === "thread") return "thread";
        if (panel?.kind === "info" || panel?.kind === "profile") return "info";
        return panel?.kind === "workspace" ? "files" : undefined;
    };
    const workspaceModel = chatWorkspaceModelCreate({
        activeChatId: activeConversationId,
        actions: props.actions,
        openPath: () => props.navigation.workspaceFilePath,
        workspace: props.workspace,
        workspaceFile: props.workspaceFile,
    });
    const mediaModel = chatMessageMediaModelCreate(props.actions, showError);
    let sentTyping = false;
    let lastReadMessageId: string | undefined;

    const busy = () => busyCount() > 0;
    const startBusy = () => setBusyCount((value) => value + 1);
    const finishBusy = () => setBusyCount((value) => Math.max(0, value - 1));
    const chatSnapshot = chatReader.snapshot;
    const composerSnapshot = composerReader.snapshot;
    const threadSnapshot = threadReader.snapshot;

    const sidebarChats = (): readonly DeepReadonly<SidebarChatProjection>[] =>
        sidebarSnapshot().chats;
    const directoryUsers = (): readonly DeepReadonly<DirectoryUserProjection>[] =>
        directorySnapshot().users;
    const activeProjection = () =>
        sidebarChats().find((projection) => projection.id === activeConversationId());
    const activeChat = (): DeepReadonly<ChatSummary> | undefined => {
        const status = chatSnapshot()?.status;
        return status?.type === "ready" ? status.value : activeProjection()?.chat;
    };
    const activePeer = () =>
        activeProjection()?.participants.find((participant) => participant.id !== user()?.id);
    const draft = () => composerSnapshot()?.text ?? "";
    const pendingAttachments = () => composerSnapshot()?.attachments ?? [];
    const projectors = [entriesProjectorCreate(), entriesProjectorCreate()] as const;
    const entries = createMemo<WorkspaceEntrySlot[]>(() =>
        projectors[0].project(
            (chatSnapshot()?.messages ?? []).filter((item) => !item.message.threadRootMessageId),
        ),
    );
    const threadEntries = createMemo<WorkspaceEntrySlot[]>(() => {
        const snapshot = threadSnapshot();
        const root = snapshot?.root;
        return projectors[1].project([
            ...(root?.type === "ready"
                ? [{ message: root.value, source: "server" as const, delivery: "sent" as const }]
                : []),
            ...(snapshot?.replies ?? []),
        ]);
    });
    const threadRoot = () =>
        threadEntries()
            .map((slot) => slot.entry())
            .find((entry): entry is LiveThreadMessage => entry.kind === "message");

    const avatarFor = createAvatarProjection({
        user,
        sidebarSnapshot,
        directorySnapshot,
        imageUrl: avatarImages.imageUrl,
    });

    const sidebarModel = chatSidebarModelCreate({
        user,
        activeConversationId,
        search: props.search,
        sidebarSnapshot,
        directorySnapshot,
        avatarFor,
    });
    const sidebarSections = sidebarModel.sections;
    const directoryItems = sidebarModel.directoryItems;
    const isServerAdmin = sidebarModel.isServerAdmin;
    const infoModel = chatInfoModelCreate({
        activeChat,
        activePeer,
        chatSnapshot,
        chatStore: () => props.chat,
        directoryUsers,
        isServerAdmin,
        actions: props.actions,
        avatarFor,
        onInfoOpen: props.actions.infoOpen,
        onProfileOpen: props.actions.profileOpen,
        onBusyStart: startBusy,
        onBusyFinish: finishBusy,
        onError: showError,
        onSaved: () => setStatusHint("Channel details saved."),
    });
    const routedProfile = () => {
        const panel = activePanel();
        return panel?.kind === "profile" ? infoModel.profileFor(panel.userId) : undefined;
    };
    const displayedProfile = () =>
        activePanel()?.kind === "profile" ? routedProfile() : infoModel.profile();
    const messageActions = chatMessageActionsModelCreate({
        userId: () => user().id,
        activeChatId: activeConversationId,
        actions: props.actions,
        onError: showError,
    });
    const creationModel = chatCreationModelCreate({
        actions: props.actions,
        directoryUsers,
        userId: () => user().id,
        isServerAdmin,
        onBusyStart: startBusy,
        onBusyFinish: finishBusy,
        onError: showError,
        onStatus: setStatusHint,
        onChannelCreated: (name) => {
            setPendingSelection({ kind: "channel", name });
            setCreateOpen(false);
        },
        onAgentCreated: (username) => {
            setPendingSelection({ kind: "agent", username });
            setAgentCreateOpen(false);
        },
        onDirectMessageStarted: (userId) => setPendingSelection({ kind: "dm", userId }),
    });
    chatCreateRequestFollow({
        request: props.createRequest,
        onAgent: () => setAgentCreateOpen(true),
        onChannel: () => setCreateOpen(true),
    });
    const canEditChannel = () => {
        const role = activeChat()?.membershipRole;
        return activeChat()?.kind !== "dm" && (role === "owner" || role === "admin");
    };
    const channelModel = chatChannelModelCreate({
        activeChatId: activeConversationId,
        activeChat,
        sidebarChats,
        canEdit: canEditChannel,
        actions: props.actions,
        onInfoOpen: () => infoModel.open(),
        onLeave: () => props.actions.chatSelect("", "chat"),
        onError: showError,
    });
    const conversation = createMemo<Conversation>(() => {
        const projection = activeProjection();
        const chat = activeChat();
        if (!projection || !chat)
            return {
                id: "empty",
                title: "Your Happy (2)",
                topic: "Create a channel or select a person to start chatting",
                composerPlaceholder: "Message Happy (2)…",
                intro: {
                    title: "No conversation selected",
                    description: "Create a channel or choose a teammate from the sidebar.",
                },
            };
        const title = projection.displayName;
        const agent = projection.participants.some((person) => person.kind === "agent");
        const members = chatSnapshot()?.members;
        const memberCount =
            members?.type === "ready" ? members.value.length : projection.participants.length;
        return {
            id: chat.id,
            title,
            icon: chat.kind === "dm" ? (agent ? "spark" : undefined) : "hash",
            topic:
                chat.topic ??
                (chat.kind === "dm"
                    ? agent
                        ? "Private AI coding agent"
                        : "Direct message"
                    : undefined),
            composerPlaceholder:
                chat.kind === "dm" ? `Message ${title}` : `Message #${chat.slug ?? title}`,
            memberCount,
            members: projection.participants.slice(0, 4).map((person) => ({
                initials: identityInitials(person),
                tone: toneFor(person.id),
            })),
            intro: {
                title: chat.kind === "dm" ? title : `Welcome to #${chat.slug ?? title}`,
                description:
                    chat.topic ??
                    (chat.kind === "dm"
                        ? `This conversation is between you and ${title}.`
                        : "This channel is ready for its first message."),
            },
        };
    });
    const conversationEntries = () =>
        entries().filter((slot) => slot.entry().conversationId === activeConversationId());
    const mentionCandidates = () =>
        directoryUsers().map((person) => ({
            id: person.id,
            initials: identityInitials(person),
            name: person.displayName,
            tone: toneFor(person.id),
        }));
    const composerContext = createMemo<ContextItem[]>(() =>
        pendingAttachments().map((file) => ({
            id: `file:${file.id}`,
            kind: "file",
            label: file.name,
            detail: formatBytes(file.size),
        })),
    );
    const typingActor = () => chatSnapshot()?.typing.find((typing) => typing.userId !== user()?.id);
    const liveComposerHint = () => {
        const actor = typingActor();
        const person = actor && directoryUsers().find((candidate) => candidate.id === actor.userId);
        return person ? `${person.displayName} is typing…` : (statusHint() ?? composerHint);
    };
    const activeAgentActivity = (): readonly DeepReadonly<AgentActivityState>[] =>
        chatSnapshot()?.agentActivity ?? [];

    function selectConversation(id: string, replace = false) {
        const projection = sidebarChats().find((candidate) => candidate.id === id);
        if (!projection) return;
        props.actions.chatSelect(id, projection.chat.kind === "dm" ? "chat" : "channel", replace);
    }

    createEffect(() => {
        const chats = sidebarChats();
        const pending = pendingSelection();
        if (pending) {
            const match = chats.find((projection) => {
                if (pending.kind === "channel") return projection.chat.name === pending.name;
                const peer = projection.participants.find((person) => person.id !== user()?.id);
                return pending.kind === "agent"
                    ? peer?.username === pending.username
                    : peer?.id === pending.userId;
            });
            if (match) {
                setPendingSelection(undefined);
                selectConversation(match.id);
                return;
            }
        }
        if (!activeConversationId() && chats.length) selectConversation(chats[0]!.id, true);
    });

    createEffect(() => {
        const snapshot = chatSnapshot();
        const latest = [...(snapshot?.messages ?? [])]
            .reverse()
            .find((item) => item.source === "server" && !item.message.threadRootMessageId);
        if (!latest || latest.message.id === lastReadMessageId) return;
        lastReadMessageId = latest.message.id;
        void props.actions.chatReadMark(snapshot!.chatId, latest.message.id).catch(showError);
    });

    createEffect(() => {
        if (activeAgentActivity().length === 0) return;
        setActivityNow(Date.now());
        const timer = setInterval(() => setActivityNow(Date.now()), 1_000);
        onCleanup(() => clearInterval(timer));
    });

    function updateDraft(value: string) {
        props.composer?.textUpdate(value);
        const chatId = activeConversationId();
        const active = value.trim().length > 0;
        if (!chatId || active === sentTyping) return;
        sentTyping = active;
        props.actions.typingSet(chatId, active);
    }

    function sendMessage() {
        if (!draft().trim() && pendingAttachments().length === 0) return;
        if (activeChat()?.kind === "public_channel" && !activeChat()?.membershipRole)
            void props.actions
                .chatJoin(activeConversationId())
                .then(() => props.composer?.textSubmit(), showError);
        else props.composer?.textSubmit();
        if (sentTyping) props.actions.typingSet(activeConversationId(), false);
        sentTyping = false;
    }

    async function uploadFiles(files: FileList | null) {
        if (!files?.length || !props.composer) return;
        startBusy();
        try {
            const uploaded = await Promise.all(
                Array.from(files).map((file) => {
                    const body = new FormData();
                    body.set("file", file, file.name);
                    return props.actions.fileUpload(body);
                }),
            );
            for (const file of uploaded)
                props.composer.attachmentAdd({
                    id: file.id,
                    name: file.originalName ?? "Attachment",
                    size: file.size,
                });
        } catch (error) {
            showError(error);
        } finally {
            finishBusy();
        }
    }

    function openThread(message: LiveThreadMessage) {
        setThreadDraft("");
        if (message.serverMessage) props.actions.threadOpen(message.id);
    }

    function sendThreadReply() {
        const text = threadDraft().trim();
        if (!text) return;
        props.thread?.textSubmit({ text, clientMutationId: mutationId() });
        setThreadDraft("");
    }

    function openFilesPanel() {
        workspaceModel.panelOpen();
    }
    function toggleFilesPanel() {
        if (panelMode() === "files") {
            workspaceModel.panelClose();
        } else openFilesPanel();
    }

    function previewDirectoryChannel(id: string) {
        setDirectoryOpen(false);
        selectConversation(id);
    }

    onCleanup(() => {
        if (sentTyping && activeConversationId())
            props.actions.typingSet(activeConversationId(), false);
    });

    function showError(error: unknown) {
        setStatusHint(error instanceof Error ? error.message : "Something went wrong.");
    }
    return (
        <>
            <AppShell
                titleBar={props.titleBar}
                rail={props.rail}
                sidebar={
                    <Sidebar
                        activeItemId={activeConversationId()}
                        onCompose={() => void creationModel.directMessageStart()}
                        onItemSelect={selectConversation}
                        onSectionAction={(sectionId) => {
                            if (sectionId === "agents") setAgentCreateOpen(true);
                            if (sectionId === "channels") setDirectoryOpen(true);
                            if (sectionId === "dms") void creationModel.directMessageStart();
                        }}
                        sections={sidebarSections()}
                        title={user() ? `${user()!.firstName}’s Happy (2)` : "Happy (2)"}
                    />
                }
                panel={
                    panelMode() === "thread" ? (
                        <ChatThreadPanel
                            draft={threadDraft()}
                            mentions={mentionCandidates()}
                            onDraftChange={setThreadDraft}
                            onClose={() => {
                                props.actions.threadClose();
                            }}
                            onSend={sendThreadReply}
                            pending={busy()}
                            rootAuthor={threadRoot()?.author}
                        >
                            <For each={threadEntries()}>{renderEntry}</For>
                        </ChatThreadPanel>
                    ) : panelMode() === "info" ? (
                        <ChatInfoPanel
                            about={conversation().topic}
                            autoJoin={infoModel.autoJoin()}
                            busy={busy()}
                            canChangeEffort={infoModel.canChangeEffort()}
                            canEdit={canEditChannel()}
                            channelName={infoModel.channelName()}
                            channelTopic={infoModel.channelTopic()}
                            effortBusy={infoModel.effortBusy()}
                            effortError={infoModel.effortError()}
                            effortOptions={infoModel.effortOptions()}
                            effortValue={infoModel.effortValue()}
                            isAgent={Boolean(infoModel.agent())}
                            isMain={Boolean(activeChat()?.isMain)}
                            isServerAdmin={isServerAdmin()}
                            members={infoModel.members()}
                            onClose={props.actions.panelClose}
                            onAutoJoinChange={infoModel.setAutoJoin}
                            onChannelNameChange={infoModel.setChannelName}
                            onChannelTopicChange={infoModel.setChannelTopic}
                            onEffortChange={infoModel.effortChange}
                            onSave={() => void infoModel.save()}
                            peer={Boolean(infoModel.peer())}
                            profile={displayedProfile()}
                            profileOverride={routedProfile()}
                            title={conversation().title}
                        />
                    ) : panelMode() === "files" ? (
                        <ChatWorkspacePanel
                            loading={workspaceModel.workspaceSnapshot()?.status.type === "loading"}
                            nodes={workspaceModel.tree()}
                            note={
                                workspaceModel.workspace()?.gitStatusPending
                                    ? "Checking git status…"
                                    : undefined
                            }
                            onClose={toggleFilesPanel}
                            onLoadMore={workspaceModel.directoryMore}
                            onSelect={workspaceModel.entrySelect}
                            onToggle={workspaceModel.directoryToggle}
                            selectedId={workspaceModel.selected()}
                            subtitle={
                                workspaceModel.workspace()
                                    ? `rev ${workspaceModel.workspace()!.revision}`
                                    : undefined
                            }
                        />
                    ) : undefined
                }
            >
                <ChatConversation
                    activeConversationId={activeConversationId()}
                    activities={activeAgentActivity()}
                    activityNow={activityNow()}
                    busy={busy()}
                    composerDisabled={!activeConversationId()}
                    composerHint={liveComposerHint()}
                    composerMentions={mentionCandidates()}
                    composerPending={composerSnapshot()?.submission.status === "pending" || busy()}
                    composerSendEnabled={
                        draft().trim().length > 0 || pendingAttachments().length > 0
                    }
                    composerValue={draft()}
                    contextItems={composerContext()}
                    conversation={conversation()}
                    directoryUsers={directoryUsers()}
                    joinVisible={Boolean(
                        activeChat()?.kind !== "dm" &&
                        activeChat() &&
                        !activeChat()?.membershipRole,
                    )}
                    menuItems={activeConversationId() ? channelModel.menuItems() : undefined}
                    messageEntries={<For each={conversationEntries()}>{renderEntry}</For>}
                    onContextRemove={(id) =>
                        props.composer?.attachmentRemove(id.replace(/^file:/u, ""))
                    }
                    onFilesSelected={(files) => void uploadFiles(files)}
                    onInfoOpen={() => infoModel.open()}
                    onJoin={() => void channelModel.join()}
                    onMenuSelect={channelModel.menuSelect}
                    onSend={sendMessage}
                    onStarToggle={channelModel.starToggle}
                    onValueChange={updateDraft}
                    onWorkspaceToggle={toggleFilesPanel}
                    starred={channelModel.starred()}
                />
            </AppShell>
            <Show when={workspaceModel.openPath()}>
                <ChatWorkspaceEditor
                    banner={workspaceModel.fileBanner()}
                    content={workspaceModel.fileContent()}
                    dirty={workspaceModel.fileDirty()}
                    onClose={workspaceModel.fileClose}
                    onContentChange={(value) => props.workspaceFile?.contentUpdate(value)}
                    onRevert={() =>
                        props.workspaceFile?.contentUpdate(workspaceModel.fileBase()?.content ?? "")
                    }
                    onSave={() => props.workspaceFile?.contentSave()}
                    path={workspaceModel.openPath()!}
                    saving={workspaceModel.fileSaving()}
                    status={workspaceModel.fileStatus()}
                />
            </Show>
            <Show when={directoryOpen()}>
                <ChatDirectoryDialog
                    items={directoryItems()}
                    onChannelCreate={() => {
                        setDirectoryOpen(false);
                        setCreateOpen(true);
                    }}
                    onClose={() => setDirectoryOpen(false)}
                    onSelect={previewDirectoryChannel}
                />
            </Show>
            <Show when={agentCreateOpen()}>
                <ChatAgentCreateDialog
                    busy={busy()}
                    onClose={() => setAgentCreateOpen(false)}
                    onCreate={(name, username) => void creationModel.agentCreate(name, username)}
                />
            </Show>
            <Show when={createOpen()}>
                <ChatChannelCreateDialog
                    busy={busy()}
                    isServerAdmin={isServerAdmin()}
                    onClose={() => setCreateOpen(false)}
                    onCreate={(input) => void creationModel.channelCreate(input)}
                />
            </Show>
            <Show when={mediaModel.lightbox()}>
                {(image) => (
                    <ModalOverlay onDismiss={mediaModel.closeLightbox}>
                        <Lightbox
                            alt={image().caption}
                            caption={image().caption}
                            detail={image().detail}
                            imageUrl={image().url}
                            onClose={mediaModel.closeLightbox}
                        />
                    </ModalOverlay>
                )}
            </Show>
        </>
    );

    function renderEntry(slot: WorkspaceEntrySlot, index: Accessor<number>): JSX.Element {
        const message = () => {
            const entry = slot.entry();
            return entry.kind === "message" ? entry : undefined;
        };
        return (
            <ChatMessageEntry
                entry={slot.entry}
                avatarUrl={avatarFor(message()?.senderId, message()?.photoFileId)}
                files={message() ? mediaModel.files(message()!) : []}
                grouped={
                    message()
                        ? messagesGrouped(
                              panelMode() === "thread" ? threadEntries() : conversationEntries(),
                              index(),
                              message()!,
                          )
                        : false
                }
                images={message() ? mediaModel.images(message()!) : []}
                menuItems={message() ? messageActions.menuItems(message()!) : []}
                profile={message() ? infoModel.messageProfile(message()!) : undefined}
                onImageOpen={(message, id) => void mediaModel.imageOpen(message, id)}
                onMenuSelect={(message, action) => void messageActions.menuSelect(message, action)}
                onProfileOpen={infoModel.open}
                onReactionSelect={(message, emoji) =>
                    void messageActions.reactionToggle(message, emoji)
                }
                onReplySelect={openThread}
            />
        );
    }
}
