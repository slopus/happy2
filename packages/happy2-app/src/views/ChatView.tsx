import { useLayoutEffect, useReducer, useRef, type ReactNode } from "react";
import {
    ChatPage,
    type ChatPageActions,
    type ChatPageNavigation,
    type ChatPagePanel,
} from "happy2-ui";
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
    createRequest?: {
        kind: "agent" | "channel";
        nonce: number;
    };
    search: string;
    rail: ReactNode;
    titleBar: ReactNode;
};
type ChatResources = {
    chat?: ChatHandle;
    composer?: ComposerStore;
    thread?: ThreadHandle;
    workspace?: WorkspaceHandle;
    workspaceFile?: WorkspaceFileHandle;
    chatId?: string;
    threadId?: string;
    workspaceChatId?: string;
    workspaceFileKey?: string;
};
/** Owns route-keyed HappyState leases while the reusable ChatPage remains props-only. */
export function ChatView(props: ChatViewProps) {
    const state = props.state;
    const [resources, resourcesReplace] = useReducer(
        (_current: ChatResources, next: ChatResources) => next,
        {},
    );
    const resourcesRef = useRef<ChatResources>({});
    const conversation =
        props.route.primary.kind === "conversation" ? props.route.primary : undefined;
    const workspaceFileRoute =
        props.route.overlay?.kind === "workspace-file" ? props.route.overlay : undefined;
    const nextChatId = conversation?.chatId;
    const nextThreadId =
        props.route.panel?.kind === "thread" ? props.route.panel.rootMessageId : undefined;
    const nextWorkspaceChatId =
        props.route.panel?.kind === "workspace" || workspaceFileRoute ? nextChatId : undefined;
    const nextWorkspaceFileKey =
        workspaceFileRoute?.chatId && workspaceFileRoute.path
            ? `${workspaceFileRoute.chatId}\u0000${workspaceFileRoute.path}`
            : undefined;
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
        if (next.chatId !== nextChatId) {
            next.thread?.[Symbol.dispose]();
            next.workspaceFile?.[Symbol.dispose]();
            next.workspace?.[Symbol.dispose]();
            next.chat?.[Symbol.dispose]();
            if (next.chatId) state.composerRelease(next.chatId);
            next = nextChatId
                ? {
                      chatId: nextChatId,
                      chat: state.chatOpen(nextChatId),
                      composer: state.composer(nextChatId),
                  }
                : {};
            changed = true;
        }
        if (next.threadId !== nextThreadId) {
            next.thread?.[Symbol.dispose]();
            replace({
                threadId: nextThreadId,
                thread: nextThreadId ? state.threadOpen(nextThreadId) : undefined,
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
        if (changed) resourcesCommit(next);
    }, [
        state,
        nextChatId,
        nextThreadId,
        nextWorkspaceChatId,
        nextWorkspaceFileKey,
        workspaceFileRoute,
    ]);
    useLayoutEffect(
        () => () => {
            const current = resourcesRef.current;
            current.thread?.[Symbol.dispose]();
            current.workspaceFile?.[Symbol.dispose]();
            current.workspace?.[Symbol.dispose]();
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
                primary: { kind: "admin", section: "users" },
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
        const selected = conversation;
        const file = workspaceFileRoute;
        return {
            chatId: selected?.chatId,
            panel: props.route.panel,
            workspaceFilePath: file?.chatId === selected?.chatId ? file?.path : undefined,
        };
    };
    return (
        <ChatPage
            actions={actions}
            chat={resources.chat}
            composer={resources.composer}
            createRequest={props.createRequest}
            directory={state.directory()}
            navigation={pageNavigation()}
            rail={props.rail}
            search={props.search}
            sidebar={state.sidebar()}
            thread={resources.thread}
            titleBar={props.titleBar}
            user={props.session?.user ?? { id: "local-user", firstName: "Happy" }}
            workspace={resources.workspace}
            workspaceFile={resources.workspaceFile}
        />
    );
}
