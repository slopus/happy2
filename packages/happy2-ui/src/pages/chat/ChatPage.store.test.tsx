import { useState } from "react";
import type { ChatMessageItem, ChatSummary } from "happy2-state";
import {
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
const chat: ChatSummary = {
    id: "chat-1",
    kind: "public_channel",
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
            audience: "people",
            agentUserIds: [],
            text,
            threadReplyCount: 0,
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
        threadOpen: () => undefined,
        threadClose: () => undefined,
        workspaceOpen: () => undefined,
        workspaceClose: () => undefined,
        workspaceFileOpen: () => undefined,
        workspaceFileReload: () => undefined,
        workspaceFileClose: () => undefined,
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
        channelUpdate: async () => undefined,
        channelDefaultAgentUpdate: async () => undefined,
        agentCreate: async () => undefined,
        directMessageCreate: async () => undefined,
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
                        onReplySelect={() => undefined}
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
    const actions = chatPageActionsCreate({ adminOpen });
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                rail={<div>Rail</div>}
                search=""
                actions={actions}
                chat={chatSurface.store}
                composer={composer}
                directory={directory.store}
                navigation={{ chatId: chat.id }}
                sidebar={sidebar.store}
                titleBar={<div>Title</div>}
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
    expect(view.container.textContent).toContain("State architecture");
    expect(view.container.textContent).toContain("One coarse store per rendered surface");
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
                    search=""
                    sidebar={sidebar.store}
                    titleBar={<div>Title</div>}
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
                search=""
                sidebar={sidebar.store}
                titleBar={<div>Title</div>}
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
                search=""
                sidebar={sidebar.store}
                titleBar={<div>Title</div>}
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

async function nextFrame(): Promise<void> {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
}
