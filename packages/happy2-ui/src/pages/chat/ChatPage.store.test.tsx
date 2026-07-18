import { For, createSignal } from "solid-js";
import type { ChatMessageItem, ChatSummary } from "happy2-state";
import {
    chatStoreFixtureCreate,
    composerStoreFixtureCreate,
    directoryStoreFixtureCreate,
    sidebarStoreFixtureCreate,
} from "happy2-state/testing";
import { expect, it, onTestFinished } from "vitest";
import { createRenderer } from "../../testing";
import { ChatPage } from "./ChatPage";
import { ChatMessageEntry } from "./ChatMessageEntry";
import { entriesProjectorCreate } from "./chatPageModels";

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

it("projects only changed message rows and prunes stale cached entries", () => {
    const projector = entriesProjectorCreate();
    const first = messageItem("message-1", "first");
    const second = messageItem("message-2", "second");
    const initial = projector.project([first, second]);
    const initialFirstEntry = initial[1]!.entry();
    const initialSecondEntry = initial[2]!.entry();
    const changedSecond = { ...second, message: { ...second.message, text: "changed" } };
    const updated = projector.project([{ ...first }, changedSecond]);

    expect(updated[0]).toBe(initial[0]);
    expect(updated[1]).toBe(initial[1]);
    expect(updated[2]).toBe(initial[2]);
    expect(updated[1]!.entry()).toBe(initialFirstEntry);
    expect(updated[2]!.entry()).not.toBe(initialSecondEntry);

    projector.project([changedSecond]);
    const reinserted = projector.project([first, changedSecond]);
    expect(reinserted[0]).toBe(initial[0]);
    expect(reinserted[1]).not.toBe(initial[1]);
    expect(reinserted[2]).toBe(updated[2]);
});

it("updates one mounted message while preserving its open menu and sibling DOM", async () => {
    const projector = entriesProjectorCreate();
    const first = messageItem("message-1", "first");
    const second = messageItem("message-2", "second");
    let update!: (items: ChatMessageItem[]) => void;
    const view = createRenderer();
    view.render(
        () => {
            const [entries, setEntries] = createSignal(projector.project([first, second]));
            update = (items) => setEntries(projector.project(items));
            return (
                <For each={entries()}>
                    {(slot) => (
                        <div data-slot-id={slot.id}>
                            <ChatMessageEntry
                                entry={slot.entry}
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
                    )}
                </For>
            );
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
    expect(
        view.container.querySelector(
            '[data-slot-id="message-1"] [data-happy2-ui="message-menu-popover"]',
        ),
    ).not.toBeNull();

    update([{ ...first, message: { ...first.message, text: "streamed body" } }, second]);

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

    const actions = {
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
            kind: "file" as const,
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
        agentCreate: async () => undefined,
        directMessageCreate: async () => undefined,
    };
    const view = createRenderer();
    view.render(
        () => (
            <ChatPage
                rail={<div>Rail</div>}
                search={() => ""}
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
    directory.input({ type: "directoryLoaded", users: [], channels: [] });
    sidebar.input({
        type: "sidebarLoaded",
        chats: [
            {
                chat,
                id: chat.id,
                displayName: chat.name!,
                participants: [],
            },
        ],
        sync: { protocolVersion: 1, generation: "test", sequence: "0" },
    });
    chatSurface.input({ type: "chatLoaded", chat, messages: [], hasMoreMessages: false });
    await view.ready();

    expect(view.container.textContent).toContain("State architecture");
    expect(view.container.textContent).toContain("One coarse store per rendered surface");
    composer.textUpdate("typed through the concrete composer store");
    expect(view.container.querySelector("textarea")?.value).toBe(
        "typed through the concrete composer store",
    );
});
