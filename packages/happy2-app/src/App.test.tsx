import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import { happyStateCreate, type ChatSummary } from "happy2-state";
import { createFakeServer, jsonResponse } from "happy2-state/testing";
import { createSignal } from "solid-js";
import { beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "./App";
import { DesktopApp } from "./components/DesktopApp";
import type { AuthSession } from "./components/AuthGate";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";

function railItem(container: HTMLElement, id: string): HTMLButtonElement {
    const item = container.querySelector<HTMLButtonElement>(
        `[data-happy2-ui="rail-item"][data-item-id="${id}"]`,
    );
    if (!item) throw new Error(`rail item ${id} not found`);
    return item;
}

function chatPrimarySurface(container: HTMLElement): HTMLElement {
    const surface = container.querySelector<HTMLElement>('[data-happy2-ui="channel-header"]');
    if (!surface) throw new Error("chat primary surface not found");
    return surface;
}

beforeEach(() => {
    history.replaceState(null, "", "/chats");
});

describe("persistent desktop routing", () => {
    it("routes every rail destination through the URL-owned desktop model", () => {
        const screen = render(() => <App />);
        expect(screen.container.querySelectorAll('[data-happy2-ui="rail-item"]')).toHaveLength(6);

        for (const [id, path, label] of [
            ["home", "/home", "Your day at a glance"],
            ["activity", "/activity", "Activity"],
            ["threads", "/threads", "Threads"],
            ["files", "/files", "No shared files"],
            ["calls", "/calls", "Calls"],
        ] as const) {
            fireEvent.click(railItem(screen.container, id));
            expect(location.pathname).toBe(path);
            expect(screen.container.textContent).toContain(label);
        }
    });

    it("keeps the primary DOM mounted while search and profile overlays change", async () => {
        const state = happyStateCreate();
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        const [user, setUser] = createSignal({
            id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
            username: "ada",
            kind: "human" as const,
        });
        const session: AuthSession = {
            get user() {
                return user();
            },
            state,
            updateUser: setUser,
            async setAvatar(photoFileId) {
                setUser((current) => ({
                    ...current,
                    photoFileId,
                    avatarUrl: `blob:${photoFileId}`,
                }));
            },
        };
        const screen = render(() => (
            <DesktopApp navigation={navigation} session={session} state={state} />
        ));
        const primary = chatPrimarySurface(screen.container);
        const input = screen.container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        )!;

        fireEvent.input(input, { target: { value: "relay" } });
        expect(screen.container.textContent).toContain("Search Happy (2)");
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
        expect(screen.container.textContent).toContain("Profile and settings");
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        await session.setAvatar("avatar-new");
        expect(
            screen.container.querySelector<HTMLImageElement>(
                '[data-happy2-ui="rail-footer"] [data-happy2-ui="avatar-image"]',
            )?.src,
        ).toContain("blob:avatar-new");
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "file", fileId: "file-1" } },
            { layer: "overlay" },
        );
        expect(screen.container.textContent).toContain("file-1");
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        navigation.navigate(
            { ...navigation.get(), overlay: { kind: "command" } },
            { layer: "overlay" },
        );
        expect(screen.container.textContent).toContain("Command palette");
        expect(chatPrimarySurface(screen.container)).toBe(primary);
    });

    it("opens and closes route-owned panels and workspace files without remounting chat", async () => {
        history.replaceState(null, "", "/channels/chat-1");
        const navigation = desktopNavigationCreate();
        onTestFinished(() => navigation[Symbol.dispose]());
        const screen = render(() => <App navigation={navigation} />);
        const primary = chatPrimarySurface(screen.container);

        navigation.navigate({ ...navigation.get(), panel: { kind: "info" } }, { layer: "panel" });
        expect(screen.container.querySelector('[data-happy2-ui="info-panel"]')).toBeTruthy();
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("panel");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="info-panel"]')).toBeNull(),
        );

        navigation.navigate(
            {
                ...navigation.get(),
                panel: { kind: "thread", rootMessageId: "message-1" },
            },
            { layer: "panel" },
        );
        expect(screen.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy();
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        const threadDraft = screen.container.querySelector<HTMLTextAreaElement>(
            '[data-happy2-ui="thread-panel"] textarea',
        )!;
        fireEvent.input(threadDraft, { target: { value: "belongs to message 1" } });
        expect(threadDraft.value).toBe("belongs to message 1");
        navigation.navigate(
            {
                ...navigation.get(),
                panel: { kind: "thread", rootMessageId: "message-2" },
            },
            { replace: true },
        );
        expect(
            screen.container.querySelector<HTMLTextAreaElement>(
                '[data-happy2-ui="thread-panel"] textarea',
            )?.value,
        ).toBe("");
        navigation.navigate(
            {
                ...navigation.get(),
                panel: { kind: "workspace" },
                overlay: { kind: "workspace-file", chatId: "chat-1", path: "src/main.ts" },
            },
            { layer: "overlay" },
        );
        expect(screen.container.textContent).toContain("src/main.ts");
        expect(chatPrimarySurface(screen.container)).toBe(primary);
    });

    it("restores a deep-linked selected chat and thread after a full component refresh", () => {
        history.replaceState(null, "", "/channels/chat-1/thread/message-1");
        const first = render(() => <App />);
        expect(first.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy();
        expect(location.pathname).toBe("/channels/chat-1/thread/message-1");
        first.unmount();

        const second = render(() => <App />);
        expect(second.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy();
        expect(location.pathname).toBe("/channels/chat-1/thread/message-1");
        expect(location.search).not.toContain("draft");
        expect(location.search).not.toContain("upload");
    });

    it("reconciles an SSE difference beneath search without remounting the primary surface", async () => {
        const server = createFakeServer();
        const channel = channelFixture();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [channel] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: channel }));
        server.respond(
            "GET",
            "/v0/chats/chat-1/messages?limit=100",
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [], presence: [], statuses: [] }),
        );
        server.respond("GET", /^\/v0\/search/u, jsonResponse(200, { results: [] }));
        server.respond("GET", /^\/v0\/files/u, jsonResponse(200, { files: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [{ ...channel, unreadCount: 3 }],
                removedChatIds: [],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        const state = happyStateCreate({ transport: server.transport });
        await state.syncStart();
        history.replaceState(null, "", "/channels/chat-1");
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
            server.close();
        });
        const screen = render(() => <DesktopApp navigation={navigation} state={state} />);
        await state.whenIdle();
        const primary = chatPrimarySurface(screen.container);
        fireEvent.input(
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="search-field-input"]',
            )!,
            { target: { value: "relay" } },
        );
        await state.whenIdle();

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(state.sidebar().get().chats[0]?.chat.unreadCount).toBe(3);
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        expect(screen.container.textContent).toContain("Search Happy (2)");
    });
});

describe("host shell", () => {
    it("shows host window controls only for the desktop platform", () => {
        const web = render(() => <App platform="web" />);
        expect(web.container.querySelector('[data-happy2-ui="title-bar-controls"]')).toBeNull();
        web.unmount();
        history.replaceState(null, "", "/chats");
        const desktop = render(() => <App platform="desktop" />);
        expect(
            desktop.container.querySelector('[data-happy2-ui="title-bar-controls"]'),
        ).toBeTruthy();
    });

    it("keeps the authentication overlay host-specific while the server probe is pending", () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => undefined)),
        );
        try {
            const web = render(() => <App platform="web" serverUrl="http://server" />);
            expect(web.container.querySelector('[data-happy2-ui="window-drag-region"]')).toBeNull();
            web.unmount();
            const desktop = render(() => <App platform="desktop" serverUrl="http://server" />);
            expect(
                desktop.container.querySelector('[data-happy2-ui="window-drag-region"]'),
            ).toBeTruthy();
        } finally {
            vi.unstubAllGlobals();
        }
    });
});

function channelFixture(): ChatSummary {
    return {
        id: "chat-1",
        kind: "private_channel",
        name: "Route laboratory",
        slug: "route-laboratory",
        isListed: false,
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
        isPinnedHappy: false,
        createdAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:00:00.000Z",
    };
}
