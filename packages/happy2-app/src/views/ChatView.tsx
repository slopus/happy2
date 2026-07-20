import { useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import {
    ChatPage,
    StoreSurface,
    type AdminPageSection,
    type ChatPageActions,
    type ChatPageNavigation,
    type ChatPagePanel,
    type SidebarSection,
} from "happy2-ui";
import type {
    AgentTraceHandle,
    ChatContributionsHandle,
    ChatContributionsSnapshot,
    ChatHandle,
    ComposerStore,
    DocumentHandle,
    DocumentListHandle,
    HappyState,
    ThreadHandle,
    TerminalHandle,
    WorkspaceFileHandle,
    WorkspaceHandle,
} from "happy2-state";
import type { AuthSession } from "../components/AuthGate";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { usePluginAssetMasks } from "../pluginAssets";
import {
    chatMenuContributionNodes,
    composerContributionNodes,
    messageMenuContributionNodes,
    type ContributionSurface,
} from "./PluginContributionRenderer";
import { MessageApp } from "./MessageApp";
export type ChatViewProps = {
    platform?: "desktop" | "web";
    session?: AuthSession;
    state: HappyState;
    route: DesktopRoute;
    navigation: DesktopNavigation;
    createRequest?: {
        kind: "agent" | "channel";
        nonce: number;
    };
    windowControls?: boolean;
    /** @deprecated the feature rail was removed; retained for existing callers/tests. */
    rail?: ReactNode;
    navSection?: SidebarSection;
    navActiveId?: string;
    onNavSelect?: (id: string) => void;
    sidebarFooter?: ReactNode;
    /** Non-conversation primary view rendered in the workspace while the sidebar stays. */
    workspaceOverride?: ReactNode;
    /** Replaces the chat sidebar with a pushed detail level (admin sub-nav). */
    sidebarOverride?: ReactNode;
    canOpenAdmin: boolean;
    adminStartSection: AdminPageSection;
};
type ChatResources = {
    chat?: ChatHandle;
    composer?: ComposerStore;
    chatContributions?: ChatContributionsHandle;
    thread?: ThreadHandle;
    trace?: AgentTraceHandle;
    workspace?: WorkspaceHandle;
    workspaceFile?: WorkspaceFileHandle;
    terminal?: TerminalHandle;
    documentList?: DocumentListHandle;
    document?: DocumentHandle;
    chatId?: string;
    conversationKind?: "chat" | "channel";
    threadId?: string;
    traceMessageId?: string;
    workspaceChatId?: string;
    workspaceFileKey?: string;
    documentListChatId?: string;
    documentId?: string;
};
/** Owns route-keyed HappyState leases while the reusable ChatPage remains props-only. */
export function ChatView(props: ChatViewProps) {
    const state = props.state;
    const masks = usePluginAssetMasks(state);
    const [resources, resourcesReplace] = useReducer(
        (_current: ChatResources, next: ChatResources) => next,
        {},
    );
    const resourcesRef = useRef<ChatResources>({});
    const conversation =
        props.route.primary.kind === "conversation" ? props.route.primary : undefined;
    const workspaceFileRoute =
        props.route.overlay?.kind === "workspace-file" ? props.route.overlay : undefined;
    const documentRoute =
        props.route.overlay?.kind === "document" ? props.route.overlay : undefined;
    const nextChatId = conversation?.chatId;
    const nextConversationKind = conversation?.conversationKind;
    const nextThreadId =
        props.route.panel?.kind === "thread" ? props.route.panel.rootMessageId : undefined;
    const nextTraceMessageId =
        props.route.panel?.kind === "trace" ? props.route.panel.messageId : undefined;
    const nextWorkspaceChatId =
        props.route.panel?.kind === "workspace" || workspaceFileRoute ? nextChatId : undefined;
    const nextWorkspaceFileKey =
        workspaceFileRoute?.chatId && workspaceFileRoute.path
            ? `${workspaceFileRoute.chatId}\u0000${workspaceFileRoute.path}`
            : undefined;
    const nextDocumentListChatId = props.route.panel?.kind === "documents" ? nextChatId : undefined;
    const nextDocumentId = documentRoute?.documentId;
    const resourcesCommit = (next: ChatResources) => {
        resourcesRef.current = next;
        resourcesReplace(next);
    };
    useLayoutEffect(() => {
        let next = resourcesRef.current;
        let changed = false;
        const replace = (patch: Partial<ChatResources>) => {
            next = { ...next, ...patch };
            changed = true;
        };
        if (next.chatId !== nextChatId || next.conversationKind !== nextConversationKind) {
            next.thread?.[Symbol.dispose]();
            next.trace?.[Symbol.dispose]();
            next.workspaceFile?.[Symbol.dispose]();
            next.workspace?.[Symbol.dispose]();
            next.terminal?.[Symbol.dispose]();
            next.chatContributions?.[Symbol.dispose]();
            next.chat?.[Symbol.dispose]();
            if (next.chatId) state.composerRelease(next.chatId);
            if (!nextChatId) next = {};
            else {
                const chat = state.chatOpen(nextChatId);
                if (nextConversationKind === "channel") chat.getState().membersRetain();
                // Agent plugin install/uninstall requests render as approval
                // cards in every conversation and reconcile with the chat.
                chat.getState().pluginRequestsRetain();
                // Active port shares appear in the header and info panel of every
                // conversation and reconcile with the chat over the sync stream.
                chat.getState().portSharesRetain();
                next = {
                    chatId: nextChatId,
                    conversationKind: nextConversationKind,
                    chat,
                    // Channels route message audience; direct messages keep
                    // the server's own default (agent DMs stay agent-addressed).
                    composer: state.composer(
                        nextChatId,
                        nextConversationKind === "channel" ? { audience: "people" } : {},
                    ),
                    // One retained chat-contribution surface fans out to the
                    // header, composer, and every message row.
                    chatContributions: state.chatContributionsOpen(nextChatId),
                };
            }
            changed = true;
        }
        if (next.threadId !== nextThreadId) {
            next.thread?.[Symbol.dispose]();
            replace({
                threadId: nextThreadId,
                thread:
                    nextChatId && nextThreadId
                        ? state.threadOpen(nextChatId, nextThreadId)
                        : undefined,
            });
        }
        if (next.traceMessageId !== nextTraceMessageId) {
            next.trace?.[Symbol.dispose]();
            replace({
                traceMessageId: nextTraceMessageId,
                trace: nextTraceMessageId ? state.agentTraceOpen(nextTraceMessageId) : undefined,
            });
        }
        if (next.workspaceChatId !== nextWorkspaceChatId) {
            next.workspaceFile?.[Symbol.dispose]();
            next.workspace?.[Symbol.dispose]();
            replace({
                workspaceChatId: nextWorkspaceChatId,
                workspace: nextWorkspaceChatId
                    ? state.workspaceOpen(nextWorkspaceChatId)
                    : undefined,
                workspaceFileKey: undefined,
                workspaceFile: undefined,
            });
        }
        if (next.workspaceFileKey !== nextWorkspaceFileKey) {
            next.workspaceFile?.[Symbol.dispose]();
            replace({
                workspaceFileKey: nextWorkspaceFileKey,
                workspaceFile:
                    workspaceFileRoute && nextWorkspaceFileKey
                        ? state.workspaceFileOpen(
                              workspaceFileRoute.chatId,
                              workspaceFileRoute.path,
                          )
                        : undefined,
            });
        }
        if (next.documentListChatId !== nextDocumentListChatId) {
            next.documentList?.[Symbol.dispose]();
            replace({
                documentListChatId: nextDocumentListChatId,
                documentList: nextDocumentListChatId
                    ? state.documentListOpen(nextDocumentListChatId)
                    : undefined,
            });
        }
        if (next.documentId !== nextDocumentId) {
            next.document?.[Symbol.dispose]();
            replace({
                documentId: nextDocumentId,
                document: nextDocumentId ? state.documentOpen(nextDocumentId) : undefined,
            });
        }
        if (changed) resourcesCommit(next);
    }, [
        state,
        nextChatId,
        nextConversationKind,
        nextThreadId,
        nextTraceMessageId,
        nextWorkspaceChatId,
        nextWorkspaceFileKey,
        workspaceFileRoute,
        nextDocumentListChatId,
        nextDocumentId,
    ]);
    useLayoutEffect(
        () => () => {
            const current = resourcesRef.current;
            current.thread?.[Symbol.dispose]();
            current.trace?.[Symbol.dispose]();
            current.workspaceFile?.[Symbol.dispose]();
            current.workspace?.[Symbol.dispose]();
            current.terminal?.[Symbol.dispose]();
            current.documentList?.[Symbol.dispose]();
            current.document?.[Symbol.dispose]();
            current.chatContributions?.[Symbol.dispose]();
            current.chat?.[Symbol.dispose]();
            if (current.chatId) state.composerRelease(current.chatId);
            resourcesRef.current = {};
        },
        [state],
    );
    function panelOpen(panel: ChatPagePanel) {
        props.navigation.navigate({ ...props.route, panel, overlay: undefined });
    }
    const actions: ChatPageActions = {
        adminOpen() {
            props.navigation.navigate({
                ...props.route,
                primary: { kind: "admin", section: props.adminStartSection },
                panel: undefined,
                overlay: undefined,
            });
        },
        chatSelect(nextChatId, kind, replace) {
            props.navigation.navigate(
                {
                    ...props.route,
                    primary: {
                        kind: "conversation",
                        conversationKind: kind,
                        ...(nextChatId ? { chatId: nextChatId } : {}),
                    },
                    panel: undefined,
                    overlay: undefined,
                },
                { replace },
            );
        },
        infoOpen: () => panelOpen({ kind: "info" }),
        profileOpen: (userId) => panelOpen({ kind: "profile", userId }),
        panelClose: () => props.navigation.close("panel"),
        threadOpen: (rootMessageId) => panelOpen({ kind: "thread", rootMessageId }),
        threadClose: () => props.navigation.close("panel"),
        traceOpen: (messageId) => panelOpen({ kind: "trace", messageId }),
        traceClose: () => props.navigation.close("panel"),
        workspaceOpen: () => panelOpen({ kind: "workspace" }),
        workspaceClose: () => props.navigation.close("panel"),
        workspaceFileOpen(nextChatId, path) {
            const current = workspaceFileRoute;
            if (current?.chatId === nextChatId && current.path === path) return;
            props.navigation.navigate({
                ...props.route,
                overlay: { kind: "workspace-file", chatId: nextChatId, path },
            });
        },
        workspaceFileReload(nextChatId, path) {
            const current = resourcesRef.current;
            current.workspaceFile?.[Symbol.dispose]();
            resourcesCommit({
                ...current,
                workspaceFileKey: `${nextChatId}\u0000${path}`,
                workspaceFile: state.workspaceFileOpen(nextChatId, path),
            });
        },
        workspaceFileClose: () => props.navigation.close("overlay"),
        documentsOpen: () => panelOpen({ kind: "documents" }),
        documentsClose: () => props.navigation.close("panel"),
        documentOpen(selectedChatId, documentId) {
            props.navigation.navigate({
                ...props.route,
                overlay: { kind: "document", chatId: selectedChatId, documentId },
            });
        },
        documentClose: () => props.navigation.close("overlay"),
        async documentCreate(selectedChatId) {
            const document = await state.documentCreate(selectedChatId, { title: "" });
            props.navigation.navigate({
                ...props.route,
                overlay: { kind: "document", chatId: selectedChatId, documentId: document.id },
            });
        },
        documentRename: (documentId, title) => state.documentRename(documentId, title),
        fileUpload: (body) => state.fileUpload(body),
        fileDownload: (fileId) => state.fileDownload(fileId),
        filePreviewDownload: (fileId) => state.filePreviewDownload(fileId),
        chatReadMark: (selectedChatId, messageId) => state.chatReadMark(selectedChatId, messageId),
        typingSet: (selectedChatId, active) => state.typingSet(selectedChatId, active),
        reactionAdd: (selectedChatId, messageId, emoji) =>
            state.reactionAdd(selectedChatId, messageId, { emoji }),
        reactionRemove: (selectedChatId, messageId, emoji) =>
            state.reactionRemove(selectedChatId, messageId, { emoji }),
        messageEdit: (selectedChatId, messageId, text, revision) =>
            state.messageEdit(selectedChatId, messageId, text, revision),
        messageDelete: (selectedChatId, messageId) =>
            state.messageDelete(selectedChatId, messageId),
        chatJoin: (selectedChatId) => state.chatJoin(selectedChatId),
        chatLeave: (selectedChatId) => state.chatLeave(selectedChatId),
        chatStarSet: (selectedChatId, starred) => state.chatStarSet(selectedChatId, starred),
        channelCreate: (input) => state.channelCreate(input),
        channelCreateChild: (input) => state.channelCreateChild(input),
        channelArchive: (selectedChatId) => state.channelArchive(selectedChatId),
        channelUnarchive: (selectedChatId) => state.channelUnarchive(selectedChatId),
        agentModelsLoad: () => state.agentModelsLoad(),
        channelUpdate: (selectedChatId, input) => state.channelUpdate(selectedChatId, input),
        channelDefaultAgentUpdate: (selectedChatId, agentUserId) =>
            state.channelDefaultAgentUpdate(selectedChatId, agentUserId),
        agentCreate: (input) => state.agentCreate(input),
        agentConversationCreate: async (agentUserId) => {
            const chat = await state.agentConversationCreate(agentUserId);
            return chat.id;
        },
        agentEffortChange: (chatId, agentUserId, effort) =>
            state.agentEffortChange(chatId, agentUserId, effort),
        directMessageCreate: (userId) => state.directMessageCreate(userId),
        messageSend: (chatId, text) => state.messageSend(chatId, { text }),
        pluginRequestImageDownload: (chatId, requestId) =>
            state.pluginManagementRequestImageDownload(chatId, requestId),
        terminalOpen(agentUserId) {
            const current = resourcesRef.current;
            if (!current.chatId) return;
            current.terminal?.[Symbol.dispose]();
            resourcesCommit({
                ...current,
                terminal: state.terminalOpen(current.chatId, agentUserId),
            });
        },
        terminalClose() {
            const current = resourcesRef.current;
            current.terminal?.getState().terminalClose();
            current.terminal?.[Symbol.dispose]();
            resourcesCommit({ ...current, terminal: undefined });
        },
    };
    const pageNavigation = (): ChatPageNavigation => {
        const selected = conversation;
        const file = workspaceFileRoute;
        return {
            chatId: selected?.chatId,
            panel: props.route.panel,
            workspaceFilePath: file?.chatId === selected?.chatId ? file?.path : undefined,
            documentId:
                documentRoute?.chatId === selected?.chatId ? documentRoute?.documentId : undefined,
        };
    };
    const renderPage = (contributions: {
        chatMenuContributions?: ReactNode;
        composerContributions?: ReactNode;
        messageContributions?: (messageId: string) => ReactNode;
    }) => (
        <ChatPage
            actions={actions}
            agentModels={state.agentModels()}
            canOpenAdmin={props.canOpenAdmin}
            chat={resources.chat}
            chatMenuContributions={contributions.chatMenuContributions}
            composer={resources.composer}
            composerContributions={contributions.composerContributions}
            createRequest={props.createRequest}
            directory={state.directory()}
            messageContributions={contributions.messageContributions}
            navActiveId={props.navActiveId}
            navSection={props.navSection}
            navigation={pageNavigation()}
            onNavSelect={props.onNavSelect}
            renderMcpApp={(input) => <MessageApp input={input} state={state} />}
            sidebar={state.sidebar()}
            sidebarFooter={props.sidebarFooter}
            sidebarOverride={props.sidebarOverride}
            workspaceOverride={props.workspaceOverride}
            thread={resources.thread}
            trace={resources.trace}
            terminal={resources.terminal}
            windowControls={props.windowControls}
            user={props.session?.user ?? { id: "local-user", firstName: "Happy" }}
            workspace={resources.workspace}
            workspaceFile={resources.workspaceFile}
            documentList={resources.documentList}
            document={resources.document}
        />
    );
    const contributionHandle = resources.chatContributions;
    if (!contributionHandle) return renderPage({});
    // One coarse subscription for the active chat's contributions; the header,
    // composer, and every message row are fanned out from this single snapshot.
    return (
        <StoreSurface store={contributionHandle}>
            {(snapshot: ChatContributionsSnapshot & ContributionSurface) => {
                const contributions =
                    snapshot.contributions.type === "ready" ? snapshot.contributions.value : [];
                return renderPage({
                    chatMenuContributions: chatMenuContributionNodes(
                        contributions,
                        snapshot,
                        masks,
                    ),
                    composerContributions: composerContributionNodes(
                        contributions,
                        snapshot,
                        masks,
                    ),
                    messageContributions: (messageId: string) =>
                        messageMenuContributionNodes(contributions, snapshot, masks, messageId),
                });
            }}
        </StoreSurface>
    );
}
