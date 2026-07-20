import { useLayoutEffect, useRef, useState, type ReactNode } from "react";
import {
    AgentTracePanel,
    AppShell,
    Banner,
    Button,
    Lightbox,
    ModalOverlay,
    PluginPermissionCard,
    Sidebar,
    type ContextItem,
    type SidebarSection,
} from "./ChatPageComponents.js";
import type {
    AgentActivityState,
    AgentModelsStore,
    AgentTraceStore,
    ChatSummary,
    ChatStore,
    ComposerStore,
    DeepReadonly,
    DirectoryStore,
    DirectoryUserProjection,
    SidebarStore,
    SidebarChatProjection,
    ThreadHandle,
    TerminalStore,
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
    toneFor,
    type Conversation,
    type LiveThreadMessage,
    type WorkspaceEntry,
} from "./chatPageModels.js";
import { ChatMessageEntry } from "./ChatMessageEntry.js";
import { ChatAgentCreateDialog } from "./ChatAgentCreateDialog.js";
import { ChatChannelCreateDialog } from "./ChatChannelCreateDialog.js";
import { ChatChildChannelCreateDialog } from "./ChatChildChannelCreateDialog.js";
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
import { ComposeModal } from "../compose/ComposeModal.js";
import { chatSidebarModelCreate } from "./chatSidebarModel.js";
import { useChatInfoModel } from "./chatInfoModel.js";
import { chatMessageActionsModelCreate } from "./chatMessageActionsModel.js";
import { chatCreationModelCreate, useChatCreateRequest } from "./chatCreationModel.js";
import { chatChannelModelCreate } from "./chatChannelModel.js";
import {
    useAvatarImages,
    usePluginRequestImages,
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
    /** On-demand agent-model catalog for the child-channel model picker. */
    agentModels?: AgentModelsStore;
    chat?: ChatStore;
    composer?: ComposerStore;
    thread?: ThreadHandle;
    trace?: AgentTraceStore;
    terminal?: TerminalStore;
    workspace?: WorkspaceStore;
    workspaceFile?: WorkspaceFileStore;
    actions: ChatPageActions;
    navigation: ChatPageNavigation;
    /** Filters sidebar rows locally; global search must not drive this prop. */
    sidebarSearch?: string;
    windowControls?: boolean;
    createRequest?: {
        kind: "agent" | "channel";
        nonce: number;
    };
    /** @deprecated the feature rail was removed; retained for existing callers/tests. */
    rail?: ReactNode;
    /** Top-of-sidebar workspace navigation rows (Chat, Home, …, Administration). */
    navSection?: SidebarSection;
    /** The active workspace nav row id, when the current view is not a conversation. */
    navActiveId?: string;
    onNavSelect?(id: string): void;
    /** Profile + appearance control pinned to the bottom of the sidebar. */
    sidebarFooter?: ReactNode;
    /**
     * Renders another primary view (admin, files, …) in the main workspace while
     * the chat sidebar stays visible, so the channel list is always present.
     */
    workspaceOverride?: ReactNode;
    /** Replaces the chat sidebar with a pushed detail level (e.g. admin sub-nav). */
    sidebarOverride?: ReactNode;
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
    channelCreateChild(input: import("happy2-state").CreateChildChannelInput): Promise<void>;
    channelArchive(chatId: string): Promise<void>;
    channelUnarchive(chatId: string): Promise<void>;
    /** Loads the agent-model catalog before a model picker renders. */
    agentModelsLoad(): Promise<void>;
    channelUpdate(chatId: string, input: import("happy2-state").ChannelUpdateInput): Promise<void>;
    channelDefaultAgentUpdate(chatId: string, agentUserId: string): Promise<void>;
    agentCreate(input: import("happy2-state").CreateAgentInput): Promise<void>;
    agentConversationCreate(agentUserId: string): Promise<string>;
    agentEffortChange(chatId: string, agentUserId: string, effort: string): Promise<void>;
    directMessageCreate(userId: string): Promise<void>;
    messageSend(chatId: string, text: string): void;
    terminalOpen?(agentUserId: string): void;
    terminalClose?(): void;
    /** Downloads one staged plugin request image while the request package remains staged. */
    pluginRequestImageDownload?(chatId: string, requestId: string): Promise<ArrayBuffer>;
}
export function ChatPage(props: ChatPageProps) {
    const user = () => props.user;
    const avatarImages = useAvatarImages(props.actions);
    const sidebarState = useStoreSnapshot(props.sidebar);
    const directoryState = useStoreSnapshot(props.directory);
    const agentModelsState = useOptionalStoreSnapshot(props.agentModels);
    const chatState = useOptionalStoreSnapshot(props.chat);
    const composerState = useOptionalStoreSnapshot(props.composer);
    const threadState = useOptionalStoreSnapshot(props.thread);
    const threadChat = props.thread?.childChat();
    const threadChatState = useOptionalStoreSnapshot(threadChat);
    const traceState = useOptionalStoreSnapshot(props.trace);
    const terminalState = useOptionalStoreSnapshot(props.terminal);
    const sidebarSnapshot = () => sidebarState;
    const directorySnapshot = () => directoryState;
    const chatSnapshot = () => chatState;
    const composerSnapshot = () => composerState;
    const traceSnapshot = () => traceState;
    const [statusHint, setStatusHint] = useState<string>();
    function showError(error: unknown) {
        setStatusHint(error instanceof Error ? error.message : "Something went wrong.");
    }
    const [busyCount, setBusyCount] = useState(0);
    const [createOpen, setCreateOpen] = useState(false);
    const [childCreateParentId, setChildCreateParentId] = useState<string | undefined>(undefined);
    const [agentCreateOpen, setAgentCreateOpen] = useState(false);
    const [directoryOpen, setDirectoryOpen] = useState(false);
    const [composeOpen, setComposeOpen] = useState(false);
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
              // Slug is globally unique (server-enforced), so it disambiguates a
              // newly created channel from an existing same-named one. parentChatId
              // is carried for child channels so selection targets the new child.
              slug: string;
              parentChatId?: string;
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
    const threadDraft = threadState?.draft ?? "";
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
    const lastThreadReadMessageId = useRef<string | undefined>(undefined);
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
    const terminalAgent = () => {
        const peer = activePeer();
        if (peer?.kind === "agent") return peer;
        const defaultId = activeChat()?.defaultAgentUserId;
        const selected = defaultId
            ? activeProjection()?.participants.find((participant) => participant.id === defaultId)
            : undefined;
        if (selected) return selected;
        const members = chatSnapshot()?.members;
        return members?.type === "ready"
            ? members.value.find((participant) => participant.kind === "agent")
            : activeProjection()?.participants.find((participant) => participant.kind === "agent");
    };
    const [terminalHeight, setTerminalHeight] = useState(280);
    const draft = () => composerSnapshot()?.text ?? "";
    const pendingAttachments = () => composerSnapshot()?.attachments ?? [];
    const entries = entriesProject(
        (chatSnapshot()?.messages ?? []).filter((item) => !item.message.threadRootMessageId),
    );
    const threadRootItem = () =>
        chatSnapshot()?.messages.find(({ message }) => message.id === activeThreadRootId());
    const threadEntries = (() => {
        const root = threadRootItem();
        return entriesProject([...(root ? [root] : []), ...(threadChatState?.messages ?? [])]);
    })();
    const threadRoot = () =>
        threadEntries.find(
            (entry): entry is LiveThreadMessage =>
                entry.kind === "message" && entry.id === activeThreadRootId(),
        );
    const threadLoading = () => {
        const resolution = threadState?.resolution;
        if (!resolution || resolution.type === "unloaded" || resolution.type === "loading")
            return true;
        if (resolution.type !== "ready") return false;
        const status = threadChatState?.status;
        return !status || status.type === "unloaded" || status.type === "loading";
    };
    const threadError = () => {
        const resolution = threadState?.resolution;
        if (resolution?.type === "error")
            return {
                title:
                    resolution.stage === "root"
                        ? "Thread root failed to load"
                        : "Thread failed to resolve",
                message: resolution.error.message,
                onRetry: () => props.thread?.getState().threadResolutionRetry(),
            };
        if (threadState?.create.type === "error")
            return {
                title: "Thread could not be created",
                message: threadState.create.error.message,
                onRetry: () => props.thread?.getState().threadCreateRetry(),
            };
        if (resolution?.type === "ready" && threadChatState?.status.type === "error")
            return {
                title: "Replies failed to load",
                message: threadChatState.status.error.message,
                onRetry: () => props.thread?.getState().childChatLoadRetry(),
            };
        const failed = threadChatState?.messages.find(
            (item) => item.delivery === "failed" && item.clientMutationId,
        );
        return failed?.clientMutationId
            ? {
                  title: "Reply failed to send",
                  message: failed.error?.message ?? "The reply could not be sent.",
                  onRetry: () => props.thread?.getState().replyRetry(failed.clientMutationId!),
              }
            : undefined;
    };
    const threadEmpty = () => {
        if (threadLoading() || threadError()) return false;
        const resolution = threadState?.resolution;
        return (
            resolution?.type === "absent" ||
            (resolution?.type === "ready" &&
                threadChatState?.status.type === "ready" &&
                threadChatState.messages.length === 0)
        );
    };
    const threadComposerDisabled = () => {
        const resolution = threadState?.resolution;
        if (!resolution || resolution.type === "unloaded" || resolution.type === "loading")
            return true;
        if (resolution.type === "error" || threadState?.create.type === "error") return true;
        return resolution.type === "ready" && threadChatState?.status.type !== "ready";
    };
    const avatarFor = createAvatarProjection({
        user,
        sidebarSnapshot,
        directorySnapshot,
        imageUrl: avatarImages.imageUrl,
    });
    const sidebarModel = chatSidebarModelCreate({
        user,
        activeConversationId,
        search: () => props.sidebarSearch ?? "",
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
        actions: props.actions,
        onError: showError,
        onEdit: (message) => {
            const source = message.serverMessage;
            if (!source) return;
            setMessageEdit({
                chatId: source.chatId,
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
        pendingSelection.current = { kind: "channel", slug: input.slug };
        setCreateOpen(false);
    }
    async function childCreate(input: {
        name: string;
        slug: string;
        topic?: string;
        agentModelId?: string;
    }) {
        const parentChatId = childCreateParentId;
        if (!parentChatId) return;
        if (!(await creationModel.channelCreateChild({ ...input, parentChatId }))) return;
        pendingSelection.current = { kind: "channel", slug: input.slug, parentChatId };
        setChildCreateParentId(undefined);
    }
    function childCreateOpen(parentChatId: string) {
        setChildCreateParentId(parentChatId);
        void props.actions.agentModelsLoad().catch(showError);
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
    async function applyComposeEffort(chatId: string, agentUserId: string, effort: string) {
        let lastError: unknown;
        for (let attempt = 0; attempt < 5; attempt++) {
            try {
                await props.actions.agentEffortChange(chatId, agentUserId, effort);
                return;
            } catch (error) {
                lastError = error;
                if (attempt < 4)
                    await new Promise<void>((resolve) => setTimeout(resolve, 800 * (attempt + 1)));
            }
        }
        throw lastError;
    }
    async function composeSubmit(input: { agentUserId: string; effort: string; prompt: string }) {
        startBusy();
        try {
            const chatId = await props.actions.agentConversationCreate(input.agentUserId);
            props.actions.chatSelect(chatId, "chat");
            await applyComposeEffort(chatId, input.agentUserId, input.effort);
            props.actions.messageSend(chatId, input.prompt);
            setComposeOpen(false);
        } catch (error) {
            showError(error);
        } finally {
            finishBusy();
        }
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
        onChildCreate: childCreateOpen,
        onError: showError,
    });
    const conversationEntries = () =>
        entries.filter((entry) => entry.conversationId === activeConversationId());
    const channelAgents = () => {
        const members = chatSnapshot()?.members;
        return members?.type === "ready"
            ? members.value.filter((person) => person.kind === "agent")
            : [];
    };
    const composeAgents = () =>
        directoryUsers()
            .filter((person) => person.kind === "agent")
            .map((agent) => ({ label: agent.displayName, value: agent.id }));
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
            // In Agents mode the whole input addresses the channel's agent, so
            // the placeholder names the recipient instead of the channel.
            composerPlaceholder:
                chat.kind === "dm"
                    ? `Message ${title}`
                    : audienceRoutingActive() &&
                        composerSnapshot()?.audience === "agents" &&
                        composerDefaultAgent()
                      ? `Message ${composerDefaultAgent()!.name}`
                      : `Message #${chat.slug ?? title}`,
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
                        : chatSnapshot()?.status.type !== "ready" || chatSnapshot()?.hasMoreMessages
                          ? `Showing the latest messages in #${chat.slug ?? title}.`
                          : conversationEntries().some((entry) => entry.kind === "message")
                            ? `This is the beginning of #${chat.slug ?? title}.`
                            : "This channel is ready for its first message."),
            },
        };
    })();
    const mentionCandidates = () =>
        directoryUsers().map((person) => ({
            id: person.id,
            initials: identityInitials(person),
            name: person.displayName,
            tone: toneFor(person.id),
        }));
    const directoryAgents = () => directoryUsers().filter((person) => person.kind === "agent");
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
    const liveComposerCompactHint = () => {
        const actor = typingActor();
        const person = actor && directoryUsers().find((candidate) => candidate.id === actor.userId);
        return person ? "Typing…" : (statusHint ?? "Enter to send");
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

    const requestImages = usePluginRequestImages(props.actions);
    const pluginRequestEntries = (): ReactNode[] => {
        const snapshot = chatSnapshot();
        const requests = snapshot?.pluginRequests;
        if (!snapshot || requests?.type !== "ready" || requests.value.length === 0) return [];
        const requester = (agentUserId?: string) =>
            agentUserId
                ? directoryUsers().find((person) => person.id === agentUserId)?.displayName
                : undefined;
        const nodes: ReactNode[] = requests.value.map((request) => (
            <div
                className="happy2-plugin-permission-card-row"
                data-happy2-ui="plugin-permission-card-row"
                key={`plugin-request:${request.id}`}
            >
                <PluginPermissionCard
                    action={request.action}
                    busy={snapshot.pluginRequestPendingIds.includes(request.id)}
                    canDecide={isServerAdmin()}
                    description={request.description}
                    error={request.lastError}
                    imageUrl={requestImages.imageUrl(
                        request.chatId,
                        request.id,
                        request.status === "pending" || request.status === "processing",
                    )}
                    onApprove={() => props.chat?.getState().pluginRequestApprove(request.id)}
                    onDeny={() => props.chat?.getState().pluginRequestDeny(request.id)}
                    pluginName={request.displayName}
                    reason={request.reason}
                    requestedBy={requester(request.agentUserId)}
                    shortName={request.shortName}
                    source={
                        request.sourceKind === "link"
                            ? request.sourceReference
                            : request.sourceKind === "archive"
                              ? `ZIP · ${request.sourceReference ?? request.shortName}`
                              : undefined
                    }
                    status={request.status}
                />
            </div>
        ));
        const decisionError = snapshot.pluginRequestActionError;
        if (decisionError)
            nodes.push(
                <div
                    className="happy2-plugin-permission-card-row"
                    key="plugin-request:decision-error"
                >
                    <Banner tone="danger" title="Plugin request decision failed">
                        {decisionError.message}
                    </Banner>
                </div>,
            );
        return nodes;
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
                if (pending.kind === "channel")
                    return (
                        projection.chat.slug === pending.slug &&
                        (pending.parentChatId === undefined ||
                            projection.chat.parentChatId === pending.parentChatId)
                    );
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
        // Don't auto-open a chat while a non-conversation view (admin, files, …)
        // owns the workspace, or the drill-down would bounce back to a chat.
        if (!props.workspaceOverride && !activeConversationId() && chats.length)
            selectConversation(chats[0]!.id, true);
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
    useLayoutEffect(() => {
        const snapshot = threadChatState;
        const latest = [...(snapshot?.messages ?? [])]
            .reverse()
            .find((item) => item.source === "server");
        if (!snapshot || !latest || latest.message.id === lastThreadReadMessageId.current) return;
        lastThreadReadMessageId.current = latest.message.id;
        void props.actions.chatReadMark(snapshot.chatId, latest.message.id).catch(showError);
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
        if (message.serverMessage) props.actions.threadOpen(message.id);
    }
    function sendThreadReply() {
        props.thread?.getState().replySubmit();
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
                windowControls={props.windowControls}
                sidebar={
                    props.sidebarOverride ?? (
                        <Sidebar
                            activeItemId={activeConversationId() || props.navActiveId || ""}
                            brand
                            footer={
                                props.sidebarFooter ??
                                (props.canOpenAdmin ? (
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
                                ) : null)
                            }
                            composeLabel="New chat"
                            onCompose={() => setComposeOpen(true)}
                            onItemSelect={(id) => {
                                if (props.navSection?.items.some((item) => item.id === id))
                                    props.onNavSelect?.(id);
                                else selectConversation(id);
                            }}
                            onSectionAction={(sectionId) => {
                                if (sectionId === "agents") setAgentCreateOpen(true);
                                if (sectionId === "channels") setDirectoryOpen(true);
                                if (sectionId === "dms") setDirectMessageOpen(true);
                            }}
                            sections={
                                props.navSection
                                    ? [props.navSection, ...sidebarSections]
                                    : sidebarSections
                            }
                        />
                    )
                }
                panel={
                    panelMode() === "thread" ? (
                        <ChatThreadPanel
                            disabled={threadComposerDisabled()}
                            draft={threadDraft}
                            empty={threadEmpty()}
                            error={threadError()}
                            loading={threadLoading()}
                            mentions={mentionCandidates()}
                            onDraftChange={(value) =>
                                props.thread?.getState().replyDraftUpdate(value)
                            }
                            onClose={() => {
                                props.actions.threadClose();
                            }}
                            onSend={sendThreadReply}
                            pending={threadState?.create.type === "pending" || busy()}
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
                {props.workspaceOverride ?? (
                    <ChatConversation
                        activeConversationId={activeConversationId()}
                        activities={activeAgentActivity()}
                        activityNow={activityNow}
                        busy={busy()}
                        composerAudience={
                            audienceRoutingActive() ? composerSnapshot()?.audience : undefined
                        }
                        composerCompactHint={liveComposerCompactHint()}
                        composerDisabled={!activeConversationId()}
                        composerHint={liveComposerHint()}
                        composerMentions={mentionCandidates()}
                        composerPending={
                            composerSnapshot()?.submission.status === "pending" || busy()
                        }
                        composerSendEnabled={
                            draft().trim().length > 0 || pendingAttachments().length > 0
                        }
                        composerValue={draft()}
                        terminal={terminalState}
                        terminalAvailable={Boolean(terminalAgent() && props.actions.terminalOpen)}
                        terminalHeight={terminalHeight}
                        contextItems={composerContext}
                        conversation={conversation}
                        joinVisible={Boolean(
                            activeChat()?.kind !== "dm" &&
                            activeChat() &&
                            !activeChat()?.membershipRole,
                        )}
                        menuItems={
                            activeConversationId() && channelModel.menuItems().length > 0
                                ? channelModel.menuItems()
                                : undefined
                        }
                        messageEntries={[
                            ...conversationEntries().map((entry, index, list) =>
                                renderEntry(entry, index, list),
                            ),
                            ...pluginRequestEntries(),
                        ]}
                        onAudienceChange={(audience) =>
                            props.composer?.getState().audienceUpdate(audience)
                        }
                        onContextRemove={(id) =>
                            props.composer?.getState().attachmentRemove(id.replace(/^file:/u, ""))
                        }
                        onComposerFocusChange={(focused) =>
                            props.composer?.getState().focusUpdate(focused)
                        }
                        onFilesSelected={(files) => void uploadFiles(files)}
                        onInfoOpen={() => infoModel.open()}
                        onJoin={() => void channelModel.join()}
                        onMenuSelect={channelModel.menuSelect}
                        onSend={sendMessage}
                        onStarToggle={channelModel.starToggle}
                        onValueChange={updateDraft}
                        onWorkspaceToggle={toggleFilesPanel}
                        onTerminalClose={() => props.actions.terminalClose?.()}
                        onTerminalHeightChange={(height) =>
                            setTerminalHeight(Math.max(160, Math.min(560, height)))
                        }
                        onTerminalOpen={() => {
                            const agent = terminalAgent();
                            if (agent) props.actions.terminalOpen?.(agent.id);
                        }}
                        onTerminalInput={(data) => props.terminal?.getState().terminalWrite(data)}
                        onTerminalReconnect={() => props.terminal?.getState().terminalReconnect()}
                        onTerminalResize={(cols, rows) =>
                            props.terminal?.getState().terminalResize(cols, rows)
                        }
                        starred={channelModel.starred()}
                    />
                )}
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
            {composeOpen ? (
                <ComposeModal
                    busy={busy()}
                    defaultAgentUserId={composeAgents()[0]?.value}
                    models={composeAgents()}
                    onClose={() => setComposeOpen(false)}
                    onCreate={(input) => composeSubmit(input)}
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
            {childCreateParentId ? (
                <ChatChildChannelCreateDialog
                    busy={busy()}
                    defaultModelId={agentModelsState?.defaultModelId}
                    models={(agentModelsState?.models ?? []).map((model) => ({
                        value: model.id,
                        label: model.name,
                    }))}
                    modelsError={
                        agentModelsState?.status.type === "error"
                            ? agentModelsState.status.error.message
                            : undefined
                    }
                    modelsLoading={agentModelsState?.status.type === "loading"}
                    onClose={() => setChildCreateParentId(undefined)}
                    onCreate={(input) => void childCreate(input)}
                    parentName={
                        sidebarChats().find((projection) => projection.id === childCreateParentId)
                            ?.displayName
                    }
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
                own={
                    message !== undefined &&
                    !message.agent &&
                    message.senderId !== undefined &&
                    message.senderId === user()?.id
                }
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
