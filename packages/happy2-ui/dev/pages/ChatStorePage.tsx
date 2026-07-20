import { useLayoutEffect, useState } from "react";
import type { ChatSummary } from "happy2-state";
import {
    chatStoreFixtureCreate,
    composerStoreFixtureCreate,
    directoryStoreFixtureCreate,
    sidebarStoreFixtureCreate,
} from "happy2-state/testing";
import { Avatar } from "../../src/Avatar";
import { Button } from "../../src/Button";
import {
    ChatPage,
    type ChatPageActions,
    type ChatPageNavigation,
} from "../../src/pages/chat/ChatPage";
import { ComponentPage, FullScreenSpecimen } from "../kit";
const chat: ChatSummary = {
    id: "chat-blueprint",
    kind: "public_channel",
    name: "State architecture",
    slug: "state-architecture",
    topic: "One coarse store per rendered surface",
    isListed: true,
    isMain: false,
    autoJoin: false,
    defaultAgentUserId: "happy-blueprint",
    retentionMode: "inherit",
    defaultExpiryMode: "none",
    defaultAfterReadScope: "all_readers",
    lifecycleVersion: "1",
    createdByUserId: "user-blueprint",
    pts: "0",
    lastMessageSequence: "0",
    membershipEpoch: "1",
    membershipRole: "owner",
    starred: true,
    followed: false,
    lastReadSequence: "0",
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: "all",
    isDefaultAgentConversation: false,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
};
const passiveActions: ChatPageActions = {
    adminOpen: () => undefined,
    chatSelect: () => undefined,
    infoOpen: () => undefined,
    profileOpen: () => undefined,
    panelClose: () => undefined,
    threadOpen: () => undefined,
    threadClose: () => undefined,
    traceOpen: () => undefined,
    traceClose: () => undefined,
    workspaceOpen: () => undefined,
    workspaceClose: () => undefined,
    workspaceFileOpen: () => undefined,
    workspaceFileReload: () => undefined,
    workspaceFileClose: () => undefined,
    documentsOpen: () => undefined,
    documentsClose: () => undefined,
    documentOpen: () => undefined,
    documentClose: () => undefined,
    documentCreate: async () => undefined,
    documentRename: async () => undefined,
    fileUpload: async () => ({
        id: "file-blueprint",
        kind: "file",
        isPublic: false,
        contentType: "text/plain",
        size: 1,
    }),
    fileDownload: async () => new ArrayBuffer(0),
    filePreviewDownload: async () => new ArrayBuffer(0),
    chatReadMark: async () => undefined,
    typingSet: () => undefined,
    reactionAdd: async () => undefined,
    reactionRemove: async () => undefined,
    messageEdit: async () => undefined,
    messageDelete: async () => undefined,
    chatJoin: async () => undefined,
    chatLeave: async () => undefined,
    chatStarSet: async () => undefined,
    channelCreate: async () => undefined,
    channelCreateChild: async () => undefined,
    channelArchive: async () => undefined,
    channelUnarchive: async () => undefined,
    agentModelsLoad: async () => undefined,
    channelUpdate: async () => undefined,
    channelDefaultAgentUpdate: async () => undefined,
    agentCreate: async () => undefined,
    agentConversationCreate: async () => "chat-1",
    agentEffortChange: async () => undefined,
    directMessageCreate: async () => undefined,
    messageSend: () => undefined,
};
export function ChatStorePage() {
    const [{ sidebar, directory, chatSurface, composer }] = useState(() => {
        const sidebar = sidebarStoreFixtureCreate();
        const directory = directoryStoreFixtureCreate();
        const chatSurface = chatStoreFixtureCreate(chat.id);
        const composer = composerStoreFixtureCreate(chat.id, { audience: "agents" });
        directory.input({
            type: "directoryLoaded",
            users: [
                {
                    id: "user-blueprint",
                    displayName: "Ada Lovelace",
                    username: "ada",
                    kind: "human",
                    role: "admin",
                    presence: "online",
                    availability: "online",
                    customStatusText: "Designing state surfaces",
                },
                {
                    id: "happy-blueprint",
                    displayName: "Happy",
                    username: "happy",
                    kind: "agent",
                    role: "member",
                    presence: "online",
                },
            ],
            channels: [],
        });
        sidebar.input({
            type: "sidebarLoaded",
            chats: [
                {
                    chat,
                    id: chat.id,
                    displayName: chat.name ?? "State architecture",
                    participants: [],
                },
            ],
            sync: { protocolVersion: 1, generation: "blueprint", sequence: "0" },
        });
        chatSurface.input({ type: "chatLoaded", chat, messages: [], hasMoreMessages: false });
        return { sidebar, directory, chatSurface, composer };
    });
    const [navigation, setNavigation] = useState<ChatPageNavigation>({ chatId: chat.id });
    const actions: ChatPageActions = {
        ...passiveActions,
        chatSelect: (chatId) => setNavigation({ chatId }),
        infoOpen: () => setNavigation((value) => ({ ...value, panel: { kind: "info" } })),
        profileOpen: (userId) =>
            setNavigation((value) => ({ ...value, panel: { kind: "profile", userId } })),
        panelClose: () => setNavigation((value) => ({ ...value, panel: undefined })),
        threadOpen: (rootMessageId) =>
            setNavigation((value) => ({
                ...value,
                panel: { kind: "thread", rootMessageId },
            })),
        threadClose: () => setNavigation((value) => ({ ...value, panel: undefined })),
        traceOpen: (messageId) =>
            setNavigation((value) => ({ ...value, panel: { kind: "trace", messageId } })),
        traceClose: () => setNavigation((value) => ({ ...value, panel: undefined })),
        workspaceOpen: () => setNavigation((value) => ({ ...value, panel: { kind: "workspace" } })),
        workspaceClose: () => setNavigation((value) => ({ ...value, panel: undefined })),
        workspaceFileOpen: (_chatId, path) =>
            setNavigation((value) => ({ ...value, workspaceFilePath: path })),
        workspaceFileClose: () =>
            setNavigation((value) => ({ ...value, workspaceFilePath: undefined })),
    };
    useLayoutEffect(
        () => () => {
            sidebar[Symbol.dispose]();
            directory[Symbol.dispose]();
            chatSurface[Symbol.dispose]();
            composer[Symbol.dispose]();
        },
        [sidebar, directory, chatSurface, composer],
    );
    return (
        <ComponentPage
            contract="Surface store"
            number="P-002"
            summary="The complete chat page consumes independent sidebar, directory, chat, and composer stores with constant-size subscriptions and a closed orchestration controller."
            title="Chat page"
        >
            <FullScreenSpecimen
                detail="Loaded channel and composer · deterministic real stores · no transport, authentication, or aggregate state facade"
                label="Chat — ready"
                number="01"
            >
                <ChatPage
                    actions={actions}
                    chat={chatSurface.store}
                    composer={composer}
                    directory={directory.store}
                    navActiveId=""
                    navSection={{
                        id: "workspace",
                        items: [
                            {
                                id: "admin",
                                kind: "view",
                                icon: "settings",
                                label: "Administration",
                            },
                        ],
                    }}
                    navigation={navigation}
                    onNavSelect={() => undefined}
                    sidebar={sidebar.store}
                    sidebarFooter={
                        <div
                            style={{
                                alignItems: "center",
                                display: "flex",
                                gap: "4px",
                                width: "100%",
                            }}
                        >
                            <button className="happy2-sidebar__profile" type="button">
                                <Avatar initials="AL" online size="sm" tone="mint" />
                                <span className="happy2-sidebar__profile-name">Ada Lovelace</span>
                            </button>
                            <Button
                                aria-label="Use dark appearance"
                                icon="moon"
                                iconOnly
                                size="small"
                                variant="ghost"
                            />
                        </div>
                    }
                    user={{ id: "user-blueprint", firstName: "Ada" }}
                />
            </FullScreenSpecimen>
        </ComponentPage>
    );
}
