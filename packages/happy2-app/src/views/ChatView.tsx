import { ChatPage, type ChatPageActions } from "happy2-ui";
import { createSignal, onCleanup, type JSX } from "solid-js";
import type {
    ChatHandle,
    ComposerStore,
    HappyState,
    ThreadHandle,
    WorkspaceFileHandle,
    WorkspaceHandle,
} from "happy2-state";
import type { AuthSession } from "../components/AuthGate";

export type ChatViewProps = {
    platform?: "desktop" | "web";
    session?: AuthSession;
    state: HappyState;
    search: () => string;
    createRequest?: () => { kind: "agent" | "channel"; nonce: number };
    rail: JSX.Element;
    titleBar: JSX.Element;
};

/** Owns keyed HappyState leases; the complete store-driven page lives in happy2-ui. */
export function ChatView(props: ChatViewProps) {
    const state = props.state;
    const [chat, setChat] = createSignal<ChatHandle>();
    const [composer, setComposer] = createSignal<ComposerStore>();
    const [thread, setThread] = createSignal<ThreadHandle>();
    const [workspace, setWorkspace] = createSignal<WorkspaceHandle>();
    const [workspaceFile, setWorkspaceFile] = createSignal<WorkspaceFileHandle>();
    let composerScopeId: string | undefined;

    function threadClose() {
        thread()?.[Symbol.dispose]();
        setThread(undefined);
    }
    function workspaceFileClose() {
        workspaceFile()?.[Symbol.dispose]();
        setWorkspaceFile(undefined);
    }
    function workspaceClose() {
        workspaceFileClose();
        workspace()?.[Symbol.dispose]();
        setWorkspace(undefined);
    }
    function chatClose() {
        threadClose();
        workspaceClose();
        chat()?.[Symbol.dispose]();
        setChat(undefined);
        setComposer(undefined);
        if (composerScopeId) state.composerRelease(composerScopeId);
        composerScopeId = undefined;
    }

    const actions: ChatPageActions = {
        chatSelect(chatId) {
            chatClose();
            const nextChat = state.chatOpen(chatId);
            const nextComposer = state.composer(chatId);
            composerScopeId = chatId;
            setChat(nextChat);
            setComposer(nextComposer);
        },
        threadOpen(rootMessageId) {
            threadClose();
            setThread(state.threadOpen(rootMessageId));
        },
        threadClose,
        workspaceOpen(chatId) {
            workspaceClose();
            setWorkspace(state.workspaceOpen(chatId));
        },
        workspaceClose,
        workspaceFileOpen(chatId, path) {
            workspaceFileClose();
            setWorkspaceFile(state.workspaceFileOpen(chatId, path));
        },
        workspaceFileClose,
        fileUpload: (body) => state.fileUpload(body),
        fileDownload: (fileId) => state.fileDownload(fileId),
        filePreviewDownload: (fileId) => state.filePreviewDownload(fileId),
        chatReadMark: (chatId, messageId) => state.chatReadMark(chatId, messageId),
        typingSet: (chatId, active) => state.typingSet(chatId, active),
        reactionAdd: (chatId, messageId, emoji) => state.reactionAdd(chatId, messageId, { emoji }),
        reactionRemove: (chatId, messageId, emoji) =>
            state.reactionRemove(chatId, messageId, { emoji }),
        messageEdit: (chatId, messageId, text, revision) =>
            state.messageEdit(chatId, messageId, text, revision),
        messageDelete: (chatId, messageId) => state.messageDelete(chatId, messageId),
        chatJoin: (chatId) => state.chatJoin(chatId),
        chatLeave: (chatId) => state.chatLeave(chatId),
        chatStarSet: (chatId, starred) => state.chatStarSet(chatId, starred),
        channelCreate: (input) => state.channelCreate(input),
        channelUpdate: (chatId, input) => state.channelUpdate(chatId, input),
        agentCreate: (input) => state.agentCreate(input),
        directMessageCreate: (userId) => state.directMessageCreate(userId),
    };

    onCleanup(chatClose);
    return (
        <ChatPage
            actions={actions}
            chat={chat()}
            composer={composer()}
            createRequest={props.createRequest}
            directory={state.directory()}
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
