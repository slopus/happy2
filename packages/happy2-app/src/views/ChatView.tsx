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
import { createStore, reconcile } from "solid-js/store";
import {
    AgentDesk,
    AgentRunCard,
    AppShell,
    ApprovalCard,
    Banner,
    Box,
    Button,
    ChannelHeader,
    Composer,
    DayDivider,
    DiffSnippet,
    EmptyState,
    EventCard,
    FileAttachment,
    FileEditor,
    FilePanel,
    FormRow,
    InfoPanel,
    Lightbox,
    Message,
    MessageList,
    Menu,
    Modal,
    ModalOverlay,
    SegmentedControl,
    Select,
    Sidebar,
    TextField,
    ThreadPanel,
    type ApprovalResolution,
    type ContextItem,
    type FileTreeNode,
    type InfoPanelProfile,
    type MemberItem,
    type MemberRole,
    type MenuItem,
    type MessageImage,
    type SidebarItem,
    type SidebarSection,
    type SelectOption,
    type ToneName,
} from "happy2-ui";
import { WorkspaceFileConflictError } from "happy2-state";
import type {
    ChatSummary,
    ClientStateEventOf,
    ClientWorkspace,
    FileSummary,
    MessageSummary,
    PresenceSnapshot,
    UploadedFile,
    UserSummary,
    WorkspaceTextFile,
} from "happy2-state";
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
    /** Monotonic request from the rail "+" menu. */
    createRequest?: () => { kind: "agent" | "channel"; nonce: number };
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
const modalStackStyle: JSX.CSSProperties = {
    display: "flex",
    "flex-direction": "column",
    gap: "8px",
};
const fileEditorCardStyle: JSX.CSSProperties = {
    width: "min(1040px, 94vw)",
    height: "min(760px, 88vh)",
    "border-radius": "14px",
    overflow: "hidden",
    border: "1px solid var(--happy2-border)",
    "box-shadow": "0 24px 60px rgba(0, 0, 0, 0.5)",
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
/* Small muted line shown in the effort control slot while options load or when
   the agent has no reachable Rig session to read supported levels from. */
const effortNoticeStyle: JSX.CSSProperties = {
    "font-size": "13px",
    "line-height": "20px",
    color: "var(--happy2-text-muted)",
};
const effortErrorStyle: JSX.CSSProperties = {
    ...effortNoticeStyle,
    color: "var(--happy2-danger)",
};

/* Human-readable captions for Rig reasoning-effort levels. Unknown levels fall
   back to a capitalized token so a new server level still renders sensibly. */
const effortLabels: Record<string, string> = {
    low: "Low",
    medium: "Medium",
    high: "High",
    xhigh: "X-High",
};
function effortLabel(value: string): string {
    return effortLabels[value] ?? value.charAt(0).toUpperCase() + value.slice(1);
}

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
    agentName?: string,
): LiveThreadMessage {
    const sender =
        message.sender ??
        (message.id.startsWith("local:") && currentUser ? currentUser : undefined);
    const deleted = Boolean(message.deletedAt);
    return {
        kind: "message",
        id: message.id,
        conversationId: message.chatId,
        author: sender ? fullName(sender) : (message.senderBot?.name ?? agentName ?? "Happy (2)"),
        initials: sender
            ? initials(sender)
            : (message.senderBot?.name ?? agentName ?? "R").slice(0, 2).toUpperCase(),
        tone: sender ? toneFor(sender.id) : "brand",
        agent: message.kind === "automated",
        generationStatus: deleted ? undefined : message.generationStatus,
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
    agentName?: string,
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
        result.push(toThreadMessage(message, currentUser, agentName));
    }
    return result;
}

function groupedWithPrevious(entries: WorkspaceEntry[], index: number, message: LiveThreadMessage) {
    const previous = entries[index - 1];
    return previous?.kind === "message" && previous.author === message.author;
}

/*
 * Fold the client workspace's flat, sorted path list into the nested tree the
 * FileTree component renders. Directory paths carry a trailing slash; every
 * other segment on the way to a leaf is an intermediate directory. Per-directory
 * disclosure (`expanded`), in-flight paging (`loading`), and "more pages remain"
 * (`hasMore`) are layered on from the host's own UI intent and the state's
 * reported directory load progress. Directories sort before files at each level.
 */
function workspaceNodes(
    workspace: ClientWorkspace,
    expanded: ReadonlySet<string>,
    loading: ReadonlySet<string>,
): FileTreeNode[] {
    const statusByPath = new Map(workspace.gitStatus.map((entry) => [entry.path, entry.status]));
    const incomplete = new Set(
        workspace.directories
            .filter((directory) => !directory.complete)
            .map((directory) => directory.directory),
    );
    const roots: FileTreeNode[] = [];
    const directories = new Map<string, FileTreeNode>();

    const ensureDirectory = (
        path: string,
        name: string,
        siblings: FileTreeNode[],
    ): FileTreeNode => {
        let node = directories.get(path);
        if (!node) {
            node = { id: path, name, kind: "directory", children: [] };
            directories.set(path, node);
            siblings.push(node);
        }
        return node;
    };

    for (const path of workspace.paths) {
        const isDirectory = path.endsWith("/");
        const segments = (isDirectory ? path.slice(0, -1) : path).split("/");
        let siblings = roots;
        let prefix = "";
        segments.forEach((segment, index) => {
            if (index === segments.length - 1 && !isDirectory) {
                const filePath = prefix + segment;
                siblings.push({
                    id: filePath,
                    name: segment,
                    kind: "file",
                    gitStatus: statusByPath.get(filePath),
                });
                return;
            }
            const directoryPath = `${prefix}${segment}/`;
            const node = ensureDirectory(directoryPath, segment, siblings);
            siblings = node.children!;
            prefix = directoryPath;
        });
    }

    for (const [path, node] of directories) {
        node.gitStatus = statusByPath.get(path);
        node.expanded = expanded.has(path);
        node.loading = loading.has(path);
        node.hasMore = incomplete.has(path);
    }

    const sortLevel = (list: FileTreeNode[]): FileTreeNode[] => {
        list.sort((left, right) =>
            left.kind === right.kind
                ? left.name.localeCompare(right.name)
                : left.kind === "directory"
                  ? -1
                  : 1,
        );
        for (const node of list) if (node.children) sortLevel(node.children);
        return list;
    };
    return sortLevel(roots);
}

export function ChatView(props: ChatViewProps) {
    const connected = Boolean(props.session);
    const [activeConversationId, setActiveConversationId] = createSignal(
        connected ? "" : "launch-week",
    );
    const [draft, setDraft] = createSignal("");
    /* Conversation and thread rows live in Solid stores keyed by durable entry
       id: `reconcile` mutates matching rows in place, so an existing row keeps
       its exact DOM node while a stream tick swaps only its body/status fields,
       and `For` (which memoizes by row identity) never remounts a settled row.
       Reference equality of a summary may flag a change, but it is never a row's
       identity — the id is. */
    const [entryStore, setEntryStore] = createStore<{ list: WorkspaceEntry[] }>({
        list: connected ? [] : initialEntries,
    });
    const entries = () => entryStore.list;
    const commitEntries = (next: WorkspaceEntry[]) =>
        setEntryStore("list", reconcile(next, { key: "id" }));
    const [sidebarStore, setSidebarStore] = createStore<{ sections: SidebarSection[] }>({
        sections: connected ? [] : chatSections,
    });
    const sidebar = () => sidebarStore.sections;
    const commitSidebar = (next: SidebarSection[]) =>
        setSidebarStore("sections", reconcile(next, { key: "id" }));
    const [conversationData, setConversationData] = createSignal<Record<string, Conversation>>(
        connected ? {} : conversations,
    );
    const [serverChats, setServerChats] = createSignal<ChatSummary[]>([]);
    const [contacts, setContacts] = createSignal<UserSummary[]>([]);
    const [dmPeers, setDmPeers] = createSignal<Record<string, UserSummary>>({});
    const [presence, setPresence] = createSignal<Record<string, PresenceSnapshot>>({});
    const [threadRootId, setThreadRootId] = createSignal<string>();
    const [threadStore, setThreadStore] = createStore<{ list: WorkspaceEntry[] }>({ list: [] });
    const threadEntries = () => threadStore.list;
    const commitThread = (next: WorkspaceEntry[]) =>
        setThreadStore("list", reconcile(next, { key: "id" }));
    const [threadDraft, setThreadDraft] = createSignal("");
    const [panelMode, setPanelMode] = createSignal<"info" | "thread" | "files">();
    const [workspace, setWorkspace] = createSignal<ClientWorkspace>();
    const [workspaceExpanded, setWorkspaceExpanded] = createSignal<string[]>([]);
    const [workspaceLoading, setWorkspaceLoading] = createSignal<string[]>([]);
    const [workspaceSelected, setWorkspaceSelected] = createSignal<string>();
    const [openFilePath, setOpenFilePath] = createSignal<string>();
    const [fileBase, setFileBase] = createSignal<WorkspaceTextFile>();
    const [fileDraft, setFileDraft] = createSignal("");
    const [fileSaving, setFileSaving] = createSignal(false);
    const [fileConflict, setFileConflict] = createSignal(false);
    const [fileDiskChanged, setFileDiskChanged] = createSignal(false);
    const [fileMissing, setFileMissing] = createSignal(false);
    const [panelMembers, setPanelMembers] = createSignal<MemberItem[]>([]);
    /* When set, the info panel shows this author's profile (opened by clicking a
       message avatar/name) instead of the active channel or DM peer. Cleared
       whenever the channel info panel is opened or the conversation changes. */
    const [profileOverride, setProfileOverride] = createSignal<InfoPanelProfile>();
    const [agentEffortOptions, setAgentEffortOptions] = createSignal<string[]>();
    const [agentEffortValue, setAgentEffortValue] = createSignal<string>();
    const [agentEffortError, setAgentEffortError] = createSignal<string>();
    const [agentEffortBusy, setAgentEffortBusy] = createSignal(false);
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
    const [typingActor, setTypingActor] = createSignal<{
        chatId: string;
        userId: string;
    }>();
    const [localReadThrough, setLocalReadThrough] = createSignal<Record<string, string>>({});
    const [expandedRuns, setExpandedRuns] = createSignal<Record<string, boolean>>({});
    const [expandedApprovals, setExpandedApprovals] = createSignal<Record<string, boolean>>({});
    const [approvalResolutions, setApprovalResolutions] = createSignal<
        Record<string, ApprovalResolution>
    >({});
    const [toggledReactions, setToggledReactions] = createSignal<Record<string, boolean>>({});
    const [createOpen, setCreateOpen] = createSignal(false);
    const [agentCreateOpen, setAgentCreateOpen] = createSignal(false);
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
    const [newAgentName, setNewAgentName] = createSignal("");
    const [newAgentUsername, setNewAgentUsername] = createSignal("");
    const [agentUsernameEdited, setAgentUsernameEdited] = createSignal(false);
    let fileInput: HTMLInputElement | undefined;
    let requestNumber = 0;
    let workspaceRequestNumber = 0;
    let threadRequestNumber = 0;
    let hydrating = false;
    let hydrateAgain = false;
    let disposed = false;
    const stateCleanups: Array<() => void> = [];
    let sentTyping = false;
    const requestedReadThrough = new Map<string, string>();

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
        if (activeChat()?.kind === "dm") return false;
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
            title: connected ? "Your Happy (2)" : "launch-week",
            topic: connected ? "Create a channel or select a person to start chatting" : undefined,
            composerPlaceholder: "Message Happy (2)…",
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
        const typing = typingActor();
        if (typing?.chatId === activeConversationId()) {
            const contact = contacts().find((item) => item.id === typing.userId);
            if (contact) return `${fullName(contact)} is typing…`;
        }
        return statusHint() ?? composerHint;
    };
    const displayedUnreadCount = (chat: ChatSummary): number => {
        if (chat.id === activeConversationId()) return 0;
        const cached = localReadThrough()[chat.id];
        return cached && sequenceAtLeast(cached, chat.lastMessageSequence) ? 0 : chat.unreadCount;
    };

    const reactionsFor = (message: LiveThreadMessage) =>
        message.reactions?.map((reaction) =>
            toggledReactions()[`${message.id}:${reaction.emoji}`]
                ? { ...reaction, count: reaction.count + 1, active: true }
                : reaction,
        );

    const workspaceTree = createMemo<FileTreeNode[]>(() => {
        const current = workspace();
        if (!current) return [];
        return workspaceNodes(current, new Set(workspaceExpanded()), new Set(workspaceLoading()));
    });
    const workspaceSubtitle = () => {
        const current = workspace();
        return current ? `rev ${current.revision}` : undefined;
    };
    const workspaceNote = () => {
        const current = workspace();
        if (!current) return undefined;
        if (current.gitStatusPending) return "Checking git status…";
        const count = current.gitStatus.length;
        return count === 0 ? "No changes" : `${count} ${count === 1 ? "change" : "changes"}`;
    };

    function resetWorkspacePanel() {
        setWorkspace(undefined);
        setWorkspaceExpanded([]);
        setWorkspaceLoading([]);
        setWorkspaceSelected(undefined);
        closeWorkspaceFile();
    }

    const fileDirty = () => {
        const base = fileBase();
        return Boolean(openFilePath()) && base !== undefined && fileDraft() !== base.content;
    };
    const fileStatus = () => {
        if (fileSaving()) return "Saving…";
        if (fileMissing()) return "Removed on disk";
        if (fileConflict()) return "Conflict";
        if (fileDiskChanged()) return "Changed on disk";
        if (fileDirty()) return "Unsaved";
        const base = fileBase();
        return base ? formatBytes(base.size) : "";
    };
    const fileEditorBanner = (): JSX.Element => {
        if (fileMissing())
            return (
                <Banner action={{ label: "Close", onClick: closeWorkspaceFile }} tone="danger">
                    This file was removed on disk.
                </Banner>
            );
        if (fileConflict())
            return (
                <Banner
                    action={{ label: "Reload", onClick: () => void reloadWorkspaceFile() }}
                    tone="danger"
                >
                    This file changed on disk and your edits overlap. Reload to discard your changes
                    and load the latest.
                </Banner>
            );
        if (fileDiskChanged())
            return (
                <Banner
                    action={{ label: "Reload", onClick: () => void reloadWorkspaceFile() }}
                    tone="warning"
                >
                    This file changed on disk. Saving merges your edits; Reload discards them.
                </Banner>
            );
        return undefined;
    };

    function resetFileEditorState() {
        setOpenFilePath(undefined);
        setFileBase(undefined);
        setFileDraft("");
        setFileSaving(false);
        setFileConflict(false);
        setFileDiskChanged(false);
        setFileMissing(false);
    }

    /* Open one file in the editor overlay. The state loads the versioned text and
       remembers a base for conflict-safe writes; the "workspace-file" stream keeps
       it current while it is open. */
    async function openWorkspaceFile(path: string) {
        const model = state();
        const chatId = activeConversationId();
        if (!model || !chatId) return;
        resetFileEditorState();
        setOpenFilePath(path);
        try {
            const file = await model.readWorkspaceFile(chatId, path);
            if (openFilePath() !== path || activeConversationId() !== chatId) return;
            setFileBase(file);
            setFileDraft(file.content);
        } catch (reason) {
            if (openFilePath() === path) {
                setStatusHint(errorMessage(reason));
                resetFileEditorState();
            }
        }
    }

    /* Conflict-safe save: the state diffs the draft against the base version and,
       if the file moved underneath, reapplies non-overlapping edits automatically;
       only a genuine overlap rejects with a conflict. */
    async function saveWorkspaceFile() {
        const model = state();
        const chatId = activeConversationId();
        const path = openFilePath();
        const base = fileBase();
        if (!model || !chatId || !path || !base || !fileDirty() || fileSaving()) return;
        setFileSaving(true);
        setFileConflict(false);
        try {
            const result = await model.writeWorkspaceFile(chatId, {
                path,
                expectedVersion: base.version,
                content: fileDraft(),
            });
            if (openFilePath() !== path || activeConversationId() !== chatId) return;
            setFileBase(result);
            setFileDraft(result.content);
            setFileDiskChanged(false);
            setFileMissing(false);
            setStatusHint(undefined);
        } catch (reason) {
            if (openFilePath() !== path) return;
            if (reason instanceof WorkspaceFileConflictError) setFileConflict(true);
            else setStatusHint(errorMessage(reason));
        } finally {
            if (openFilePath() === path) setFileSaving(false);
        }
    }

    function revertWorkspaceFile() {
        const base = fileBase();
        if (base) setFileDraft(base.content);
    }

    async function reloadWorkspaceFile() {
        const path = openFilePath();
        if (path) await openWorkspaceFile(path);
    }

    function closeWorkspaceFile() {
        const model = state();
        const chatId = activeConversationId();
        const path = openFilePath();
        resetFileEditorState();
        if (model && chatId && path) void model.unloadWorkspaceFile(chatId, path);
    }

    /* Load the adaptive initial tree for the active chat and show the panel.
       The workspace panel is on-demand: nothing is fetched until it is opened,
       and once open it reconciles live through the "workspace" subscription. */
    async function openFilesPanel() {
        setThreadRootId(undefined);
        commitThread([]);
        resetWorkspacePanel();
        setPanelMode("files");
        const model = state();
        const chatId = activeConversationId();
        if (!props.session || !model || !chatId) return;
        startBusy();
        try {
            const loaded = await model.loadWorkspace(chatId);
            if (panelMode() === "files" && activeConversationId() === chatId) setWorkspace(loaded);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    function toggleFilesPanel() {
        if (panelMode() === "files") setPanelMode(undefined);
        else void openFilesPanel();
    }

    /* Expand/collapse a directory by asking the state for the new requested set;
       the state fetches only the newly requested directories and returns one
       aggregate ready for the tree. Loading is tracked per directory so its
       row shows a placeholder while the page is in flight. */
    async function toggleWorkspaceDirectory(path: string) {
        const model = state();
        const chatId = activeConversationId();
        if (!model || !chatId) return;
        const next = new Set(workspaceExpanded());
        const expanding = !next.has(path);
        if (expanding) next.add(path);
        else next.delete(path);
        const requested = [...next];
        setWorkspaceExpanded(requested);
        if (expanding) markWorkspaceLoading(path);
        try {
            const result = await model.syncWorkspace(chatId, requested);
            if (activeConversationId() === chatId) setWorkspace(result);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            clearWorkspaceLoading(path);
        }
    }

    async function loadMoreWorkspaceDirectory(path: string) {
        const model = state();
        const chatId = activeConversationId();
        if (!model || !chatId) return;
        markWorkspaceLoading(path);
        try {
            const result = await model.loadMoreWorkspaceDirectory(chatId, path);
            if (activeConversationId() === chatId) setWorkspace(result);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        } finally {
            clearWorkspaceLoading(path);
        }
    }

    function selectWorkspaceEntry(path: string) {
        setWorkspaceSelected(path);
        if (path.endsWith("/")) void toggleWorkspaceDirectory(path);
        else void openWorkspaceFile(path);
    }

    function markWorkspaceLoading(path: string) {
        setWorkspaceLoading((current) => (current.includes(path) ? current : [...current, path]));
    }

    function clearWorkspaceLoading(path: string) {
        setWorkspaceLoading((current) => current.filter((item) => item !== path));
    }

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
        /* Starred chats float into a dedicated section (ordered by the server's
           `starOrder`) and are removed from their normal Agents/Channels/DMs
           section so a chat never appears twice. Only chats we can actually
           render — a joined channel or a DM/agent whose peer is loaded — are
           eligible, so a starred-but-not-yet-hydrated chat is simply omitted
           until its peer arrives. */
        const starItem = (chat: ChatSummary): SidebarItem | undefined => {
            if (chat.kind === "public_channel" || chat.kind === "private_channel") {
                if (!chat.membershipRole) return undefined;
                return {
                    id: chat.id,
                    kind: "channel" as const,
                    label: chat.name ?? chat.slug ?? "Untitled channel",
                    badge: displayedUnreadCount(chat),
                };
            }
            const peer = peers[chat.id];
            if (!peer) return undefined;
            const agentPeer = peer.kind === "agent";
            return {
                id: chat.id,
                kind: agentPeer ? ("agent" as const) : ("person" as const),
                label: fullName(peer),
                initials: initials(peer),
                tone: toneFor(peer.id),
                badge: displayedUnreadCount(chat),
                online: agentPeer ? undefined : snapshots[peer.id]?.status === "online",
            };
        };
        const starredSummaries = chats
            .filter((chat) => chat.starred)
            .sort((a, b) => (a.starOrder ?? Infinity) - (b.starOrder ?? Infinity));
        const starredItems = starredSummaries
            .map(starItem)
            .filter((item): item is SidebarItem => item !== undefined);
        const starredIds = new Set(starredItems.map((item) => item.id));
        const channels = chats.filter(
            (chat) =>
                (chat.kind === "public_channel" || chat.kind === "private_channel") &&
                chat.membershipRole &&
                !starredIds.has(chat.id),
        );
        const agents = users.filter(
            (item) =>
                item.kind === "agent" &&
                dmByUserId.has(item.id) &&
                !starredIds.has(dmByUserId.get(item.id)!.id),
        );
        const directMessages = users.filter(
            (item) =>
                item.kind === "human" &&
                item.id !== user()?.id &&
                dmByUserId.has(item.id) &&
                !starredIds.has(dmByUserId.get(item.id)!.id),
        );
        commitSidebar([
            ...(starredItems.length > 0
                ? [
                      {
                          id: "starred",
                          label: "Starred",
                          items: starredItems,
                      },
                  ]
                : []),
            {
                id: "agents",
                label: "Agents",
                action: { icon: "plus", label: "New agent" },
                empty: {
                    actionLabel: "Start an agent",
                    description: "Create a coding agent with its own profile and chat.",
                    icon: "spark",
                    title: "No agents yet",
                },
                items: agents.map((agent) => {
                    const chat = dmByUserId.get(agent.id)!;
                    return {
                        id: chat.id,
                        kind: "agent" as const,
                        label: fullName(agent),
                        initials: initials(agent),
                        badge: displayedUnreadCount(chat),
                        tone: toneFor(agent.id),
                    };
                }),
            },
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
                    badge: displayedUnreadCount(chat),
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
                        badge: chat ? displayedUnreadCount(chat) : undefined,
                    };
                }),
            },
        ]);

        /* Merge the derived descriptors into the existing map instead of
           replacing it: `memberCount`/`members` are loaded separately by
           `loadConversation`, so preserving them here keeps the header's member
           count from blinking to `undefined` and back on an incremental chat
           summary update (e.g. a streaming reply advancing chat pts). */
        setConversationData((current) => {
            const next: Record<string, Conversation> = { ...current };
            for (const chat of chats) {
                const peer = peers[chat.id];
                const agentPeer = peer?.kind === "agent";
                const title =
                    chat.kind === "dm" ? (peer ? fullName(peer) : "Direct message") : chat.name;
                const existing = current[chat.id];
                next[chat.id] = {
                    id: chat.id,
                    title: title ?? chat.slug ?? "Untitled channel",
                    icon: chat.kind === "dm" ? (agentPeer ? "spark" : undefined) : "hash",
                    topic:
                        chat.topic ??
                        (chat.kind === "dm"
                            ? agentPeer
                                ? "Private AI coding agent"
                                : "Direct message"
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
                                ? agentPeer
                                    ? "Send a message to give this agent its first task."
                                    : `This conversation is between you and ${title ?? "a teammate"}.`
                                : "This channel is ready for its first message."),
                    },
                    ...(existing?.memberCount !== undefined
                        ? { memberCount: existing.memberCount }
                        : {}),
                    ...(existing?.members !== undefined ? { members: existing.members } : {}),
                };
            }
            return next;
        });
    }

    /*
     * Full workspace hydration: (re)fetch the auxiliary data that chat summaries
     * alone cannot supply — contacts, the public directory, and DM peers — and
     * rebuild navigation. Only run this for genuine topology/membership gaps; an
     * ordinary chat-summary tick is handled in-memory by `patchChatSummaries`.
     * The chat set is read from the model at *apply* time (after the peer
     * fetches settle) and merged with the directory, so a stream tick that
     * advanced a chat mid-fetch is never clobbered by the snapshot we started
     * with.
     */
    async function refreshWorkspace(preferredChatId = activeConversationId()) {
        const model = state();
        if (!model || !props.session) return;
        const currentWorkspaceRequest = ++workspaceRequestNumber;
        try {
            const [contactResponse, directoryResponse] = await Promise.all([
                model.execute("getContacts"),
                model.execute("getDirectoryChannels"),
            ]);
            const peers: Record<string, UserSummary> = {};
            await Promise.all(
                model
                    .get()
                    .chats.filter((chat) => chat.kind === "dm")
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
            if (currentWorkspaceRequest !== workspaceRequestNumber) return;
            const chatsById = new Map(
                directoryResponse.channels.map((chat) => [chat.id, chat] as const),
            );
            for (const chat of model.get().chats) chatsById.set(chat.id, chat);
            const chats = [...chatsById.values()];
            const snapshots = Object.fromEntries(
                contactResponse.presence.map((item) => [item.userId, item]),
            );
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
            if (nextChatId) cacheReadThrough(nextChatId);
            applyNavigation(chats, [...contactResponse.users], peers, snapshots);
            if (nextChatId) await loadConversation(nextChatId);
            else commitEntries([]);
            setStatusHint(undefined);
        } catch (reason) {
            setStatusHint(errorMessage(reason));
        }
    }

    /*
     * Coalesced, single-flight wrapper around `refreshWorkspace` for
     * subscription-driven hydration: while one hydration runs, a later trigger
     * sets a trailing flag so exactly one rerun fires afterward. A burst of
     * chat events (a newly streaming chat advancing pts repeatedly) collapses to
     * at most one in-flight hydration plus one trailing rerun, instead of
     * starting and cancelling a hydration per tick.
     */
    async function hydrateWorkspace() {
        if (hydrating) {
            hydrateAgain = true;
            return;
        }
        hydrating = true;
        try {
            do {
                hydrateAgain = false;
                await refreshWorkspace();
            } while (hydrateAgain && !disposed);
        } finally {
            hydrating = false;
        }
    }

    /*
     * In-memory patch for an incremental chat-summary change (the common case:
     * an active reply streaming advances chat pts every partial). It merges the
     * model's current summaries into the chats we already track and rebuilds
     * navigation from memory — no contacts/directory/members/messages requests,
     * no busy toggle, and (via the descriptor merge) no dropped member count.
     * Reference inequality is used only to detect that a tracked chat advanced;
     * durable row identity comes from the id-keyed stores, never from a summary
     * reference.
     */
    function patchChatSummaries(modelChats: readonly ChatSummary[]) {
        const byId = new Map(modelChats.map((chat) => [chat.id, chat] as const));
        let changed = false;
        const merged = serverChats().map((chat) => {
            const next = byId.get(chat.id);
            if (next && next !== chat) {
                changed = true;
                return next;
            }
            return chat;
        });
        if (!changed) return;
        setServerChats(merged);
        applyNavigation(merged, contacts(), dmPeers(), presence());
    }

    /*
     * A chat summary batch either fits the topology we already know (patch in
     * memory) or exposes a gap — a new chat, a removed chat, a membership/kind
     * change, or a DM whose peer we have not loaded — that needs auxiliary data.
     * Known chats are always patched immediately so their sidebar labels/badges
     * and header descriptor stay live even when another chat in the same batch
     * still requires a full hydration.
     */
    function needsHydration(
        event: ClientStateEventOf<"chats">,
        modelChats: readonly ChatSummary[],
    ): boolean {
        if (event.reason === "initial") return true;
        if (event.removedChatIds.length > 0) return true;
        const known = new Map(serverChats().map((chat) => [chat.id, chat] as const));
        const byId = new Map(modelChats.map((chat) => [chat.id, chat] as const));
        for (const id of event.chatIds) {
            const next = byId.get(id);
            if (!next) continue;
            const previous = known.get(id);
            if (!previous) return true;
            if (next.membershipRole !== previous.membershipRole) return true;
            if (next.kind !== previous.kind) return true;
            if (next.kind === "dm" && !dmPeers()[id]) return true;
        }
        return false;
    }

    function onChatsEvent(event: ClientStateEventOf<"chats">) {
        const model = state();
        if (!model || !props.session) return;
        const chats = model.get().chats;
        /* Classify against the *pre-patch* summaries: `patchChatSummaries` writes
           the new summaries into `serverChats`, so classifying afterward would
           compare a chat against itself and mask a membership/kind delta. Patch
           the known chats immediately (keeps labels/badges live), then hydrate. */
        const hydrate = needsHydration(event, chats);
        patchChatSummaries(chats);
        if (hydrate) void hydrateWorkspace();
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
            commitEntries(toEntries(messages, user(), activeChat()?.name));
            void autoReadOpenChat(chatId, messages);
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
        commitThread([]);
        setPanelMode(undefined);
        setProfileOverride(undefined);
        resetWorkspacePanel();
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
        cacheReadThrough(id);
        applyNavigation();
        await loadConversation(id);
    }

    function cacheReadThrough(chatId: string, sequence?: string): void {
        const through =
            sequence ??
            serverChats().find((candidate) => candidate.id === chatId)?.lastMessageSequence;
        if (!through) return;
        setLocalReadThrough((current) => {
            const previous = current[chatId];
            if (previous && sequenceAtLeast(previous, through)) return current;
            return { ...current, [chatId]: through };
        });
    }

    async function autoReadOpenChat(chatId: string, messages: readonly MessageSummary[]) {
        const model = state();
        if (!model || activeConversationId() !== chatId) return;
        const latest = [...messages].reverse().find((message) => !message.id.startsWith("local:"));
        const through =
            latest?.sequence ??
            serverChats().find((candidate) => candidate.id === chatId)?.lastMessageSequence ??
            "0";
        cacheReadThrough(chatId, through);
        applyNavigation();
        if (through === "0") return;
        const requested = requestedReadThrough.get(chatId);
        if (requested && sequenceAtLeast(requested, through)) return;
        requestedReadThrough.set(chatId, through);
        try {
            await model.execute("markChatRead", {
                chatId,
                ...(latest ? { messageId: latest.id } : {}),
            });
        } catch (reason) {
            if (requestedReadThrough.get(chatId) === through) requestedReadThrough.delete(chatId);
            setStatusHint(errorMessage(reason));
        }
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

    async function createAgent() {
        const model = state();
        const name = newAgentName().trim();
        const username = agentUsername(newAgentUsername());
        if (!model || busy() || !name || !validAgentUsername(username)) return;
        startBusy();
        try {
            const chat = await model.createAgent({ name, username });
            setManualEmptySelection(false);
            setAgentCreateOpen(false);
            setNewAgentName("");
            setNewAgentUsername("");
            setAgentUsernameEdited(false);
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
        commitEntries([]);
        setThreadRootId(undefined);
        commitThread([]);
        setPanelMode(undefined);
        resetWorkspacePanel();
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
            const current = entries();
            commitEntries([
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
            commitEntries(
                entries().map((entry) =>
                    entry.kind === "message" && entry.id === message.id
                        ? toThreadMessage(response.message, user())
                        : entry,
                ),
            );
            commitThread(
                threadEntries().map((entry) =>
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

    /* True while the open thread panel still targets `messageId` — a close or a
       switch to another root (or another chat) must discard a slow/out-of-order
       getThread rather than repopulate a panel that has moved on. */
    const threadStillTargets = (messageId: string) =>
        panelMode() === "thread" && threadRootId() === messageId;

    async function loadThread(messageId: string) {
        const model = state();
        if (!model) return;
        const currentRequest = ++threadRequestNumber;
        startBusy();
        try {
            const history = await model.execute("getThread", { messageId, limit: 100 });
            if (currentRequest !== threadRequestNumber || !threadStillTargets(messageId)) return;
            commitThread(toEntries([history.root, ...history.messages], user()));
            setStatusHint(undefined);
        } catch (reason) {
            if (currentRequest === threadRequestNumber && threadStillTargets(messageId))
                setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    /*
     * In-memory reconcile for an open thread when a chat's message store changes.
     * The stream hot path must never refetch: an unrelated main-message partial
     * does zero `getThread` requests and zero busy toggles. Only when the event
     * actually touches the open root or one of its replies is the thread rebuilt
     * from the current `messagesByChat` snapshot — merged over the already-loaded
     * history and committed through the id-keyed thread store, so an updated reply
     * reconciles its existing row in place. Returns whether it touched the panel.
     */
    function reconcileOpenThread(chatId: string, changedIds: readonly string[]): boolean {
        const root = threadRootId();
        const model = state();
        if (!root || !model || panelMode() !== "thread") return false;
        const stored = model.get().messagesByChat[chatId] ?? [];
        const storedById = new Map(stored.map((item) => [item.message.id, item.message]));
        const touchesThread = changedIds.some(
            (id) => id === root || storedById.get(id)?.threadRootMessageId === root,
        );
        if (!touchesThread) return false;
        /* Merge the changed messages over the loaded history so paged replies the
           store never held are preserved. */
        const merged = new Map<string, MessageSummary>();
        for (const entry of threadEntries()) {
            if (entry.kind === "message" && entry.serverMessage)
                merged.set(entry.id, entry.serverMessage);
        }
        for (const id of changedIds) {
            const message = storedById.get(id);
            if (message && (id === root || message.threadRootMessageId === root))
                merged.set(id, message);
        }
        const rootMessage = merged.get(root);
        const replies = [...merged.values()]
            .filter((message) => message.id !== root && message.threadRootMessageId === root)
            .sort((left, right) => (sequenceAtLeast(left.sequence, right.sequence) ? 1 : -1));
        commitThread(toEntries(rootMessage ? [rootMessage, ...replies] : replies, user()));
        return true;
    }

    function openThread(message: LiveThreadMessage) {
        setThreadRootId(message.id);
        setPanelMode("thread");
        setThreadDraft("");
        if (!props.session || !message.serverMessage) {
            commitThread([message]);
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
            const current = threadEntries();
            commitThread([
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

    /* Star state is server-authoritative for real chats (`ChatSummary.starred`);
       the local `starredChats` signal is only a fallback for the disconnected
       dev harness, where `serverChats` is empty. */
    const isStarred = (chatId: string): boolean => {
        if (!chatId) return false;
        const chat = serverChats().find((item) => item.id === chatId);
        if (chat) return chat.starred;
        return starredChats()[chatId] ?? false;
    };

    async function persistStar(chatId: string, starred: boolean) {
        const model = state();
        if (!model) return;
        const previous = serverChats();
        /* Optimistically flip the summary so the header, menu, and the new
           Starred sidebar section update instantly, then reconcile ordering
           (`starOrder`) from the server. Revert on failure. */
        setServerChats((current) =>
            current.map((chat) => (chat.id === chatId ? { ...chat, starred } : chat)),
        );
        applyNavigation();
        startBusy();
        try {
            await model.execute("setChatStar", { chatId, starred });
            await model.execute("getChats");
            setStatusHint(undefined);
        } catch (reason) {
            setServerChats(previous);
            applyNavigation();
            setStatusHint(errorMessage(reason));
        } finally {
            finishBusy();
        }
    }

    const toggleStar = (chatId: string) => {
        if (!chatId) return;
        const chat = serverChats().find((item) => item.id === chatId);
        if (state() && chat) {
            void persistStar(chatId, !chat.starred);
            return;
        }
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

    /* Build the sidebar profile for a message author. Connected messages carry a
       full sender (or an agent bot); the no-server demo falls back to the row's
       own display fields with a handle derived from the name. */
    function messageProfile(message: LiveThreadMessage): InfoPanelProfile | undefined {
        const sender = message.serverMessage?.sender;
        if (sender) {
            return {
                initials: initials(sender),
                name: fullName(sender),
                presence: presence()[sender.id]?.status === "online" ? "online" : "offline",
                title: sender.title,
                tone: toneFor(sender.id),
                username: sender.username,
            };
        }
        const bot = message.serverMessage?.senderBot;
        if (bot) {
            return {
                initials: bot.name.slice(0, 2).toUpperCase(),
                name: bot.name,
                tone: toneFor(bot.id),
                username: bot.username,
            };
        }
        if (connected) return undefined;
        const handle = message.author.toLowerCase().replace(/[^a-z0-9]+/g, "");
        if (!handle) return undefined;
        return {
            initials: message.initials ?? message.author.slice(0, 2).toUpperCase(),
            name: message.author,
            tone: message.tone,
            username: handle,
        };
    }

    /* Open a message author's profile in the info panel. Mirrors openInfoPanel
       but pins an explicit profile and hides the channel roster/edit affordances. */
    function openProfilePanel(profile: InfoPanelProfile) {
        setProfileOverride(profile);
        setPanelMembers([]);
        setPanelMode("info");
    }

    function openInfoPanel() {
        const chat = activeChat();
        setProfileOverride(undefined);
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
    /* The InfoPanel of a DM with an agent carries the agent's reasoning-effort
       setting. Only the agent's creator or a server admin may change it; anyone
       may read it. Options come from the agent's live Rig sessions, so they load
       lazily when the panel opens; the current value tracks durable `users`
       sync (see the getContacts reconcile below), never a manual refresh. */
    const infoAgent = (): UserSummary | undefined => {
        const peer = infoPeer();
        return peer?.kind === "agent" ? peer : undefined;
    };
    /* The server authorizes an effort change for the agent's creator or a
       workspace admin. The app can only observe the creator relationship
       (admin role is not exposed to product clients), so the control is enabled
       for the creator and read-only otherwise; the server remains the final
       authority and a rejected change is surfaced as a status hint. */
    const canChangeAgentEffort = () => {
        const peer = infoAgent();
        if (!peer) return false;
        return peer.createdByUserId !== undefined && peer.createdByUserId === user()?.id;
    };
    async function loadAgentEffort(agentUserId: string) {
        const model = state();
        if (!model) return;
        setAgentEffortError(undefined);
        setAgentEffortOptions(undefined);
        setAgentEffortValue(undefined);
        try {
            const result = await model.execute("getAgentEffort", { agentUserId });
            if (infoAgent()?.id !== agentUserId) return;
            setAgentEffortOptions([...result.options]);
            setAgentEffortValue(result.effort);
        } catch (reason) {
            if (infoAgent()?.id !== agentUserId) return;
            setAgentEffortError(errorMessage(reason));
        }
    }
    async function changeAgentEffort(effort: string) {
        const model = state();
        const peer = infoAgent();
        if (!model || !peer || !canChangeAgentEffort() || agentEffortBusy()) return;
        if (effort === agentEffortValue()) return;
        const previous = agentEffortValue();
        setAgentEffortBusy(true);
        setAgentEffortValue(effort);
        try {
            const result = await model.execute("changeAgentEffort", {
                agentUserId: peer.id,
                effort,
            });
            setAgentEffortValue(result.effort);
            setAgentEffortOptions([...result.options]);
            setStatusHint(`Reasoning effort set to ${effortLabel(result.effort)}.`);
        } catch (reason) {
            setAgentEffortValue(previous);
            setStatusHint(errorMessage(reason));
        } finally {
            setAgentEffortBusy(false);
        }
    }
    /* Load supported levels whenever the info panel opens for an agent DM. */
    createEffect(() => {
        const peer = panelMode() === "info" ? infoAgent() : undefined;
        if (!peer || !props.session) {
            setAgentEffortOptions(undefined);
            setAgentEffortValue(undefined);
            setAgentEffortError(undefined);
            return;
        }
        void loadAgentEffort(peer.id);
    });

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
        const starred = isStarred(activeConversationId());
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
        resetWorkspacePanel();
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
        const request = props.createRequest?.() ?? { kind: "agent" as const, nonce: 0 };
        if (seenCreateRequest === undefined) {
            seenCreateRequest = request.nonce;
            return;
        }
        if (request.nonce !== seenCreateRequest) {
            seenCreateRequest = request.nonce;
            if (request.kind === "agent") setAgentCreateOpen(true);
            else setCreateOpen(true);
        }
    });

    onMount(() => {
        const model = state();
        if (!model || !props.session) return;
        /* Initial hydration goes through the same coalesced single-flight path as
           subscription-driven hydration, so an early topology event cannot start a
           second concurrent workspace refresh alongside the mount load. */
        void hydrateWorkspace();
        stateCleanups.push(
            /* An ordinary chat-summary tick (a streaming reply advancing pts) is
               patched in memory; only a real topology/membership gap triggers a
               coalesced full hydration. This keeps a stream tick from refetching
               the workspace and remounting the chat every ~50ms. */
            model.subscribe("chats", (event) => onChatsEvent(event)),
            model.subscribe("messages", (event) => {
                /* Active-chat guard: a background chat's stream must never
                   overwrite the conversation on screen. */
                if (event.chatId !== activeConversationId()) return;
                const messages = (model.get().messagesByChat[event.chatId] ?? [])
                    .map((item) => item.message)
                    .filter((message) => !message.threadRootMessageId);
                commitEntries(toEntries(messages, user(), activeChat()?.name));
                void autoReadOpenChat(event.chatId, messages);
                prefetchImages(messages);
                /* Reconcile an open thread in memory only when this batch touches
                   its root/replies — never refetch on an unrelated main partial. */
                reconcileOpenThread(event.chatId, event.messageIds);
            }),
            model.subscribe("presence", () => {
                const snapshots = Object.fromEntries(
                    model.get().presence.map((item) => [item.userId, item]),
                );
                setPresence(snapshots);
                applyNavigation(serverChats(), contacts(), dmPeers(), snapshots);
            }),
            /* A `users` sync re-fetches contacts; when it lands, reconcile the
               open agent's effort from that durable snapshot so an effort change
               made elsewhere (another admin, another device) appears without a
               refresh. Options are model-fixed, so only the value is reconciled. */
            model.subscribe("operation", (event) => {
                if (event.operation !== "getContacts") return;
                const peer = infoAgent();
                if (!peer) return;
                const fresh = model
                    .result("getContacts")
                    ?.users.find((item) => item.id === peer.id);
                if (fresh?.agentEffort && !agentEffortBusy())
                    setAgentEffortValue(fresh.agentEffort);
            }),
            model.subscribe("typing", (event) => {
                if (event.userId === props.session!.user.id) return;
                setTypingActor(
                    event.active
                        ? {
                              chatId: event.chatId,
                              userId: event.userId,
                          }
                        : undefined,
                );
            }),
            model.subscribe("background-error", (event) => setStatusHint(event.error.message)),
            /* Keep an open files panel current: realtime hints reconcile the
               materialized tree in the state, and this mirrors the reconciled
               durable snapshot into the panel. Ignored while the panel is
               closed or focused on another chat. */
            model.subscribe("workspace", (event) => {
                if (event.chatId !== activeConversationId() || panelMode() !== "files") return;
                const current = model.get().workspacesByChat[event.chatId];
                if (event.reason === "removed" || !current) {
                    resetWorkspacePanel();
                    return;
                }
                setWorkspace(current);
            }),
            /* Keep the open file editor honest about the file on disk. A clean
               editor follows external changes; a dirty one raises a reload/merge
               banner rather than silently clobbering local edits. */
            model.subscribe("workspace-file", (event) => {
                if (event.chatId !== activeConversationId() || event.path !== openFilePath())
                    return;
                if (event.reason !== "sync") return;
                if (!event.file) {
                    setFileMissing(true);
                    setFileDiskChanged(true);
                    return;
                }
                if (fileDirty()) {
                    setFileDiskChanged(true);
                    return;
                }
                setFileBase(event.file);
                setFileDraft(event.file.content);
                setFileDiskChanged(false);
                setFileMissing(false);
            }),
        );
    });
    onCleanup(() => {
        disposed = true;
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
                            if (sectionId === "agents") setAgentCreateOpen(true);
                            if (sectionId === "channels") setDirectoryOpen(true);
                            if (sectionId === "dms") void startDirectMessage();
                        }}
                        sections={filteredSidebar()}
                        title={user() ? `${user()!.firstName}’s Happy (2)` : "Happy (2)"}
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
                                commitThread([]);
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
                                                    generationStatus={message().generationStatus}
                                                    grouped={groupedWithPrevious(
                                                        threadEntries(),
                                                        index(),
                                                        message(),
                                                    )}
                                                    gutterTime={message().gutterTime}
                                                    initials={message().initials}
                                                    menuItems={messageMenuItems(message())}
                                                    onAuthorSelect={
                                                        messageProfile(message())
                                                            ? () => {
                                                                  const profile =
                                                                      messageProfile(message());
                                                                  if (profile)
                                                                      openProfilePanel(profile);
                                                              }
                                                            : undefined
                                                    }
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
                                !profileOverride() && !infoPeer() && !canEditChannel()
                                    ? (conversation().topic ?? "No topic set yet.")
                                    : undefined
                            }
                            data-testid="channel-info-panel"
                            leadingIcon={profileOverride() || infoPeer() ? undefined : "hash"}
                            members={profileOverride() ? [] : panelMembers()}
                            onClose={() => {
                                setPanelMode(undefined);
                                setProfileOverride(undefined);
                            }}
                            profile={profileOverride() ?? infoProfile()}
                            subtitle={
                                profileOverride()
                                    ? (profileOverride()!.title ?? "Profile")
                                    : infoPeer()
                                      ? "Direct message"
                                      : canEditChannel()
                                        ? "Edit details"
                                        : "Details"
                            }
                            title={profileOverride()?.name ?? conversation().title}
                        >
                            <Show when={!profileOverride() && !infoPeer() && canEditChannel()}>
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
                            <Show when={!profileOverride() && infoAgent()}>
                                <Box style={infoFormStyle}>
                                    <FormRow
                                        control={
                                            <Show
                                                when={agentEffortOptions()}
                                                fallback={
                                                    <Box
                                                        style={
                                                            agentEffortError()
                                                                ? effortErrorStyle
                                                                : effortNoticeStyle
                                                        }
                                                    >
                                                        {agentEffortError() ??
                                                            "Loading effort levels…"}
                                                    </Box>
                                                }
                                            >
                                                {(options) => (
                                                    <SegmentedControl
                                                        data-testid="agent-effort-control"
                                                        disabled={
                                                            !canChangeAgentEffort() ||
                                                            agentEffortBusy()
                                                        }
                                                        fullWidth
                                                        onChange={(value) =>
                                                            void changeAgentEffort(value)
                                                        }
                                                        segments={options().map((value) => ({
                                                            label: effortLabel(value),
                                                            value,
                                                        }))}
                                                        value={
                                                            agentEffortValue() ?? options()[0] ?? ""
                                                        }
                                                    />
                                                )}
                                            </Show>
                                        }
                                        description={
                                            canChangeAgentEffort()
                                                ? "Applies to every private session with this agent."
                                                : "Set by the agent's owner."
                                        }
                                        label="Reasoning effort"
                                        layout="stacked"
                                    />
                                </Box>
                            </Show>
                        </InfoPanel>
                    ) : panelMode() === "files" ? (
                        <FilePanel
                            data-testid="workspace-file-panel"
                            emptyLabel="No files in this workspace yet."
                            loading={workspace() === undefined}
                            nodes={workspaceTree()}
                            note={workspaceNote()}
                            onClose={() => setPanelMode(undefined)}
                            onLoadMore={(path) => void loadMoreWorkspaceDirectory(path)}
                            onSelect={(path) => selectWorkspaceEntry(path)}
                            onToggle={(path) => void toggleWorkspaceDirectory(path)}
                            selectedId={workspaceSelected()}
                            subtitle={workspaceSubtitle()}
                        />
                    ) : !connected ? (
                        <AgentDesk done={deskDone} queued={deskQueued} running={deskRunning} />
                    ) : undefined
                }
            >
                <ChannelHeader
                    actions={
                        <>
                            <Show when={connected && Boolean(activeConversationId())}>
                                <Button
                                    aria-label="Workspace files"
                                    aria-pressed={panelMode() === "files" ? "true" : "false"}
                                    icon="files"
                                    iconOnly
                                    onClick={toggleFilesPanel}
                                    size="small"
                                    variant={panelMode() === "files" ? "secondary" : "ghost"}
                                />
                            </Show>
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
                        </>
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
                    starLabel={isStarred(activeConversationId()) ? "Unstar" : "Star channel"}
                    starred={isStarred(activeConversationId())}
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
                                        /* Read the attachment reactively off the
                                           reconciled row proxy: same-id updates
                                           keep this DOM node, so a captured
                                           snapshot would go stale. */
                                        const runAttachment = () =>
                                            item.attachment?.kind === "run"
                                                ? item.attachment
                                                : undefined;
                                        const approvalAttachment = () =>
                                            item.attachment?.kind === "approval"
                                                ? item.attachment
                                                : undefined;
                                        const eventAttachment = () =>
                                            item.attachment?.kind === "event"
                                                ? item.attachment
                                                : undefined;
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
                                                generationStatus={item.generationStatus}
                                                grouped={groupedWithPrevious(
                                                    conversationEntries(),
                                                    index(),
                                                    item,
                                                )}
                                                gutterTime={item.gutterTime}
                                                images={messageImages(item)}
                                                initials={item.initials}
                                                menuItems={messageMenuItems(item)}
                                                onAuthorSelect={
                                                    messageProfile(item)
                                                        ? () => {
                                                              const profile = messageProfile(item);
                                                              if (profile)
                                                                  openProfilePanel(profile);
                                                          }
                                                        : undefined
                                                }
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
                                                            variant="chat"
                                                        />
                                                    )}
                                                </For>
                                                <Show when={runAttachment()}>
                                                    {(run) => (
                                                        <AgentRunCard
                                                            actions={run().actions}
                                                            expanded={
                                                                expandedRuns()[item.id] ?? false
                                                            }
                                                            onExpandedChange={(expanded) =>
                                                                setExpandedRuns((current) => ({
                                                                    ...current,
                                                                    [item.id]: expanded,
                                                                }))
                                                            }
                                                            run={run().run}
                                                        >
                                                            <Show when={run().diff}>
                                                                {(diff) => (
                                                                    <DiffSnippet
                                                                        file={diff().file}
                                                                        lines={diff().lines}
                                                                        stats={diff().stats}
                                                                    />
                                                                )}
                                                            </Show>
                                                        </AgentRunCard>
                                                    )}
                                                </Show>
                                                <Show when={approvalAttachment()}>
                                                    {(approval) => (
                                                        <ApprovalCard
                                                            expanded={
                                                                expandedApprovals()[item.id] ??
                                                                false
                                                            }
                                                            onExpandedChange={(expanded) =>
                                                                setExpandedApprovals((current) => ({
                                                                    ...current,
                                                                    [item.id]: expanded,
                                                                }))
                                                            }
                                                            onResolutionChange={(resolution) =>
                                                                setApprovalResolutions(
                                                                    (current) => ({
                                                                        ...current,
                                                                        [item.id]: resolution,
                                                                    }),
                                                                )
                                                            }
                                                            request={approval().request}
                                                            resolution={
                                                                approvalResolutions()[item.id] ??
                                                                "pending"
                                                            }
                                                        />
                                                    )}
                                                </Show>
                                                <Show when={eventAttachment()}>
                                                    {(event) => (
                                                        <EventCard
                                                            badge={event().event.badge}
                                                            from={event().event.from}
                                                            icon={event().event.icon}
                                                            meta={event().event.meta}
                                                            time={event().event.time}
                                                            title={event().event.title}
                                                            to={event().event.to}
                                                        />
                                                    )}
                                                </Show>
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
            <Show when={openFilePath()}>
                <ModalOverlay>
                    <Box style={fileEditorCardStyle}>
                        <FileEditor
                            banner={fileEditorBanner()}
                            data-testid="workspace-file-editor"
                            dirty={fileDirty()}
                            onClose={closeWorkspaceFile}
                            onRevert={revertWorkspaceFile}
                            onSave={() => void saveWorkspaceFile()}
                            onValueChange={setFileDraft}
                            path={openFilePath()!}
                            saving={fileSaving()}
                            status={fileStatus()}
                            value={fileDraft()}
                        />
                    </Box>
                </ModalOverlay>
            </Show>
            <Show when={directoryOpen()}>
                <ModalOverlay onDismiss={() => setDirectoryOpen(false)}>
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
                </ModalOverlay>
            </Show>
            <Show when={agentCreateOpen()}>
                <ModalOverlay onDismiss={() => setAgentCreateOpen(false)}>
                    <Modal
                        footer={
                            <Box style={modalActionsStyle}>
                                <Button onClick={() => setAgentCreateOpen(false)} variant="ghost">
                                    Cancel
                                </Button>
                                <Button
                                    disabled={
                                        busy() ||
                                        !newAgentName().trim() ||
                                        !validAgentUsername(newAgentUsername())
                                    }
                                    icon="plus"
                                    onClick={() => void createAgent()}
                                >
                                    Create agent
                                </Button>
                            </Box>
                        }
                        icon="spark"
                        onClose={() => setAgentCreateOpen(false)}
                        size="medium"
                        title="Create agent"
                    >
                        <Box style={modalStackStyle}>
                            <FormRow
                                control={
                                    <TextField
                                        fullWidth
                                        onValueChange={(value) => {
                                            setNewAgentName(value);
                                            if (!agentUsernameEdited())
                                                setNewAgentUsername(agentUsername(value));
                                        }}
                                        placeholder="e.g. Fixer"
                                        value={newAgentName()}
                                    />
                                }
                                description="The agent’s display name in chats and messages."
                                label="Name"
                                layout="stacked"
                            />
                            <FormRow
                                control={
                                    <TextField
                                        fullWidth
                                        onValueChange={(value) => {
                                            setAgentUsernameEdited(true);
                                            setNewAgentUsername(agentUsername(value));
                                        }}
                                        placeholder="fixer"
                                        value={newAgentUsername()}
                                    />
                                }
                                description="A unique 2–32 character agent username."
                                label="Username"
                                layout="stacked"
                            />
                        </Box>
                    </Modal>
                </ModalOverlay>
            </Show>
            <Show when={createOpen()}>
                <ModalOverlay onDismiss={() => setCreateOpen(false)}>
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
                        size="medium"
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
                </ModalOverlay>
            </Show>
            <Show when={lightbox()}>
                {(image) => (
                    <ModalOverlay onDismiss={() => setLightbox(undefined)}>
                        <Lightbox
                            alt={image().caption}
                            caption={image().caption}
                            detail={image().detail}
                            imageUrl={image().url}
                            onClose={() => setLightbox(undefined)}
                        />
                    </ModalOverlay>
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

function agentUsername(value: string): string {
    return value
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_.-]+/gu, "_")
        .replace(/^[^a-z0-9]+/u, "")
        .slice(0, 32);
}

function validAgentUsername(value: string): boolean {
    return /^[a-z0-9][a-z0-9_.-]{1,31}$/u.test(value);
}

function sequenceAtLeast(left: string, right: string): boolean {
    return BigInt(left) >= BigInt(right);
}

function errorMessage(reason: unknown): string {
    return reason instanceof Error ? reason.message : "Something went wrong.";
}
