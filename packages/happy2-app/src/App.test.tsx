import { cleanup, fireEvent, render, waitFor } from "@solidjs/testing-library";
import { happyStateCreate, type ChatSummary } from "happy2-state";
import { createFakeServer, jsonResponse } from "happy2-state/testing";
import { createSignal } from "solid-js";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
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

// Vitest globals are not enabled for this package, so testing-library's auto
// cleanup never registers. Unmount every rendered tree between tests explicitly:
// otherwise a prior App survives and its window-level ⌘K listener still fires,
// opening a stale search overlay that corrupts the next test's history/navigation.
afterEach(cleanup);

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
        const well = screen.container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        )!;

        fireEvent.click(well);
        expect(
            screen.container.querySelector('[data-happy2-ui="command-palette-input"]'),
        ).toBeTruthy();
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
        fireEvent.click(
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="search-field-input"]',
            )!,
        );
        const paletteInput = screen.container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="command-palette-input"]',
        )!;
        fireEvent.input(paletteInput, { target: { value: "relay" } });
        await state.whenIdle();

        server.events.sync({ sequence: "1" });
        await state.whenIdle();
        expect(state.sidebar().get().chats[0]?.chat.unreadCount).toBe(3);
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        expect(
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="command-palette-input"]',
            )?.value,
        ).toBe("relay");
    });

    it("opens the palette with ⌘K, keeps it open when cleared, and restores focus on close", async () => {
        const navigation = desktopNavigationCreate();
        onTestFinished(() => navigation[Symbol.dispose]());
        const screen = render(() => <App navigation={navigation} />);
        const primary = chatPrimarySurface(screen.container);
        const paletteInput = () =>
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="command-palette-input"]',
            );

        // A stable focused control stands in for whatever was focused at open time.
        const opener = railItem(screen.container, "home");
        opener.focus();
        expect(document.activeElement).toBe(opener);

        // The production shortcut listener is on `window`; keep the opener focused
        // so focus-return has a target while the event is delivered globally.
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        );
        await waitFor(() => expect(paletteInput()).toBeTruthy());
        const inputEl = paletteInput();
        expect(document.activeElement).toBe(inputEl);
        expect(navigation.get().overlay).toEqual({ kind: "search", query: "" });
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        fireEvent.input(paletteInput()!, { target: { value: "relay" } });
        expect(navigation.get().overlay).toEqual({ kind: "search", query: "relay" });
        // The route-owned overlay must not remount when its query object changes:
        // the exact palette input node and the primary surface both persist.
        expect(paletteInput()).toBe(inputEl);
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        // Clearing the query leaves the palette open on the same input node.
        fireEvent.input(paletteInput()!, { target: { value: "" } });
        expect(paletteInput()).toBe(inputEl);
        expect(navigation.get().overlay).toEqual({ kind: "search", query: "" });
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        // Escape dismisses and returns focus to the invoking control.
        fireEvent.keyDown(paletteInput()!, { key: "Escape" });
        await waitFor(() => expect(paletteInput()).toBeNull());
        expect(document.activeElement).toBe(opener);
        expect(chatPrimarySurface(screen.container)).toBe(primary);
    });

    it("dismisses the palette from the close button and the backdrop, restoring focus", async () => {
        const navigation = desktopNavigationCreate();
        onTestFinished(() => navigation[Symbol.dispose]());
        const screen = render(() => <App navigation={navigation} />);
        const primary = chatPrimarySurface(screen.container);
        const paletteInput = () =>
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="command-palette-input"]',
            );
        const opener = railItem(screen.container, "home");

        // Close button.
        opener.focus();
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        );
        await waitFor(() => expect(paletteInput()).toBeTruthy());
        fireEvent.click(
            screen.container.querySelector<HTMLButtonElement>(".happy2-command-palette__close")!,
        );
        await waitFor(() => expect(paletteInput()).toBeNull());
        expect(document.activeElement).toBe(opener);
        expect(chatPrimarySurface(screen.container)).toBe(primary);

        // Backdrop (clicking the scrim outside the card).
        opener.focus();
        window.dispatchEvent(
            new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }),
        );
        await waitFor(() => expect(paletteInput()).toBeTruthy());
        fireEvent.click(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')!);
        await waitFor(() => expect(paletteInput()).toBeNull());
        expect(document.activeElement).toBe(opener);
        expect(chatPrimarySurface(screen.container)).toBe(primary);
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
