import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
    AgentTracePanel,
    AppShell,
    Button,
    Lightbox,
    ModalOverlay,
    Sidebar,
    type ContextItem,
} from "./ChatPageComponents.js";
import type {
    AgentActivityState,
    AgentTraceStore,
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
    composerAudienceHint,
    composerHint,
    entriesProject,
    formatBytes,
    identityInitials,
    messagesGrouped,
    mutationId,
    toneFor,
    type Conversation,
    type LiveThreadMessage,
    type WorkspaceEntry,
} from "./chatPageModels.js";
import { ChatMessageEntry } from "./ChatMessageEntry.js";
import { ChatAgentCreateDialog } from "./ChatAgentCreateDialog.js";
import { ChatChannelCreateDialog } from "./ChatChannelCreateDialog.js";
import { ChatDirectoryDialog } from "./ChatDirectoryDialog.js";
import { ChatDirectMessageDialog } from "./ChatDirectMessageDialog.js";
import { ChatMessageEditDialog } from "./ChatMessageEditDialog.js";
import { ChatInfoPanel } from "./ChatInfoPanel.js";
import { ChatThreadPanel } from "./ChatThreadPanel.js";
import { ChatWorkspaceEditor } from "./ChatWorkspaceEditor.js";
import { ChatWorkspacePanel } from "./ChatWorkspacePanel.js";
import { useChatWorkspaceModel } from "./chatWorkspaceModel.js";
import { useChatMessageMediaModel } from "./chatMessageMediaModel.js";
import { ChatConversation } from "./ChatConversation.js";
import { chatSidebarModelCreate } from "./chatSidebarModel.js";
import { useChatInfoModel } from "./chatInfoModel.js";
import { chatMessageActionsModelCreate } from "./chatMessageActionsModel.js";
import { chatCreationModelCreate, useChatCreateRequest } from "./chatCreationModel.js";
import { chatChannelModelCreate } from "./chatChannelModel.js";
import {
    useAvatarImages,
    createAvatarProjection,
    useOptionalStoreSnapshot,
    useStoreSnapshot,
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
    trace?: AgentTraceStore;
    workspace?: WorkspaceStore;
    workspaceFile?: WorkspaceFileStore;
    actions: ChatPageActions;
    navigation: ChatPageNavigation;
    search: string;
    createRequest?: {
        kind: "agent" | "channel";
        nonce: number;
    };
    rail: ReactNode;
    titleBar: ReactNode;
    /** Shows the administration entry when effective permissions expose a section. */
    canOpenAdmin?: boolean;
};
export type ChatPageConversationKind = "chat" | "channel";
export type ChatPagePanel =
    | {
          readonly kind: "info";
      }
    | {
          readonly kind: "profile";
          readonly userId: string;
      }
    | {
          readonly kind: "thread";
          readonly rootMessageId: string;
      }
    | {
          readonly kind: "trace";
          readonly messageId: string;
      }
    | {
          readonly kind: "workspace";
      };
export interface ChatPageNavigation {
    readonly chatId?: string;
    readonly panel?: ChatPagePanel;
    readonly workspaceFilePath?: string;
}
export interface ChatPageActions {
    adminOpen(): void;
    chatSelect(chatId: string, kind: ChatPageConversationKind, replace?: boolean): void;
    infoOpen(): void;
    profileOpen(userId: string): void;
    panelClose(): void;
    threadOpen(rootMessageId: string): void;
    threadClose(): void;
    traceOpen(messageId: string): void;
    traceClose(): void;
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
    channelDefaultAgentUpdate(chatId: string, agentUserId: string): Promise<void>;
    agentCreate(input: import("happy2-state").CreateAgentInput): Promise<void>;
    directMessageCreate(userId: string): Promise<void>;
}
export function ChatPage(props: ChatPageProps) {
    const user = () => props.user;
    const avatarImages = useAvatarImages(props.actions);
    const sidebarState = useStoreSnapshot(props.sidebar);
    const directoryState = useStoreSnapshot(props.directory);
    const chatState = useOptionalStoreSnapshot(props.chat);
    const composerState = useOptionalStoreSnapshot(props.composer);
    const threadState = useOptionalStoreSnapshot(props.thread);
    const traceState = useOptionalStoreSnapshot(props.trace);
    const sidebarSnapshot = () => sidebarState;
    const directorySnapshot = () => directoryState;
    const chatSnapshot = () => chatState;
    const composerSnapshot = () => composerState;
    const threadSnapshot = () => threadState;
    const traceSnapshot = () => traceState;
    const [threadDraftState, setThreadDraftState] = useState<{
        rootMessageId?: string;
        text: string;
    }>({ text: "" });
    const [statusHint, setStatusHint] = useState<string>();
    function showError(error: unknown) {
        setStatusHint(error instanceof Error ? error.message : "Something went wrong.");
    }
    const [busyCount, setBusyCount] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [agentCreateOpen, setAgentCreateOpen] = useState(false);
    const [directoryOpen, setDirectoryOpen] = useState(false);
    const [directMessageOpen, setDirectMessageOpen] = useState(false);
    const [messageEdit, setMessageEdit] = useState<{
        chatId: string;
        error?: string;
        initialText: string;
        messageId: string;
        revision: number;
    }>();
    const [activityNow, setActivityNow] = useState(() => Date.now());
    const pendingSelection = useRef<
        | undefined
        | {
              kind: "channel";
              name: string;
          }
        | {
              kind: "agent";
              username: string;
          }
        | {
              kind: "dm";
              userId: string;
          }
    >(undefined);
    const activeConversationId = () => props.navigation.chatId ?? "";
    const activePanel = () => props.navigation.panel;
    const activeThreadRootId = () => {
        const panel = activePanel();
        return panel?.kind === "thread" ? panel.rootMessageId : undefined;
    };
    const threadDraft =
        threadDraftState.rootMessageId === activeThreadRootId() ? threadDraftState.text : "";
    function setThreadDraft(value: string) {
        setThreadDraftState({ rootMessageId: activeThreadRootId(), text: value });
    }
    const panelMode = (): "info" | "thread" | "trace" | "files" | undefined => {
        const panel = activePanel();
        if (panel?.kind === "thread") return "thread";
        if (panel?.kind === "trace") return "trace";
        if (panel?.kind === "info" || panel?.kind === "profile") return "info";
        return panel?.kind === "workspace" ? "files" : undefined;
    };
    const workspaceModel = useChatWorkspaceModel({
        activeChatId: activeConversationId,
        actions: props.actions,
        openPath: () => props.navigation.workspaceFilePath,
        workspace: props.workspace,
        workspaceFile: props.workspaceFile,
    });
    const mediaModel = useChatMessageMediaModel(props.actions, showError);
    const sentTyping = useRef(false);
    const lastReadMessageId = useRef<string | undefined>(undefined);
    const busy = () => busyCount > 0;
    const startBusy = () => setBusyCount((value) => value + 1);
    const finishBusy = () => setBusyCount((value) => Math.max(0, value - 1));
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
    const entries = entriesProject(
        (chatSnapshot()?.messages ?? []).filter((item) => !item.message.threadRootMessageId),
    );
    const threadEntries = (() => {
        const snapshot = threadSnapshot();
        const root = snapshot?.root;
        return entriesProject([
            ...(root?.type === "ready"
                ? [{ message: root.value, source: "server" as const, delivery: "sent" as const }]
                : []),
            ...(snapshot?.replies ?? []),
        ]);
    })();
    const threadRoot = () =>
        threadEntries.find((entry): entry is LiveThreadMessage => entry.kind === "message");
    const avatarFor = createAvatarProjection({
        user,
        sidebarSnapshot,
        directorySnapshot,
        imageUrl: avatarImages.imageUrl,
    });
    const sidebarModel = chatSidebarModelCreate({
        user,
        activeConversationId,
        search: () => props.search,
        sidebarSnapshot,
        directorySnapshot,
        avatarFor,
    });
    const sidebarSections = sidebarModel.sections;
    const directoryItems = sidebarModel.directoryItems;
    const isServerAdmin = sidebarModel.isServerAdmin;
    const infoModel = useChatInfoModel({
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
        onEdit: (message) => {
            const source = message.serverMessage;
            if (!source) return;
            setMessageEdit({
                chatId: activeConversationId(),
                initialText: source.text,
                messageId: source.id,
                revision: source.revision,
            });
        },
    });
    const creationModel = chatCreationModelCreate({
        actions: props.actions,
        isServerAdmin,
        onBusyStart: startBusy,
        onBusyFinish: finishBusy,
        onError: showError,
    });
    async function channelCreate(input: Parameters<typeof creationModel.channelCreate>[0]) {
        if (!(await creationModel.channelCreate(input))) return;
        pendingSelection.current = { kind: "channel", name: input.name };
        setCreateOpen(false);
    }
    async function agentCreate(name: string, username: string) {
        if (!(await creationModel.agentCreate(name, username))) return;
        pendingSelection.current = { kind: "agent", username };
        setAgentCreateOpen(false);
    }
    async function directMessageStart(userId: string) {
        if (!(await creationModel.directMessageStart(userId))) return;
        pendingSelection.current = { kind: "dm", userId };
        setDirectMessageOpen(false);
    }
    async function messageEditSave(text: string) {
        const edit = messageEdit;
        if (!edit) return;
        startBusy();
        try {
            await props.actions.messageEdit(edit.chatId, edit.messageId, text, edit.revision);
            setMessageEdit(undefined);
        } catch (error) {
            const message = error instanceof Error ? error.message : "Could not edit this message.";
            setMessageEdit((current) =>
                current?.messageId === edit.messageId ? { ...current, error: message } : current,
            );
            showError(error);
        } finally {
            finishBusy();
        }
    }
    useChatCreateRequest({
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
    const conversation: Conversation = (() => {
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
    })();
    const conversationEntries = () =>
        entries.filter((entry) => entry.conversationId === activeConversationId());
    const mentionCandidates = () =>
        directoryUsers().map((person) => ({
            id: person.id,
            initials: identityInitials(person),
            name: person.displayName,
            tone: toneFor(person.id),
        }));
    const directoryAgents = () => directoryUsers().filter((person) => person.kind === "agent");
    const channelAgents = () => {
        const members = chatSnapshot()?.members;
        return members?.type === "ready"
            ? members.value.filter((person) => person.kind === "agent")
            : [];
    };
    const composerAgent = (id: string) => {
        const person =
            directoryUsers().find((candidate) => candidate.id === id) ??
            channelAgents().find((candidate) => candidate.id === id);
        return person
            ? {
                  id: person.id,
                  initials: identityInitials(person),
                  name: person.displayName,
                  tone: toneFor(person.id),
              }
            : undefined;
    };
    const audienceRoutingActive = () =>
        activeChat() !== undefined &&
        activeChat()?.kind !== "dm" &&
        composerSnapshot()?.audience !== undefined;
    const composerDefaultAgent = () => {
        const id = activeChat()?.defaultAgentUserId;
        return id ? composerAgent(id) : undefined;
    };
    const messageAudienceLabel = (message: LiveThreadMessage): string | undefined => {
        if (activeChat()?.kind === "dm") return undefined;
        const server = message.serverMessage;
        if (server?.audience !== "agents") return undefined;
        const ids = server.agentUserIds;
        const first = ids.length
            ? directoryUsers().find((person) => person.id === ids[0])
            : undefined;
        if (!first) return "To agents";
        return ids.length > 1
            ? `To agents · ${first.displayName} + ${ids.length - 1}`
            : `To agents · ${first.displayName}`;
    };
    const composerContext: ContextItem[] = pendingAttachments().map((file) => ({
        id: `file:${file.id}`,
        kind: "file",
        label: file.name,
        detail: formatBytes(file.size),
    }));
    const typingActor = () => chatSnapshot()?.typing.find((typing) => typing.userId !== user()?.id);
    const liveComposerHint = () => {
        const actor = typingActor();
        const person = actor && directoryUsers().find((candidate) => candidate.id === actor.userId);
        return person
            ? `${person.displayName} is typing…`
            : (statusHint ?? (audienceRoutingActive() ? composerAudienceHint : composerHint));
    };
    const activeAgentActivity = (): readonly DeepReadonly<AgentActivityState>[] =>
        chatSnapshot()?.agentActivity ?? [];
    const activeTraceMessageId = () => {
        const panel = activePanel();
        return panel?.kind === "trace" ? panel.messageId : undefined;
    };
    const traceDetails = () => {
        const snapshot = traceSnapshot();
        return snapshot?.trace.type === "ready" ? snapshot.trace.value : undefined;
    };
    const traceAgentName = () => {
        const details = traceDetails();
        const person = details
            ? directoryUsers().find((candidate) => candidate.id === details.agentUserId)
            : undefined;
        return person ? `${person.displayName} activity` : "Agent activity";
    };
    function selectConversation(id: string, replace = false) {
        pendingSelection.current = undefined;
        const projection = sidebarChats().find((candidate) => candidate.id === id);
        if (!projection) return;
        props.actions.chatSelect(id, projection.chat.kind === "dm" ? "chat" : "channel", replace);
    }
    useLayoutEffect(() => {
        const chats = sidebarChats();
        const pending = pendingSelection.current;
        if (pending) {
            const match = chats.find((projection) => {
                if (pending.kind === "channel") return projection.chat.name === pending.name;
                const peer = projection.participants.find((person) => person.id !== user()?.id);
                return pending.kind === "agent"
                    ? peer?.username === pending.username
                    : peer?.id === pending.userId;
            });
            if (match) {
                if (activeConversationId() !== match.id) selectConversation(match.id);
                return;
            }
            return;
        }
        if (!activeConversationId() && chats.length) selectConversation(chats[0]!.id, true);
    });
    useLayoutEffect(() => {
        const snapshot = chatSnapshot();
        const latest = [...(snapshot?.messages ?? [])]
            .reverse()
            .find((item) => item.source === "server" && !item.message.threadRootMessageId);
        if (!latest || latest.message.id === lastReadMessageId.current) return;
        lastReadMessageId.current = latest.message.id;
        void props.actions.chatReadMark(snapshot!.chatId, latest.message.id).catch(showError);
    });
    const activityCount = chatState?.agentActivity.length ?? 0;
    useLayoutEffect(() => {
        if (activityCount === 0) return;
        const timer = setInterval(() => setActivityNow(Date.now()), 1000);
        return () => clearInterval(timer);
    }, [activityCount]);
    function updateDraft(value: string) {
        props.composer?.getState().textUpdate(value);
        const chatId = activeConversationId();
        const active = value.trim().length > 0;
        if (!chatId || active === sentTyping.current) return;
        sentTyping.current = active;
        props.actions.typingSet(chatId, active);
    }
    function sendMessage() {
        if (!draft().trim() && pendingAttachments().length === 0) return;
        if (activeChat()?.kind === "public_channel" && !activeChat()?.membershipRole)
            void props.actions
                .chatJoin(activeConversationId())
                .then(() => props.composer?.getState().textSubmit(), showError);
        else props.composer?.getState().textSubmit();
        if (sentTyping.current) props.actions.typingSet(activeConversationId(), false);
        sentTyping.current = false;
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
                props.composer.getState().attachmentAdd({
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
        const text = threadDraft.trim();
        if (!text) return;
        props.thread?.getState().textSubmit({ text, clientMutationId: mutationId() });
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
    const typingChatId = props.navigation.chatId;
    useLayoutEffect(
        () => () => {
            if (sentTyping.current && typingChatId) props.actions.typingSet(typingChatId, false);
        },
        [props.actions, typingChatId],
    );
    return (
        <>
            <AppShell
                titleBar={props.titleBar}
                rail={props.rail}
                sidebar={
                    <Sidebar
                        activeItemId={activeConversationId()}
                        footer={
                            props.canOpenAdmin ? (
                                <Button
                                    className="happy2-chat-page__admin-link"
                                    fullWidth
                                    icon="settings"
                                    onClick={props.actions.adminOpen}
                                    size="small"
                                    variant="ghost"
                                >
                                    Administration
                                </Button>
                            ) : null
                        }
                        onCompose={() => setDirectMessageOpen(true)}
                        onItemSelect={selectConversation}
                        onSectionAction={(sectionId) => {
                            if (sectionId === "agents") setAgentCreateOpen(true);
                            if (sectionId === "channels") setDirectoryOpen(true);
                            if (sectionId === "dms") setDirectMessageOpen(true);
                        }}
                        sections={sidebarSections}
                        title={user() ? `${user()!.firstName}’s Happy (2)` : "Happy (2)"}
                    />
                }
                panel={
                    panelMode() === "thread" ? (
                        <ChatThreadPanel
                            draft={threadDraft}
                            mentions={mentionCandidates()}
                            onDraftChange={setThreadDraft}
                            onClose={() => {
                                props.actions.threadClose();
                            }}
                            onSend={sendThreadReply}
                            pending={busy()}
                            rootAuthor={threadRoot()?.author}
                        >
                            {threadEntries.map((entry, index) =>
                                renderEntry(entry, index, threadEntries),
                            )}
                        </ChatThreadPanel>
                    ) : panelMode() === "trace" ? (
                        ((trace) => (
                            <AgentTracePanel
                                entries={traceDetails()?.entries ?? []}
                                entryCount={traceDetails()?.entryCount ?? 0}
                                error={trace?.type === "error" ? trace.error.message : undefined}
                                loading={
                                    !trace || (trace.type !== "ready" && trace.type !== "error")
                                }
                                onClose={props.actions.traceClose}
                                status={traceDetails()?.status ?? "pending"}
                                title={traceAgentName()}
                            />
                        ))(traceSnapshot()?.trace)
                    ) : panelMode() === "info" ? (
                        <ChatInfoPanel
                            about={conversation.topic}
                            autoJoin={infoModel.autoJoin}
                            busy={busy()}
                            canChangeEffort={infoModel.canChangeEffort()}
                            canEdit={canEditChannel()}
                            channelName={infoModel.channelName}
                            channelTopic={infoModel.channelTopic}
                            defaultAgentOptions={
                                canEditChannel()
                                    ? directoryAgents().map((person) => ({
                                          label: person.displayName,
                                          value: person.id,
                                      }))
                                    : undefined
                            }
                            defaultAgentUserId={activeChat()?.defaultAgentUserId}
                            effortBusy={infoModel.effortBusy()}
                            effortError={infoModel.effortError()}
                            effortOptions={infoModel.effortOptions()}
                            effortValue={infoModel.effortValue()}
                            isAgent={Boolean(infoModel.agent())}
                            isMain={Boolean(activeChat()?.isMain)}
                            isServerAdmin={isServerAdmin()}
                            members={infoModel.members}
                            onClose={props.actions.panelClose}
                            onAutoJoinChange={infoModel.setAutoJoin}
                            onChannelNameChange={infoModel.setChannelName}
                            onChannelTopicChange={infoModel.setChannelTopic}
                            onDefaultAgentChange={
                                canEditChannel()
                                    ? (agentUserId) => {
                                          startBusy();
                                          props.actions
                                              .channelDefaultAgentUpdate(
                                                  activeConversationId(),
                                                  agentUserId,
                                              )
                                              .then(
                                                  () => setStatusHint("Default agent updated."),
                                                  showError,
                                              )
                                              .finally(finishBusy);
                                      }
                                    : undefined
                            }
                            onEffortChange={infoModel.effortChange}
                            onSave={() => void infoModel.save()}
                            peer={Boolean(infoModel.peer())}
                            profile={displayedProfile()}
                            profileOverride={routedProfile()}
                            title={conversation.title}
                        />
                    ) : panelMode() === "files" ? (
                        <ChatWorkspacePanel
                            loading={workspaceModel.workspaceSnapshot()?.status.type === "loading"}
                            nodes={workspaceModel.tree}
                            note={
                                workspaceModel.workspace()?.gitStatusPending
                                    ? "Checking git status…"
                                    : undefined
                            }
                            onClose={toggleFilesPanel}
                            onLoadMore={workspaceModel.directoryMore}
                            onSelect={workspaceModel.entrySelect}
                            onToggle={workspaceModel.directoryToggle}
                            selectedId={workspaceModel.selected}
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
                    activityNow={activityNow}
                    busy={busy()}
                    composerAgentOptions={
                        audienceRoutingActive()
                            ? channelAgents().map((person) => ({
                                  id: person.id,
                                  initials: identityInitials(person),
                                  name: person.displayName,
                                  tone: toneFor(person.id),
                              }))
                            : undefined
                    }
                    composerAudience={
                        audienceRoutingActive() ? composerSnapshot()?.audience : undefined
                    }
                    composerDefaultAgent={
                        audienceRoutingActive() ? composerDefaultAgent() : undefined
                    }
                    composerDisabled={!activeConversationId()}
                    composerHint={liveComposerHint()}
                    composerMentions={mentionCandidates()}
                    composerPending={composerSnapshot()?.submission.status === "pending" || busy()}
                    composerSelectedAgentIds={
                        audienceRoutingActive()
                            ? [...(composerSnapshot()?.agentUserIds ?? [])]
                            : undefined
                    }
                    composerSendEnabled={
                        draft().trim().length > 0 || pendingAttachments().length > 0
                    }
                    composerValue={draft()}
                    contextItems={composerContext}
                    conversation={conversation}
                    directoryUsers={directoryUsers()}
                    joinVisible={Boolean(
                        activeChat()?.kind !== "dm" &&
                        activeChat() &&
                        !activeChat()?.membershipRole,
                    )}
                    menuItems={activeConversationId() ? channelModel.menuItems() : undefined}
                    messageEntries={conversationEntries().map((entry, index, list) =>
                        renderEntry(entry, index, list),
                    )}
                    onAgentAdd={(agentId) => props.composer?.getState().agentUserAdd(agentId)}
                    onAgentRemove={(agentId) => props.composer?.getState().agentUserRemove(agentId)}
                    onAudienceChange={(audience) =>
                        props.composer?.getState().audienceUpdate(audience)
                    }
                    onContextRemove={(id) =>
                        props.composer?.getState().attachmentRemove(id.replace(/^file:/u, ""))
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
            {workspaceModel.openPath() ? (
                <ChatWorkspaceEditor
                    banner={workspaceModel.fileBanner()}
                    content={workspaceModel.fileContent()}
                    dirty={workspaceModel.fileDirty()}
                    onClose={workspaceModel.fileClose}
                    onContentChange={(value) =>
                        props.workspaceFile?.getState().contentUpdate(value)
                    }
                    onRevert={() =>
                        props.workspaceFile
                            ?.getState()
                            .contentUpdate(workspaceModel.fileBase()?.content ?? "")
                    }
                    onSave={() => props.workspaceFile?.getState().contentSave()}
                    path={workspaceModel.openPath()!}
                    saving={workspaceModel.fileSaving()}
                    status={workspaceModel.fileStatus()}
                />
            ) : null}
            {directoryOpen ? (
                <ChatDirectoryDialog
                    items={directoryItems}
                    onChannelCreate={() => {
                        setDirectoryOpen(false);
                        setCreateOpen(true);
                    }}
                    onClose={() => setDirectoryOpen(false)}
                    onSelect={previewDirectoryChannel}
                />
            ) : null}
            {directMessageOpen ? (
                <ChatDirectMessageDialog
                    busy={busy()}
                    onClose={() => setDirectMessageOpen(false)}
                    onSelect={(userId) => void directMessageStart(userId)}
                    users={directoryUsers().filter(
                        (candidate) => candidate.id !== user().id && candidate.kind === "human",
                    )}
                />
            ) : null}
            {messageEdit ? (
                <ChatMessageEditDialog
                    busy={busy()}
                    error={messageEdit.error}
                    initialText={messageEdit.initialText}
                    key={messageEdit.messageId}
                    onClose={() => setMessageEdit(undefined)}
                    onSave={(text) => void messageEditSave(text)}
                />
            ) : null}
            {agentCreateOpen ? (
                <ChatAgentCreateDialog
                    busy={busy()}
                    onClose={() => setAgentCreateOpen(false)}
                    onCreate={(name, username) => void agentCreate(name, username)}
                />
            ) : null}
            {createOpen ? (
                <ChatChannelCreateDialog
                    busy={busy()}
                    isServerAdmin={isServerAdmin()}
                    onClose={() => setCreateOpen(false)}
                    onCreate={(input) => void channelCreate(input)}
                />
            ) : null}
            {mediaModel.lightbox
                ? ((image) => (
                      <ModalOverlay onDismiss={mediaModel.closeLightbox}>
                          <Lightbox
                              alt={image.caption}
                              caption={image.caption}
                              detail={image.detail}
                              imageUrl={image.url}
                              onClose={mediaModel.closeLightbox}
                          />
                      </ModalOverlay>
                  ))(mediaModel.lightbox)
                : null}
        </>
    );
    function renderEntry(
        entry: WorkspaceEntry,
        index: number,
        list: readonly WorkspaceEntry[],
    ): ReactNode {
        const message = entry.kind === "message" ? entry : undefined;
        return (
            <ChatMessageEntry
                key={entry.id}
                entry={entry}
                audienceLabel={message ? messageAudienceLabel(message) : undefined}
                avatarUrl={avatarFor(message?.senderId, message?.photoFileId)}
                files={message ? mediaModel.files(message) : []}
                grouped={message ? messagesGrouped(list, index, message) : false}
                images={message ? mediaModel.images(message) : []}
                menuItems={message ? messageActions.menuItems(message) : []}
                profile={message ? infoModel.messageProfile(message) : undefined}
                onImageOpen={(message, id) => void mediaModel.imageOpen(message, id)}
                onMenuSelect={(message, action) => void messageActions.menuSelect(message, action)}
                onProfileOpen={infoModel.open}
                onReactionSelect={(message, emoji) =>
                    void messageActions.reactionToggle(message, emoji)
                }
                onReplySelect={openThread}
                onTraceSelect={(message) => props.actions.traceOpen(message.id)}
                traceOpen={message ? activeTraceMessageId() === message.id : false}
            />
        );
    }
}
