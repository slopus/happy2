import "../../styles.css";
import { useState } from "react";
import type {
    AgentTurnTraceDetails,
    AgentTurnTraceSummary,
    ChatMessageItem,
    ChatSummary,
} from "happy2-state";
import {
    agentTraceStoreFixtureCreate,
    chatStoreFixtureCreate,
    composerStoreFixtureCreate,
    directoryStoreFixtureCreate,
    sidebarStoreFixtureCreate,
} from "happy2-state/testing";
import { expect, it, onTestFinished, vi } from "vitest";
import { createRenderer } from "../../testing";
import { ChatPage, type ChatPageActions, type ChatPageNavigation } from "./ChatPage";
import { ChatMessageEntry } from "./ChatMessageEntry";
import { entriesProject } from "./chatPageModels";
const testProject = {
    id: "project-1",
    name: "Product",
    isDefault: true,
    syncSequence: "1",
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
};
const chat: ChatSummary = {
    id: "chat-1",
    kind: "public_channel",
    projectId: testProject.id,
    name: "State architecture",
    slug: "state-architecture",
    topic: "One coarse store per rendered surface",
    isListed: true,
    isMain: false,
    autoJoin: false,
    retentionMode: "inherit",
    defaultExpiryMode: "none",
    defaultAfterReadScope: "all_readers",
    lifecycleVersion: "1",
    createdByUserId: "user-1",
    pts: "0",
    lastMessageSequence: "0",
    membershipEpoch: "1",
    membershipRole: "owner",
    starred: false,
    lastReadSequence: "0",
    unreadCount: 0,
    mentionCount: 0,
    notificationLevel: "all",
    isDefaultAgentConversation: false,
    createdAt: "2026-07-17T12:00:00.000Z",
    updatedAt: "2026-07-17T12:00:00.000Z",
};
function messageItem(id: string, text: string): ChatMessageItem {
    return {
        source: "server",
        delivery: "sent",
        message: {
            id,
            chatId: chat.id,
            sequence: id,
            changePts: "1",
            kind: "user",
            automated: false,
            audience: "people",
            agentUserIds: [],
            text,
            revision: 1,
            mentions: [],
            attachments: [],
            reactions: [],
            receipts: [],
            expiryMode: "none",
            createdAt: "2026-07-17T12:00:00.000Z",
        },
    };
}
function chatPageActionsCreate(overrides: Partial<ChatPageActions> = {}): ChatPageActions {
    return {
        adminOpen: () => undefined,
        chatSelect: () => undefined,
        infoOpen: () => undefined,
        profileOpen: () => undefined,
        panelClose: () => undefined,
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
        documentAttach: async () => undefined,
        documentDetach: async () => undefined,
        documentDelete: async () => undefined,
        fileUpload: async () => ({
            id: "file-1",
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
        projectCreate: async () => undefined,
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
        sharedLinkOpen: () => undefined,
        ...overrides,
    };
}

it("projects messages with stable entity ids for React keyed reconciliation", () => {
    const first = messageItem("message-1", "first");
    const second = messageItem("message-2", "second");
    const initial = entriesProject([first, second]);
    const changedSecond = { ...second, message: { ...second.message, text: "changed" } };
    const updated = entriesProject([first, changedSecond]);
    expect(updated.map((entry) => entry.id)).toEqual(initial.map((entry) => entry.id));
    expect(updated[2]).toMatchObject({ kind: "message", body: "changed" });
});
it("projects an effort change as a settings service notice", () => {
    const item = messageItem("message-1", "@agent's reasoning effort changed to low");
    const entries = entriesProject([
        {
            ...item,
            message: {
                ...item.message,
                kind: "automated",
                service: {
                    type: "agent_effort_changed",
                    agentUserId: "agent-1",
                    effort: "low",
                },
            },
        },
    ]);
    expect(entries[1]).toEqual({
        kind: "notice",
        id: "message-1",
        conversationId: chat.id,
        icon: "settings",
        text: "@agent's reasoning effort changed to low",
    });
});
it("projects channel lifecycle service messages as generic user notices with server text", () => {
    const joined = messageItem("joined-1", "@ada joined #ops");
    const left = messageItem("left-1", "@ada left #ops");
    const kicked = messageItem("kicked-1", "@ada was removed from #ops");
    const archived = messageItem("archived-1", "@owner archived #ops");
    const entries = entriesProject([
        {
            ...joined,
            message: {
                ...joined.message,
                kind: "automated",
                service: { type: "user_joined", userId: "user-2" },
            },
        },
        {
            ...left,
            message: {
                ...left.message,
                kind: "automated",
                service: { type: "user_left", userId: "user-2" },
            },
        },
        {
            ...kicked,
            message: {
                ...kicked.message,
                kind: "automated",
                service: { type: "user_kicked", userId: "user-2" },
            },
        },
        {
            ...archived,
            message: {
                ...archived.message,
                kind: "automated",
                service: { type: "channel_archived", userId: "user-1" },
            },
        },
    ]);
    expect(entries.filter((entry) => entry.kind === "notice")).toEqual([
        {
            kind: "notice",
            id: "joined-1",
            conversationId: chat.id,
            icon: "users",
            text: "@ada joined #ops",
        },
        {
            kind: "notice",
            id: "left-1",
            conversationId: chat.id,
            icon: "users",
            text: "@ada left #ops",
        },
        {
            kind: "notice",
            id: "kicked-1",
            conversationId: chat.id,
            icon: "users",
            text: "@ada was removed from #ops",
        },
        {
            kind: "notice",
            id: "archived-1",
            conversationId: chat.id,
            icon: "users",
            text: "@owner archived #ops",
        },
    ]);
});
it("updates one mounted message while preserving its open menu and sibling DOM", async () => {
    const first = messageItem("message-1", "first");
    const second = messageItem("message-2", "second");
    let update!: (items: ChatMessageItem[]) => void;
    const view = createRenderer();
    view.render(
        () => {
            const [entries, setEntries] = useState(entriesProject([first, second]));
            update = (items) => setEntries(entriesProject(items));
            return entries.map((entry) => (
                <div data-slot-id={entry.id} key={entry.id}>
                    <ChatMessageEntry
                        entry={entry}
                        files={[]}
                        grouped={false}
                        images={[]}
                        menuItems={[{ id: "copy", kind: "item", label: "Copy text" }]}
                        onImageOpen={() => undefined}
                        onMenuSelect={() => undefined}
                        onProfileOpen={() => undefined}
                        onReactionSelect={() => undefined}
                    />
                </div>
            ));
        },
        { width: 600, height: 400 },
    );
    await view.ready();
    const firstRoot = view.container.querySelector(
        '[data-slot-id="message-1"] [data-happy2-ui="message"]',
    )!;
    const secondRoot = view.container.querySelector(
        '[data-slot-id="message-2"] [data-happy2-ui="message"]',
    )!;
    view.container
        .querySelector<HTMLButtonElement>(
            '[data-slot-id="message-1"] [aria-label="More message actions"]',
        )!
        .click();
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(
        view.container.querySelector(
            '[data-slot-id="message-1"] [data-happy2-ui="message-menu-popover"]',
        ),
    ).not.toBeNull();
    update([{ ...first, message: { ...first.message, text: "streamed body" } }, second]);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(
        view.container.querySelector('[data-slot-id="message-1"] [data-happy2-ui="message"]'),
    ).toBe(firstRoot);
    expect(
        view.container.querySelector('[data-slot-id="message-2"] [data-happy2-ui="message"]'),
    ).toBe(secondRoot);
    expect(firstRoot.textContent).toContain("streamed body");
    expect(
        view.container.querySelector(
            '[data-slot-id="message-1"] [data-happy2-ui="message-menu-popover"]',
        ),
    ).not.toBeNull();
});
it("renders a complete chat page from coarse HappyState surface stores", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    const composer = composerStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
        composer[Symbol.dispose]();
    });
    const adminOpen = vi.fn();
    const chatSelect = vi.fn();
    const actions = chatPageActionsCreate({ adminOpen, chatSelect });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                canOpenAdmin
                rail={<div>Rail</div>}
                sidebarSearch=""
                actions={actions}
                chat={chatSurface.store}
                composer={composer}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    directory.input({
        type: "directoryLoaded",
        users: [
            {
                id: "user-1",
                displayName: "Ada Lovelace",
                username: "ada",
                kind: "human",
                role: "admin",
                presence: "online",
            },
        ],
        channels: [],
    });
    const happyChat: ChatSummary = {
        ...chat,
        id: "happy-chat",
        kind: "dm",
        name: undefined,
        slug: undefined,
        topic: undefined,
        dmType: "direct",
        isListed: false,
        isDefaultAgentConversation: true,
    };
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [
            {
                chat,
                id: chat.id,
                displayName: chat.name!,
                participants: [],
            },
            {
                chat: happyChat,
                id: happyChat.id,
                displayName: "Happy",
                participants: [
                    {
                        id: "user-1",
                        displayName: "Ada Lovelace",
                        username: "ada",
                        kind: "human",
                    },
                    {
                        id: "happy",
                        displayName: "Happy",
                        username: "happy",
                        kind: "agent",
                        agentRole: "default",
                    },
                ],
            },
        ],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({ type: "chatLoaded", chat, messages: [], hasMoreMessages: false });
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="message-list-intro"]')).toBeNull();
    expect(view.container.textContent).not.toContain("Welcome to #state-architecture");
    expect(view.container.textContent).toContain("State architecture");
    expect(view.container.textContent).toContain("One coarse store per rendered surface");
    expect(view.container.textContent).toContain("Product");
    const channelRow = view.container.querySelector<HTMLElement>('[data-item-id="chat-1"]')!;
    channelRow.focus();
    sidebar.input({
        type: "projectSummariesReconciled",
        projects: [{ ...testProject, name: "Product launch", updatedAt: "later" }],
    });
    await nextFrame();
    expect(view.container.querySelector('[data-item-id="chat-1"]')).toBe(channelRow);
    expect(document.activeElement).toBe(channelRow);
    expect(view.container.textContent).toContain("Product launch");
    // The default-agent conversation renders as a normal row inside the agents
    // section, never in a privileged pinned row above the sections.
    expect(view.container.querySelector('[data-happy2-ui="sidebar-pinned"]')).toBeNull();
    expect(
        view.container.querySelector('[data-section-id="agents"] [data-item-id="happy-chat"]'),
    ).not.toBeNull();
    const adminButton = Array.from(view.container.querySelectorAll("button")).find(
        (button) => button.textContent?.trim() === "Administration",
    );
    expect(adminButton).not.toBeUndefined();
    adminButton!.click();
    expect(adminOpen).toHaveBeenCalledOnce();
    const happyRow = view.container.querySelector('[data-item-id="happy-chat"]')!;
    (happyRow as HTMLElement).click();
    expect(chatSelect).toHaveBeenCalledWith("happy-chat", "chat", false);
    sidebar.input({
        type: "chatSummariesReconciled",
        changedChats: [
            {
                chat: { ...happyChat, unreadCount: 4 },
                id: happyChat.id,
                displayName: "Happy",
                participants: [
                    {
                        id: "user-1",
                        displayName: "Ada Lovelace",
                        username: "ada",
                        kind: "human",
                    },
                    {
                        id: "happy",
                        displayName: "Happy",
                        username: "happy",
                        kind: "agent",
                        agentRole: "default",
                    },
                ],
            },
        ],
        removedChatIds: [],
        sync: { protocolVersion: 1, generation: "test", sequence: "1" },
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector('[data-item-id="happy-chat"]')).toBe(happyRow);
    expect(happyRow.hasAttribute("data-unread")).toBe(true);
    expect(happyRow.querySelector('[data-happy2-ui="sidebar-item-unread"]')).not.toBeNull();
    expect(happyRow.querySelector('[data-happy2-ui="count-badge"]')).toBeNull();
    sidebar.input({
        type: "chatSummariesReconciled",
        changedChats: [
            {
                chat: { ...happyChat, unreadCount: 5, mentionCount: 2 },
                id: happyChat.id,
                displayName: "Happy",
                participants: [
                    {
                        id: "user-1",
                        displayName: "Ada Lovelace",
                        username: "ada",
                        kind: "human",
                    },
                    {
                        id: "happy",
                        displayName: "Happy",
                        username: "happy",
                        kind: "agent",
                        agentRole: "default",
                    },
                ],
            },
        ],
        removedChatIds: [],
        sync: { protocolVersion: 1, generation: "test", sequence: "2" },
    });
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector('[data-item-id="happy-chat"]')).toBe(happyRow);
    expect(happyRow.querySelector('[data-happy2-ui="count-badge"]')?.textContent).toBe("2");
    composer.getState().textUpdate("typed through the concrete composer store");
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    expect(view.container.querySelector("textarea")?.value).toBe(
        "typed through the concrete composer store",
    );
});

it("does not select the first channel for a nonempty unknown route", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    const chatSelect = vi.fn();
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate({ chatSelect })}
                directory={directory.store}
                navigation={{ chatId: "unknown-chat" }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();
    await nextFrame();
    expect(chatSelect).not.toHaveBeenCalled();
    expect(view.container.textContent).not.toContain("No conversation selected");
});

it("keeps a project channel row focused and mounted while project metadata reconciles", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate()}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                sidebar={sidebar.store}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1000, height: 700 },
    );
    await view.ready();
    const row = view.container.querySelector<HTMLElement>('[data-item-id="chat-1"]')!;
    row.focus();

    sidebar.input({
        type: "projectSummariesReconciled",
        projects: [{ ...testProject, name: "Product launch", updatedAt: "later" }],
    });
    await nextFrame();

    expect(view.container.querySelector('[data-item-id="chat-1"]')).toBe(row);
    expect(document.activeElement).toBe(row);
    expect(view.container.textContent).toContain("Product launch");
});

it("creates a direct message from the directory and does not hijack later navigation", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
    });
    const owner = {
        id: "user-1",
        displayName: "Ada Lovelace",
        username: "ada",
        kind: "human" as const,
        role: "admin" as const,
        presence: "online" as const,
    };
    const teammate = {
        id: "user-2",
        displayName: "Grace Hopper",
        username: "grace",
        kind: "human" as const,
        role: "member" as const,
        presence: "online" as const,
    };
    const otherChat: ChatSummary = {
        ...chat,
        id: "chat-2",
        name: "General",
        slug: "general",
    };
    const directChat: ChatSummary = {
        ...chat,
        id: "dm-grace",
        kind: "dm",
        name: undefined,
        slug: undefined,
        topic: undefined,
        dmType: "direct",
        isListed: false,
    };
    directory.input({
        type: "directoryLoaded",
        users: [owner, teammate],
        channels: [],
    });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [
            { chat, id: chat.id, displayName: chat.name!, participants: [] },
            { chat: otherChat, id: otherChat.id, displayName: "General", participants: [] },
        ],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });

    let navigationUpdate: (navigation: ChatPageNavigation) => void = () => undefined;
    const chatSelect = vi.fn((chatId: string) => navigationUpdate({ chatId }));
    const directMessageCreate = vi.fn(async () => undefined);
    const actions = chatPageActionsCreate({ chatSelect, directMessageCreate });
    const view = createRenderer();
    view.render(
        () => {
            const [navigation, setNavigation] = useState<ChatPageNavigation>({ chatId: chat.id });
            navigationUpdate = setNavigation;
            return (
                <ChatPage
                    actions={actions}
                    directory={directory.store}
                    navigation={navigation}
                    rail={<div>Rail</div>}
                    sidebarSearch=""
                    sidebar={sidebar.store}
                    windowControls={false}
                    user={{ id: owner.id, firstName: "Ada" }}
                />
            );
        },
        { width: 1200, height: 800 },
    );
    await view.ready();

    view.container.querySelector<HTMLButtonElement>('[aria-label="New message"]')!.click();
    await nextFrame();
    expect(view.container.textContent).toContain("New direct message");
    expect(view.container.textContent).toContain("Grace Hopper · @grace");
    view.container.querySelector<HTMLButtonElement>('[data-item-id="user-2"]')!.click();
    await nextFrame();
    expect(directMessageCreate).toHaveBeenCalledExactlyOnceWith("user-2");

    sidebar.input({
        type: "chatSummariesReconciled",
        changedChats: [
            {
                chat: directChat,
                id: directChat.id,
                displayName: teammate.displayName,
                participants: [owner, teammate],
            },
        ],
        removedChatIds: [],
        sync: { protocolVersion: 1, generation: "test", sequence: "1" },
    });
    await nextFrame();
    expect(chatSelect).toHaveBeenLastCalledWith("dm-grace", "chat", false);

    view.container.querySelector<HTMLButtonElement>('[data-item-id="chat-2"]')!.click();
    await nextFrame();
    await nextFrame();
    expect(chatSelect).toHaveBeenLastCalledWith("chat-2", "channel", false);
    expect(chatSelect.mock.calls.filter(([chatId]) => chatId === "dm-grace")).toHaveLength(1);
});

it("joins an eligible private child explicitly and removes it reactively from the directory", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
    });
    const publicRejoin: ChatSummary = {
        ...chat,
        id: "alumni",
        name: "Alumni",
        slug: "alumni",
        membershipRole: undefined,
    };
    const privateParent: ChatSummary = {
        ...chat,
        id: "founders",
        kind: "private_channel",
        name: "Founders",
        slug: "founders",
        membershipRole: undefined,
    };
    const privateChild: ChatSummary = {
        ...privateParent,
        id: "hiring",
        name: "Hiring plan",
        slug: "hiring",
        parentChatId: privateParent.id,
    };
    directory.input({
        type: "directoryLoaded",
        users: [],
        channels: [publicRejoin, privateParent, privateChild],
    });
    sidebar.input({
        type: "sidebarLoaded",
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        projects: [testProject],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    let settleJoin: () => void = () => undefined;
    const chatJoin = vi.fn(
        () =>
            new Promise<void>((resolve) => {
                settleJoin = resolve;
            }),
    );
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate({ chatJoin })}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    view.container
        .querySelector<HTMLButtonElement>(
            '[data-section-id="browse"] [aria-label="Browse channels"]',
        )!
        .click();
    await nextFrame();
    const alumniRow = view.container.querySelector('[data-channel-id="alumni"]')!;
    expect(view.container.querySelector('[data-channel-id="hiring"]')?.textContent).toContain(
        "Product · Private · Inherits #Founders",
    );
    view.container.querySelector<HTMLButtonElement>('[aria-label="Join Hiring plan"]')!.click();
    await nextFrame();
    expect(chatJoin).toHaveBeenCalledExactlyOnceWith("hiring");
    expect(view.container.querySelector('[aria-label="Join Hiring plan"]')?.textContent).toContain(
        "Joining…",
    );
    expect(
        view.container.querySelector<HTMLButtonElement>('[aria-label="Join Alumni"]')!.disabled,
    ).toBe(true);

    settleJoin();
    await Promise.resolve();
    await nextFrame();
    sidebar.input({
        type: "chatSummariesReconciled",
        changedChats: [
            {
                chat: { ...privateChild, membershipRole: "member" },
                id: privateChild.id,
                displayName: privateChild.name!,
                participants: [],
            },
        ],
        removedChatIds: [],
        sync: { protocolVersion: 1, generation: "test", sequence: "1" },
    });
    directory.input({
        type: "directoryLoaded",
        users: [],
        channels: [publicRejoin, privateParent],
    });
    await nextFrame();
    expect(view.container.querySelector('[data-channel-id="hiring"]')).toBeNull();
    expect(view.container.querySelector('[data-channel-id="alumni"]')).toBe(alumniRow);
    expect(view.container.querySelector('[data-item-id="hiring"]')).not.toBeNull();
});

it("replaces the channel default agent from the info panel", async () => {
    const routedChat: ChatSummary = { ...chat, defaultAgentUserId: "agent-happy" };
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
    });
    const owner = {
        id: "user-1",
        displayName: "Ada Lovelace",
        username: "ada",
        kind: "human" as const,
        role: "admin" as const,
        presence: "online" as const,
    };
    directory.input({
        type: "directoryLoaded",
        users: [
            owner,
            {
                id: "agent-happy",
                displayName: "Happy",
                username: "happy",
                kind: "agent",
                agentRole: "default",
                role: "member",
                presence: "online",
            },
            {
                id: "agent-claude",
                displayName: "Claude",
                username: "claude",
                kind: "agent",
                role: "member",
                presence: "online",
            },
        ],
        channels: [],
    });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [
            {
                chat: routedChat,
                id: routedChat.id,
                displayName: routedChat.name!,
                participants: [],
            },
        ],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat: routedChat,
        messages: [],
        hasMoreMessages: false,
    });
    const channelDefaultAgentUpdate = vi.fn(async () => undefined);
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate({ channelDefaultAgentUpdate })}
                chat={chatSurface.store}
                directory={directory.store}
                navigation={{ chatId: routedChat.id, panel: { kind: "info" } }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: owner.id, firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    const select = view.container.querySelector<HTMLSelectElement>(
        '[data-testid="channel-default-agent"] select',
    )!;
    expect(select.value).toBe("agent-happy");
    select.value = "agent-claude";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    await expect
        .poll(() => channelDefaultAgentUpdate.mock.calls)
        .toEqual([[routedChat.id, "agent-claude"]]);
    await expect.poll(() => view.container.textContent).toContain("Default agent updated.");
});

it("renders one active port share in the header and info panel and routes open and disable to the owning chat store", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
    });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({ type: "chatLoaded", chat, messages: [], hasMoreMessages: false });
    chatSurface.input({
        type: "portSharesLoaded",
        portShares: [
            {
                id: "share-1",
                chatId: chat.id,
                agentUserId: "agent-1",
                containerPort: 3000,
                name: "Documentation Preview",
                subdomain: "documentation-preview-abc123",
                createdByUserId: "user-1",
                createdAt: "2026-01-01T00:00:00.000Z",
                url: "http://documentation-preview-abc123.preview.example",
            },
        ],
    });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate()}
                chat={chatSurface.store}
                directory={directory.store}
                navigation={{ chatId: chat.id, panel: { kind: "info" } }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    // The share appears in both surfaces from the one owning chat snapshot.
    const compact = view.container.querySelector(
        '[data-happy2-ui="port-share-control"][data-variant="compact"]',
    );
    const bar = view.container.querySelector(
        '[data-happy2-ui="port-share-control"][data-variant="bar"]',
    );
    expect(compact, "header control").not.toBeNull();
    expect(bar, "info-panel control").not.toBeNull();
    expect(bar!.querySelector('[data-happy2-ui="port-share-control-name"]')?.textContent).toBe(
        "Documentation Preview",
    );

    // The header Open routes to the chat store's optimistic open marker.
    const headerOpen = compact!.querySelector<HTMLButtonElement>(
        'button[aria-label="Open shared preview: Documentation Preview"]',
    )!;
    headerOpen.click();
    expect(chatSurface.store.getState().portShareOpeningIds).toEqual(["share-1"]);

    // Once that clears, the panel Disable routes to the disable marker.
    chatSurface.input({ type: "portShareOpenSettled", portShareId: "share-1" });
    const panelDisable = bar!.querySelector<HTMLButtonElement>(
        'button[aria-label="Stop sharing Documentation Preview"]',
    )!;
    panelDisable.click();
    expect(chatSurface.store.getState().portShareDisablingIds).toEqual(["share-1"]);
});

it("reconciles an effort notice without remounting or moving focus from the chat selector", async () => {
    const agentChat: ChatSummary = {
        ...chat,
        kind: "dm",
        name: undefined,
        slug: undefined,
        topic: undefined,
        dmType: "direct",
        isListed: false,
    };
    const owner = {
        id: "user-1",
        displayName: "Ada Lovelace",
        username: "ada",
        kind: "human" as const,
        role: "admin" as const,
        presence: "online" as const,
    };
    const agent = {
        id: "agent-1",
        displayName: "Reasoner",
        username: "reasoner",
        kind: "agent" as const,
        role: "member" as const,
        presence: "online" as const,
    };
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(agentChat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [owner, agent], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [
            {
                chat: agentChat,
                id: agentChat.id,
                displayName: agent.displayName,
                participants: [owner, agent],
            },
        ],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat: agentChat,
        messages: [],
        hasMoreMessages: false,
    });
    chatSurface.input({
        type: "agentEffortLoaded",
        value: {
            agentUserId: agent.id,
            effort: "high",
            options: ["low", "medium", "high", "xhigh"],
        },
    });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate()}
                chat={chatSurface.store}
                directory={directory.store}
                navigation={{ chatId: agentChat.id, panel: { kind: "info" } }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: owner.id, firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    const control = view.container.querySelector('[data-happy2-ui="segmented-control"]')!;
    const low = control.querySelector<HTMLButtonElement>('[data-value="low"]')!;
    const high = control.querySelector<HTMLButtonElement>('[data-value="high"]')!;
    high.focus();
    expect(document.activeElement).toBe(high);

    const notice = messageItem("effort-message", "@reasoner's reasoning effort changed to low");
    chatSurface.input({
        type: "messageUpserted",
        item: {
            ...notice,
            message: {
                ...notice.message,
                kind: "automated",
                service: {
                    type: "agent_effort_changed",
                    agentUserId: agent.id,
                    effort: "low",
                },
            },
        },
    });
    await nextFrame();

    const updatedControl = view.container.querySelector('[data-happy2-ui="segmented-control"]')!;
    expect(updatedControl).toBe(control);
    expect(updatedControl.querySelector('[data-value="low"]')).toBe(low);
    expect(updatedControl.querySelector('[data-value="high"]')).toBe(high);
    expect(low.getAttribute("aria-pressed")).toBe("true");
    expect(high.getAttribute("aria-pressed")).toBe("false");
    expect(document.activeElement).toBe(high);
    expect(view.container.querySelector('[data-happy2-ui="system-notice"]')?.textContent).toContain(
        "@reasoner's reasoning effort changed to low",
    );
});

it("keeps an optimistic message outgoing through its authoritative confirmation", async () => {
    const pending: ChatMessageItem = {
        ...messageItem("local:mutation-1", "hello"),
        source: "local",
        delivery: "sending",
        clientMutationId: "mutation-1",
    };
    const confirmed: ChatMessageItem = {
        ...messageItem("message-1", "hello"),
        clientMutationId: "mutation-1",
        message: {
            ...messageItem("message-1", "hello").message,
            sender: {
                id: "user-1",
                displayName: "Ada Lovelace",
                username: "ada",
                kind: "human",
            },
        },
    };
    expect(entriesProject([pending])[1]).toMatchObject({
        id: "local:mutation-1",
        own: true,
        renderKey: "mutation-1",
    });
    expect(entriesProject([confirmed])[1]).toMatchObject({
        id: "message-1",
        own: true,
        renderKey: "mutation-1",
    });

    let update!: (item: ChatMessageItem) => void;
    const view = createRenderer();
    view.render(
        () => {
            const [items, setItems] = useState([pending]);
            update = (item) => setItems([item]);
            return entriesProject(items).map((entry) => {
                if (entry.kind !== "message") return null;
                return (
                    <ChatMessageEntry
                        entry={entry}
                        files={[]}
                        grouped={false}
                        images={[]}
                        key={entry.renderKey}
                        menuItems={[]}
                        onImageOpen={() => undefined}
                        onMenuSelect={() => undefined}
                        onProfileOpen={() => undefined}
                        onReactionSelect={() => undefined}
                        own={entry.own}
                    />
                );
            });
        },
        { width: 600, height: 400 },
    );
    await view.ready();
    const pendingRoot = view.container.querySelector('[data-happy2-ui="message"]')!;
    expect(pendingRoot.getAttribute("data-own")).toBe("");
    expect(pendingRoot.getAttribute("data-delivery-state")).toBe("sending");
    expect(pendingRoot.textContent).not.toContain("Happy (2)");

    update(confirmed);
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
    const confirmedRoot = view.container.querySelector('[data-happy2-ui="message"]')!;
    expect(confirmedRoot).toBe(pendingRoot);
    expect(confirmedRoot.getAttribute("data-own")).toBe("");
    expect(confirmedRoot.getAttribute("data-delivery-state")).toBe("sent");
    expect(confirmedRoot.textContent).not.toContain("Happy (2)");
});

it("edits an own message through the desktop-safe dialog with its current revision", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
    });
    const owner = {
        id: "user-1",
        displayName: "Ada Lovelace",
        username: "ada",
        kind: "human" as const,
        role: "admin" as const,
        presence: "online" as const,
    };
    const baseMessage = messageItem("message-7", "Original body");
    const ownMessage: ChatMessageItem = {
        ...baseMessage,
        message: {
            ...baseMessage.message,
            revision: 7,
            sender: owner,
        },
    };
    directory.input({ type: "directoryLoaded", users: [owner], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [owner] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat,
        messages: [ownMessage],
        hasMoreMessages: false,
    });
    const messageEdit = vi.fn(async () => undefined);
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate({ messageEdit })}
                chat={chatSurface.store}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: owner.id, firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    view.container.querySelector<HTMLButtonElement>('[aria-label="More message actions"]')!.click();
    await nextFrame();
    view.container.querySelector<HTMLButtonElement>('[data-item-id="edit"]')!.click();
    await nextFrame();
    expect(view.container.textContent).toContain("Edit message");
    const editor = view.container.querySelector<HTMLTextAreaElement>(
        '[data-happy2-ui="modal-dialog"] textarea',
    )!;
    expect(editor.value).toBe("Original body");
    editor.value = "Updated body";
    editor.dispatchEvent(new Event("input", { bubbles: true }));
    await nextFrame();
    const save = Array.from(
        view.container.querySelectorAll<HTMLButtonElement>(
            '[data-happy2-ui="modal-dialog"] button',
        ),
    ).find((button) => button.textContent?.trim() === "Save changes")!;
    expect(save.disabled).toBe(false);
    save.click();
    await nextFrame();
    expect(messageEdit).toHaveBeenCalledExactlyOnceWith(chat.id, "message-7", "Updated body", 7);
    await expect.poll(() => view.container.textContent).not.toContain("Edit message");
});

function traceSummary(overrides: Partial<AgentTurnTraceSummary> = {}): AgentTurnTraceSummary {
    return {
        turnId: "message-1",
        agentUserId: "agent-1",
        status: "running",
        startedAt: "2026-07-17T12:00:01.000Z",
        latest: { kind: "reasoning", title: "Reasoning", detail: "Checking", occurredAt: 1 },
        entryCount: 1,
        subagents: [],
        backgroundTerminals: [],
        ...overrides,
    };
}

function traceEntry(
    id: string,
    title: string,
    occurredAt: number,
): AgentTurnTraceDetails["entries"][number] {
    return { id, kind: "reasoning", title, status: "complete", occurredAt };
}

function assistantItem(trace: AgentTurnTraceSummary, text = ""): ChatMessageItem {
    const base = messageItem("message-2", text);
    return {
        ...base,
        message: {
            ...base.message,
            kind: "automated",
            generationStatus: trace.status === "complete" ? "complete" : "streaming",
            agentTrace: trace,
        },
    };
}

function subscriptionCounter(store: { subscribe(listener: () => void): () => void }): () => number {
    let active = 0;
    const original = store.subscribe.bind(store);
    store.subscribe = (listener) => {
        active += 1;
        const unsubscribe = original(listener);
        return () => {
            active -= 1;
            unsubscribe();
        };
    };
    return () => active;
}

it("opens a live trace panel from the message row and keeps DOM identity across updates", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    const trace = agentTraceStoreFixtureCreate("message-2");
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
        trace[Symbol.dispose]();
    });
    const chatSubscriptions = subscriptionCounter(chatSurface.store);
    const traceSubscriptions = subscriptionCounter(trace.store);
    directory.input({
        type: "directoryLoaded",
        users: [
            {
                id: "agent-1",
                displayName: "Rig Agent",
                username: "rig_agent",
                kind: "agent",
                role: "member",
                presence: "online",
            },
        ],
        channels: [],
    });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat,
        messages: [messageItem("message-1", "Please inspect"), assistantItem(traceSummary())],
        hasMoreMessages: false,
    });
    const traceOpen = vi.fn();
    const traceClose = vi.fn();
    const view = createRenderer();
    let panelSet!: (panel: ChatPageNavigation["panel"]) => void;
    view.render(
        () => {
            const [panel, setPanel] = useState<ChatPageNavigation["panel"]>(undefined);
            panelSet = setPanel;
            return (
                <ChatPage
                    actions={chatPageActionsCreate({
                        traceOpen: (messageId) => {
                            traceOpen(messageId);
                            setPanel({ kind: "trace", messageId });
                        },
                        traceClose: () => {
                            traceClose();
                            setPanel(undefined);
                        },
                    })}
                    chat={chatSurface.store}
                    directory={directory.store}
                    navigation={{ chatId: chat.id, panel }}
                    rail={<div>Rail</div>}
                    sidebarSearch=""
                    sidebar={sidebar.store}
                    windowControls={false}
                    trace={trace.store}
                    user={{ id: "user-1", firstName: "Ada" }}
                />
            );
        },
        { width: 1200, height: 800 },
    );
    await view.ready();

    const row = view.container.querySelector<HTMLButtonElement>(
        '[data-happy2-ui="agent-trace-row"]',
    )!;
    expect(row).not.toBeNull();
    expect(row.dataset.status).toBe("running");
    expect(row.textContent).toContain("Reasoning");
    expect(row.getAttribute("aria-expanded")).toBe("false");
    const messageRoot = row.closest('[data-happy2-ui="message"]')!;

    row.focus();
    row.click();
    await nextFrame();
    expect(traceOpen).toHaveBeenCalledExactlyOnceWith("message-2");
    const panel = view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')!;
    expect(panel).not.toBeNull();
    expect(
        panel
            .querySelector('[data-happy2-ui="agent-trace-panel-state"]')
            ?.getAttribute("data-state"),
    ).toBe("loading");

    trace.input({
        type: "agentTraceLoaded",
        trace: {
            ...traceSummary({ entryCount: 2 }),
            entries: [
                traceEntry("entry-1", "Turn started", 1),
                traceEntry("entry-2", "Reasoning", 2),
            ],
        },
    });
    await nextFrame();
    const entries = view.container.querySelectorAll('[data-happy2-ui="agent-trace-panel-entry"]');
    expect(entries).toHaveLength(2);
    const firstEntry = entries[0]!;
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(panel);

    // A streaming tick updates the message and trace summary without replacing
    // the message row, the open panel, its entry DOM, or the focused control.
    chatSurface.input({
        type: "messageUpserted",
        item: assistantItem(
            traceSummary({
                entryCount: 3,
                latest: { kind: "tool", title: "Running tests", occurredAt: 3 },
            }),
            "Partial reply",
        ),
    });
    await nextFrame();
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-row"]')).toBe(row);
    expect(row.closest('[data-happy2-ui="message"]')).toBe(messageRoot);
    expect(row.textContent).toContain("Running tests");
    expect(row.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(row);
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(panel);

    trace.input({
        type: "agentTraceLoaded",
        trace: {
            ...traceSummary({
                entryCount: 3,
                latest: { kind: "tool", title: "Running tests", occurredAt: 3 },
            }),
            entries: [
                traceEntry("entry-1", "Turn started", 1),
                traceEntry("entry-2", "Reasoning", 2),
                traceEntry("entry-3", "Running tests", 3),
            ],
        },
    });
    await nextFrame();
    const updatedEntries = view.container.querySelectorAll(
        '[data-happy2-ui="agent-trace-panel-entry"]',
    );
    expect(updatedEntries).toHaveLength(3);
    expect(updatedEntries[0]).toBe(firstEntry);

    // Completion settles the durable reply in place and turns the activity row
    // into the persisted-trace link while the open panel stays mounted.
    chatSurface.input({
        type: "messageUpserted",
        item: assistantItem(
            traceSummary({
                status: "complete",
                entryCount: 4,
                latest: { kind: "status", title: "Turn completed", occurredAt: 4 },
            }),
            "All done.",
        ),
    });
    await nextFrame();
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-row"]')).toBe(row);
    expect(row.dataset.status).toBe("complete");
    expect(row.textContent).toContain("View trace");
    expect(messageRoot.textContent).toContain("All done.");
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(panel);

    // Closing an expanded trace resets its local geometry so route-driven
    // reopening starts docked instead of reviving a stale full-shell overlay.
    view.container
        .querySelector<HTMLButtonElement>('[data-happy2-ui="app-shell-panel-toggle"]')!
        .click();
    await nextFrame();
    expect(
        view.container
            .querySelector('[data-happy2-ui="app-shell-panel"]')!
            .getAttribute("data-maximized"),
    ).toBe("");
    const closeButton = panel.querySelector<HTMLButtonElement>('[aria-label="Close trace"]')!;
    closeButton.click();
    await nextFrame();
    expect(traceClose).toHaveBeenCalledOnce();
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBeNull();
    panelSet({ kind: "trace", messageId: "message-2" });
    await nextFrame();
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).not.toBeNull();
    expect(
        view.container
            .querySelector('[data-happy2-ui="app-shell-panel"]')!
            .getAttribute("data-maximized"),
    ).toBeNull();

    expect(chatSubscriptions()).toBeGreaterThan(0);
    expect(traceSubscriptions()).toBeGreaterThan(0);
    view.destroy();
    expect(chatSubscriptions()).toBe(0);
    expect(traceSubscriptions()).toBe(0);
});

it("projects live subagents and terminals into the strip with stable row identity", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    const composer = composerStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
        composer[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({ type: "chatLoaded", chat, messages: [], hasMoreMessages: false });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate()}
                chat={chatSurface.store}
                composer={composer}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                rail={<div>Rail</div>}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();
    expect(view.container.querySelector('[data-happy2-ui="agent-activity-strip"]')).toBeNull();
    const messageList = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="message-list"]',
    )!;
    const initialComposerCard = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="composer"]',
    )!;
    expect(
        initialComposerCard.getBoundingClientRect().top -
            messageList.getBoundingClientRect().bottom,
    ).toBeCloseTo(0, 1);

    // The composer keeps its DOM node, focus, value, and selection across
    // strip mount, live updates, and unmount.
    composer.getState().textUpdate("draft while the agent works");
    await nextFrame();
    const textarea = view.container.querySelector<HTMLTextAreaElement>("textarea")!;
    textarea.focus();
    textarea.setSelectionRange(6, 11);

    const activity = (latestText: string, totalTokens: number) => ({
        chatId: chat.id,
        agentUserId: "agent-1",
        turnId: "message-1",
        phase: "thinking" as const,
        tokenCount: totalTokens,
        startedAt: Date.now() - 65_000,
        subagents: [
            {
                id: "subagent-1",
                depth: 1,
                description: "Review server tests",
                status: "running" as const,
                latestText,
                startedAt: Date.now() - 5_000,
                totalTokens,
            },
        ],
        backgroundTerminals: [
            {
                id: "7",
                command: "pnpm test --watch",
                cwd: "/workspace",
                startedAt: Date.now() - 3_000,
            },
        ],
        expiresAt: Date.now() + 15_000,
    });
    chatSurface.input({
        type: "agentActivityReconciled",
        agentActivity: [activity("Reading the gym harness", 64)],
    });
    await nextFrame();
    const strip = view.container.querySelector('[data-happy2-ui="agent-activity-strip"]')!;
    expect(strip).not.toBeNull();
    const subagentRow = strip.querySelector('[data-happy2-ui="agent-activity-strip-subagent"]')!;
    const terminalRow = strip.querySelector('[data-happy2-ui="agent-activity-strip-terminal"]')!;
    expect(subagentRow.textContent).toContain("Review server tests");
    expect(subagentRow.textContent).toContain("Reading the gym harness");
    expect(terminalRow.textContent).toContain("pnpm test --watch");

    expect(document.activeElement).toBe(textarea);

    chatSurface.input({
        type: "agentActivityReconciled",
        agentActivity: [activity("No issues found", 80)],
    });
    await nextFrame();
    expect(strip.querySelector('[data-happy2-ui="agent-activity-strip-subagent"]')).toBe(
        subagentRow,
    );
    expect(strip.querySelector('[data-happy2-ui="agent-activity-strip-terminal"]')).toBe(
        terminalRow,
    );
    expect(subagentRow.textContent).toContain("No issues found");
    expect(view.container.querySelector("textarea")).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe("draft while the agent works");
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(11);

    // A maximum valid payload (32 subagents + 32 terminals) keeps the strip at
    // its 144px cap, scrolls internally, and never displaces the composer.
    const maxActivity = (latestText: string) => ({
        ...activity(latestText, 64),
        subagents: Array.from({ length: 32 }, (_, index) => ({
            id: `subagent-${index}`,
            depth: 1,
            description: `Subagent task ${index}`,
            status: "running" as const,
            latestText,
            startedAt: Date.now() - 5_000,
            totalTokens: index * 10,
        })),
        backgroundTerminals: Array.from({ length: 32 }, (_, index) => ({
            id: `${index}`,
            command: `pnpm run job-${index}`,
            cwd: `/workspace/job-${index}`,
            startedAt: Date.now() - 3_000,
        })),
    });
    chatSurface.input({
        type: "agentActivityReconciled",
        agentActivity: [maxActivity("starting")],
    });
    await nextFrame();
    const maxStrip = view.container.querySelector<HTMLElement>(
        '[data-happy2-ui="agent-activity-strip"]',
    )!;
    expect(maxStrip.getBoundingClientRect().height).toBe(144);
    const surfaceRect = maxStrip.closest("[data-gym-surface]")!.getBoundingClientRect();
    const composerRect = textarea.getBoundingClientRect();
    expect(composerRect.bottom).toBeLessThanOrEqual(surfaceRect.bottom);
    expect(composerRect.height).toBeGreaterThan(0);
    expect(document.activeElement).toBe(textarea);

    // The production footer column owns the sibling spacing: the capped strip
    // and the composer keep the declared 8px gap, and no per-agent typing pill
    // row precedes the strip (that signal lives in the composer hint and the
    // in-message trace row).
    expect(view.container.querySelector('[data-happy2-ui="agent-activity"]')).toBeNull();
    const composerCard = view.container.querySelector<HTMLElement>('[data-happy2-ui="composer"]')!;
    expect(
        composerCard.getBoundingClientRect().top - maxStrip.getBoundingClientRect().bottom,
    ).toBeCloseTo(8, 1);
    expect(surfaceRect.bottom - composerCard.getBoundingClientRect().bottom).toBeCloseTo(24, 1);

    // Scrolling the strip and then receiving a live update keeps the scroll
    // offset and the row DOM identity.
    const port = maxStrip.querySelector<HTMLElement>(
        '[data-happy2-ui="agent-activity-strip-scrollport"]',
    )!;
    expect(port.scrollHeight).toBeGreaterThan(port.clientHeight);
    port.scrollTop = 200;
    const firstMaxRow = maxStrip.querySelector('[data-happy2-ui="agent-activity-strip-subagent"]')!;
    chatSurface.input({
        type: "agentActivityReconciled",
        agentActivity: [maxActivity("still working")],
    });
    await nextFrame();
    expect(view.container.querySelector('[data-happy2-ui="agent-activity-strip-subagent"]')).toBe(
        firstMaxRow,
    );
    expect(firstMaxRow.textContent).toContain("still working");
    expect(port.scrollTop).toBe(200);
    expect(document.activeElement).toBe(textarea);

    chatSurface.input({ type: "agentActivityReconciled", agentActivity: [] });
    await nextFrame();
    expect(view.container.querySelector('[data-happy2-ui="agent-activity-strip"]')).toBeNull();
    expect(view.container.querySelector("textarea")).toBe(textarea);
    expect(document.activeElement).toBe(textarea);
    expect(textarea.value).toBe("draft while the agent works");
    expect(textarea.selectionStart).toBe(6);
    expect(textarea.selectionEnd).toBe(11);
});

function sharedResourceLink(uri: string, title?: string) {
    return {
        callId: `call-${uri}`,
        position: 0,
        installationId: "install-1",
        pluginId: "plugin-1",
        pluginShortName: "share",
        toolName: "share_link",
        kind: "shared_link" as const,
        uri,
        name: uri,
        title,
    };
}
function sharedLinkMessage(
    id: string,
    links: ReturnType<typeof sharedResourceLink>[],
    changePts = "1",
): ChatMessageItem {
    const base = messageItem(id, "shared");
    return { ...base, message: { ...base.message, changePts, resourceLinks: links } };
}
it("projects shared MCP links into the sidebar and opens them via the external-link action", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat,
        messages: [
            sharedLinkMessage("message-1", [sharedResourceLink("https://a.example", "Alpha")]),
        ],
        hasMoreMessages: false,
    });
    const sharedLinkOpen = vi.fn();
    const chatSelect = vi.fn();
    const view = createRenderer();
    onTestFinished(() => view.destroy());
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate({ sharedLinkOpen, chatSelect })}
                chat={chatSurface.store}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    const section = view.container.querySelector(
        '[data-happy2-ui="sidebar-section"][data-section-id="shared-links"]',
    )!;
    expect(section).not.toBeNull();
    const row = section.querySelector<HTMLButtonElement>(
        '[data-item-id="shared-link:https://a.example"]',
    )!;
    expect(row).not.toBeNull();
    expect(row.dataset.kind).toBe("action");
    expect(row.textContent).toContain("Alpha");

    // Selecting a shared-link row opens it externally and never selects a conversation.
    row.click();
    expect(sharedLinkOpen).toHaveBeenCalledExactlyOnceWith("https://a.example");
    expect(chatSelect).not.toHaveBeenCalled();

    // Reactively adds a link and deduplicates a repeat of the first from the new snapshot.
    chatSurface.input({
        type: "messageUpserted",
        item: sharedLinkMessage("message-2", [
            sharedResourceLink("https://a.example", "Alpha again"),
            sharedResourceLink("https://b.example", "Beta"),
        ]),
    });
    await nextFrame();
    const ids = [
        ...view.container.querySelectorAll(
            '[data-section-id="shared-links"] [data-happy2-ui="sidebar-item"]',
        ),
    ].map((item) => item.getAttribute("data-item-id"));
    expect(ids).toEqual(["shared-link:https://a.example", "shared-link:https://b.example"]);

    // Clearing every message's links (newer changePts) removes the whole section.
    chatSurface.input({ type: "messageUpserted", item: sharedLinkMessage("message-1", [], "2") });
    chatSurface.input({ type: "messageUpserted", item: sharedLinkMessage("message-2", [], "2") });
    await nextFrame();
    expect(view.container.querySelector('[data-section-id="shared-links"]')).toBeNull();
});
it("expands the trace over the shell with a working composer footer and stable identity", async () => {
    const sidebar = sidebarStoreFixtureCreate();
    const directory = directoryStoreFixtureCreate();
    const chatSurface = chatStoreFixtureCreate(chat.id);
    const trace = agentTraceStoreFixtureCreate("message-2");
    const submitted = vi.fn();
    const composer = composerStoreFixtureCreate(chat.id, { output: submitted });
    onTestFinished(() => {
        sidebar[Symbol.dispose]();
        directory[Symbol.dispose]();
        chatSurface[Symbol.dispose]();
        trace[Symbol.dispose]();
        composer[Symbol.dispose]();
    });
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        projects: [testProject],
        chats: [{ chat, id: chat.id, displayName: chat.name!, participants: [] }],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({
        type: "chatLoaded",
        chat,
        messages: [messageItem("message-1", "Please inspect"), assistantItem(traceSummary())],
        hasMoreMessages: false,
    });
    trace.input({
        type: "agentTraceLoaded",
        trace: {
            ...traceSummary({ entryCount: 1 }),
            entries: [traceEntry("entry-1", "Reasoning", 1)],
        },
    });
    const view = createRenderer();
    onTestFinished(() => view.destroy());
    view.render(
        () => (
            <ChatPage
                actions={chatPageActionsCreate()}
                chat={chatSurface.store}
                composer={composer}
                directory={directory.store}
                navigation={{ chatId: chat.id, panel: { kind: "trace", messageId: "message-2" } }}
                sidebarSearch=""
                sidebar={sidebar.store}
                windowControls={false}
                trace={trace.store}
                user={{ id: "user-1", firstName: "Ada" }}
            />
        ),
        { width: 1200, height: 800 },
    );
    await view.ready();

    // Docked: the trace panel is present, not maximized, and carries no composer footer.
    const panel = view.container.querySelector('[data-happy2-ui="app-shell-panel"]')!;
    expect(panel.getAttribute("data-maximized")).toBeNull();
    expect(view.container.querySelector('[data-happy2-ui="app-shell-panel-footer"]')).toBeNull();
    const tracePanel = view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')!;
    expect(tracePanel).not.toBeNull();

    // Expand: the panel maximizes over the content and the trace body keeps its identity.
    view.container
        .querySelector<HTMLButtonElement>('[data-happy2-ui="app-shell-panel-toggle"]')!
        .click();
    await nextFrame();
    expect(
        view.container
            .querySelector('[data-happy2-ui="app-shell-panel"]')!
            .getAttribute("data-maximized"),
    ).toBe("");
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(tracePanel);

    // A composer footer appears inside the expanded panel and shares the composer store.
    const footer = view.container.querySelector('[data-happy2-ui="app-shell-panel-footer"]')!;
    const footerTextarea = footer.querySelector<HTMLTextAreaElement>("textarea")!;
    expect(footerTextarea).not.toBeNull();
    composer.getState().textUpdate("draft from the trace view");
    await nextFrame();
    expect(footerTextarea.value).toBe("draft from the trace view");
    // The hidden workspace composer reflects the same snapshot (single source of truth).
    const workspaceTextarea = view.container.querySelector<HTMLTextAreaElement>(
        '[data-happy2-ui="app-shell-workspace"] textarea',
    )!;
    expect(workspaceTextarea.value).toBe("draft from the trace view");

    // Sending from the footer routes through the shared composer action.
    footer.querySelector<HTMLButtonElement>('[aria-label="Send message"]')!.click();
    await nextFrame();
    expect(submitted).toHaveBeenCalledWith(
        expect.objectContaining({ type: "textSubmitted", text: "draft from the trace view" }),
    );

    // An ordinary chat-store notification preserves the footer composer and trace identities.
    chatSurface.input({
        type: "messageUpserted",
        item: assistantItem(
            traceSummary({
                entryCount: 2,
                latest: { kind: "tool", title: "Running tests", occurredAt: 2 },
            }),
            "Partial reply",
        ),
    });
    await nextFrame();
    expect(footer.querySelector("textarea")).toBe(footerTextarea);
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(tracePanel);

    // Restore returns to the docked layout and removes the footer composer.
    view.container
        .querySelector<HTMLButtonElement>('[data-happy2-ui="app-shell-panel-toggle"]')!
        .click();
    await nextFrame();
    expect(
        view.container
            .querySelector('[data-happy2-ui="app-shell-panel"]')!
            .getAttribute("data-maximized"),
    ).toBeNull();
    expect(view.container.querySelector('[data-happy2-ui="app-shell-panel-footer"]')).toBeNull();
    expect(view.container.querySelector('[data-happy2-ui="agent-trace-panel"]')).toBe(tracePanel);
});
async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
