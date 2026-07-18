import {
    ChatPage,
    type ChatPageActions,
    type ChatPageNavigation,
    type ChatPagePanel,
} from "happy2-ui";
import { createEffect, createSignal, onCleanup, type JSX } from "solid-js";
import type {
    ChatHandle,
    ComposerStore,
    HappyState,
    ThreadHandle,
    WorkspaceFileHandle,
    WorkspaceHandle,
} from "happy2-state";
import type { AuthSession } from "../components/AuthGate";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";

export type ChatViewProps = {
    platform?: "desktop" | "web";
    session?: AuthSession;
    state: HappyState;
    route: DesktopRoute;
    navigation: DesktopNavigation;
    createRequest?: () => { kind: "agent" | "channel"; nonce: number };
    search: () => string;
    rail: JSX.Element;
    titleBar: JSX.Element;
};

/** Owns route-keyed HappyState leases while the reusable ChatPage remains props-only. */
export function ChatView(props: ChatViewProps) {
    const state = props.state;
    const [chat, setChat] = createSignal<ChatHandle>();
    const [composer, setComposer] = createSignal<ComposerStore>();
    const [thread, setThread] = createSignal<ThreadHandle>();
    const [workspace, setWorkspace] = createSignal<WorkspaceHandle>();
    const [workspaceFile, setWorkspaceFile] = createSignal<WorkspaceFileHandle>();
    let chatId: string | undefined;
    let composerScopeId: string | undefined;
    let threadId: string | undefined;
    let workspaceChatId: string | undefined;
    let workspaceFileKey: string | undefined;

    function threadLeaseClose() {
        thread()?.[Symbol.dispose]();
        setThread(undefined);
        threadId = undefined;
    }
    function workspaceFileLeaseClose() {
        workspaceFile()?.[Symbol.dispose]();
        setWorkspaceFile(undefined);
        workspaceFileKey = undefined;
    }
    function workspaceLeaseClose() {
        workspaceFileLeaseClose();
        workspace()?.[Symbol.dispose]();
        setWorkspace(undefined);
        workspaceChatId = undefined;
    }
    function chatLeaseClose() {
        threadLeaseClose();
        workspaceLeaseClose();
        chat()?.[Symbol.dispose]();
        setChat(undefined);
        setComposer(undefined);
        chatId = undefined;
        if (composerScopeId) state.composerRelease(composerScopeId);
        composerScopeId = undefined;
    }

    function chatLeaseFollow(nextChatId?: string) {
        if (nextChatId === chatId) return;
        chatLeaseClose();
        if (!nextChatId) return;
        chatId = nextChatId;
        composerScopeId = nextChatId;
        setChat(state.chatOpen(nextChatId));
        setComposer(state.composer(nextChatId));
    }
    function threadLeaseFollow(nextThreadId?: string) {
        if (nextThreadId === threadId) return;
        threadLeaseClose();
        if (!nextThreadId) return;
        threadId = nextThreadId;
        setThread(state.threadOpen(nextThreadId));
    }
    function workspaceLeaseFollow(nextChatId?: string) {
        if (nextChatId === workspaceChatId) return;
        workspaceLeaseClose();
        if (!nextChatId) return;
        workspaceChatId = nextChatId;
        setWorkspace(state.workspaceOpen(nextChatId));
    }
    function workspaceFileLeaseFollow(nextChatId?: string, path?: string) {
        const nextKey = nextChatId && path ? `${nextChatId}\u0000${path}` : undefined;
        if (nextKey === workspaceFileKey) return;
        workspaceFileLeaseClose();
        if (!nextChatId || !path) return;
        workspaceFileKey = nextKey;
        setWorkspaceFile(state.workspaceFileOpen(nextChatId, path));
    }

    const conversation = () =>
        props.route.primary.kind === "conversation" ? props.route.primary : undefined;
    const workspaceFileRoute = () =>
        props.route.overlay?.kind === "workspace-file" ? props.route.overlay : undefined;

    createEffect(() => chatLeaseFollow(conversation()?.chatId));
    createEffect(() => {
        const panel = props.route.panel;
        threadLeaseFollow(panel?.kind === "thread" ? panel.rootMessageId : undefined);
    });
    createEffect(() => {
        const selected = conversation()?.chatId;
        const needsWorkspace =
            props.route.panel?.kind === "workspace" ||
            props.route.overlay?.kind === "workspace-file";
        workspaceLeaseFollow(needsWorkspace ? selected : undefined);
    });
    createEffect(() => {
        const file = workspaceFileRoute();
        workspaceFileLeaseFollow(file?.chatId, file?.path);
    });

    function panelOpen(panel: ChatPagePanel) {
        props.navigation.navigate(
            { ...props.route, panel, overlay: undefined },
            { layer: "panel" },
        );
    }

    const actions: ChatPageActions = {
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
        workspaceOpen: () => panelOpen({ kind: "workspace" }),
        workspaceClose: () => props.navigation.close("panel"),
        workspaceFileOpen(nextChatId, path) {
            const current = workspaceFileRoute();
            if (current?.chatId === nextChatId && current.path === path) return;
            props.navigation.navigate(
                {
                    ...props.route,
                    overlay: { kind: "workspace-file", chatId: nextChatId, path },
                },
                { layer: "overlay" },
            );
        },
        workspaceFileReload(nextChatId, path) {
            workspaceFileLeaseClose();
            workspaceFileLeaseFollow(nextChatId, path);
        },
        workspaceFileClose: () => props.navigation.close("overlay"),
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
        channelUpdate: (selectedChatId, input) => state.channelUpdate(selectedChatId, input),
        agentCreate: (input) => state.agentCreate(input),
        directMessageCreate: (userId) => state.directMessageCreate(userId),
    };

    const pageNavigation = (): ChatPageNavigation => {
        const selected = conversation();
        const file = workspaceFileRoute();
        return {
            chatId: selected?.chatId,
            panel: props.route.panel,
            workspaceFilePath: file?.chatId === selected?.chatId ? file?.path : undefined,
        };
    };

    onCleanup(chatLeaseClose);
    return (
        <ChatPage
            actions={actions}
            chat={chat()}
            composer={composer()}
            createRequest={props.createRequest}
            directory={state.directory()}
            navigation={pageNavigation()}
            rail={props.rail}
            search={props.search}
            sidebar={state.sidebar()}
            thread={thread()}
            titleBar={props.titleBar}
            user={props.session?.user ?? { id: "local-user", firstName: "Happy" }}
            workspace={workspace()}
            workspaceFile={workspaceFile()}
        />
    );
}
