import { useReducer } from "react";
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { happyStateCreate, type ChatSummary, type NotificationProjection } from "happy2-state";
import { createFakeServer as createBareFakeServer, jsonResponse } from "happy2-state/testing";
import { afterEach, beforeEach, describe, expect, it, onTestFinished, vi } from "vitest";
import { App } from "./App";
import { DesktopApp } from "./components/DesktopApp";
import type { AuthSession } from "./components/AuthGate";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";
import { InboxView } from "./views/InboxView";

function createFakeServer() {
    const server = createBareFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: new Date().toISOString() }),
    );
    return server;
}
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
function DesktopSessionFixture(props: {
    navigation: ReturnType<typeof desktopNavigationCreate>;
    state: ReturnType<typeof happyStateCreate>;
    sessionReady(session: AuthSession): void;
}) {
    const [user, updateUser] = useReducer(
        (_current: AuthSession["user"], next: AuthSession["user"]) => next,
        {
            id: "user-1",
            firstName: "Ada",
            lastName: "Lovelace",
            username: "ada",
            kind: "human" as const,
        },
    );
    const session: AuthSession = {
        devTokensEnabled: false,
        user,
        state: props.state,
        updateUser,
        async setAvatar(photoFileId) {
            updateUser({ ...user, photoFileId, avatarUrl: `blob:${photoFileId}` });
        },
    };
    props.sessionReady(session);
    return <DesktopApp navigation={props.navigation} session={session} state={props.state} />;
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
    it("opens the first administration section granted by effective permissions", async () => {
        const state = happyStateCreate({
            initialPermissions: { allowed: ["managePlugins"], owner: false },
        });
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        const screen = render(
            <DesktopSessionFixture navigation={navigation} sessionReady={() => {}} state={state} />,
        );
        const administration = await screen.findByRole("button", { name: "Administration" });
        fireEvent.click(administration);
        await waitFor(() => {
            expect(location.pathname).toBe("/admin/plugins");
            expect(screen.container.textContent).toContain("Plugins");
        });
        expect(screen.queryByRole("tab", { name: "Users" })).toBeNull();
        expect(screen.queryByRole("tab", { name: "Roles" })).toBeNull();
    });

    it("denies a direct administration route when no effective permission grants a section", async () => {
        history.replaceState(null, "", "/admin/roles");
        const state = happyStateCreate({
            initialPermissions: { allowed: ["managePlugins"], owner: false },
        });
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        const screen = render(
            <DesktopSessionFixture navigation={navigation} sessionReady={() => {}} state={state} />,
        );
        expect(await screen.findByText("Administration unavailable")).toBeTruthy();
        expect(screen.queryByText("New role")).toBeNull();
        expect(screen.queryByRole("button", { name: "Administration" })).toBeNull();
    });

    it("routes every rail destination through the URL-owned desktop model", async () => {
        const screen = render(<App />);
        await waitFor(() =>
            expect(screen.container.querySelectorAll('[data-happy2-ui="rail-item"]')).toHaveLength(
                6,
            ),
        );
        for (const [id, path, label] of [
            ["home", "/home", "You’re all caught up"],
            ["activity", "/activity", "No activity yet"],
            ["threads", "/threads", "No threads yet"],
            ["files", "/files", "No shared files"],
            ["calls", "/calls", "No calls yet"],
        ] as const) {
            fireEvent.click(railItem(screen.container, id));
            await waitFor(() => {
                expect(location.pathname).toBe(path);
                expect(screen.container.textContent).toContain(label);
            });
        }
    });
    it("turns activity rows into message, thread, and call destinations with human context", async () => {
        history.replaceState(null, "", "/activity");
        const state = happyStateCreate();
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        const chat = channelFixture();
        state
            .sidebar()
            .getState()
            .sidebarInput({
                type: "sidebarLoaded",
                chats: [{ id: chat.id, chat, displayName: "Route laboratory", participants: [] }],
                sync: { protocolVersion: 1, generation: "test", sequence: "0" },
            });
        const notifications: NotificationProjection[] = [
            {
                id: "notice-message",
                kind: "mention",
                chatId: chat.id,
                messageId: "message-1",
                createdAt: "2026-07-17T12:00:00.000Z",
            },
            {
                id: "notice-thread",
                kind: "thread_reply",
                chatId: chat.id,
                threadRootMessageId: "root-1",
                createdAt: "2026-07-17T12:01:00.000Z",
            },
            {
                id: "notice-call",
                kind: "call",
                createdAt: "2026-07-17T12:02:00.000Z",
            },
        ];
        const notificationStore = state.notifications();
        notificationStore.getState().notificationsInput({
            type: "notificationsLoaded",
            notifications,
        });
        const activityRoute = {
            primary: { kind: "activity" },
            files: { filter: "all", query: "" },
        } as const;
        const screen = render(
            <InboxView
                navigation={navigation}
                route={activityRoute}
                state={state}
                virtualize={false}
            />,
        );
        await waitFor(() => expect(screen.container.textContent).toContain("Route laboratory"));
        expect(screen.container.textContent).not.toContain(chat.id);

        fireEvent.click(screen.container.querySelector('[data-item-id="notice-message"]')!);
        await waitFor(() => expect(location.pathname).toBe("/channels/chat-1"));

        navigation.navigate(activityRoute);
        await waitFor(() =>
            expect(screen.container.querySelector('[data-item-id="notice-thread"]')).toBeTruthy(),
        );
        notificationStore.getState().notificationsInput({ type: "notificationsReadSucceeded" });
        fireEvent.click(screen.container.querySelector('[data-item-id="notice-thread"]')!);
        await waitFor(() => expect(location.pathname).toBe("/channels/chat-1/thread/root-1"));

        navigation.navigate(activityRoute);
        await waitFor(() =>
            expect(screen.container.querySelector('[data-item-id="notice-call"]')).toBeTruthy(),
        );
        notificationStore.getState().notificationsInput({ type: "notificationsReadSucceeded" });
        fireEvent.click(screen.container.querySelector('[data-item-id="notice-call"]')!);
        await waitFor(() => expect(location.pathname).toBe("/calls"));
    });
    it("keeps the primary DOM mounted while search and profile overlays change", async () => {
        const state = happyStateCreate();
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        let session!: AuthSession;
        const screen = render(
            <DesktopSessionFixture
                navigation={navigation}
                sessionReady={(current) => {
                    session = current;
                }}
                state={state}
            />,
        );
        const primary = chatPrimarySurface(screen.container);
        const well = screen.container.querySelector<HTMLInputElement>(
            '[data-happy2-ui="search-field-input"]',
        )!;
        fireEvent.click(well);
        expect(
            screen.container.querySelector('[data-happy2-ui="command-palette-input"]'),
        ).toBeTruthy();
        expect(
            screen.container
                .querySelector('[data-happy2-ui="modal-overlay"]')
                ?.getAttribute("data-placement"),
        ).toBe("top");
        expect(screen.container.textContent).toContain("Search Happy (2)");
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        fireEvent.click(screen.getByRole("button", { name: "Open profile" }));
        expect(screen.container.textContent).toContain("Profile and settings");
        expect(
            screen.container
                .querySelector('[data-happy2-ui="modal-overlay"]')
                ?.getAttribute("data-placement"),
        ).toBeNull();
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        await session.setAvatar("avatar-new");
        await waitFor(() =>
            expect(
                screen.container.querySelector<HTMLImageElement>(
                    '[data-happy2-ui="rail-footer"] [data-happy2-ui="avatar-image"]',
                )?.src,
            ).toContain("blob:avatar-new"),
        );
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        state
            .directory()
            .getState()
            .directoryInput({
                type: "directoryLoaded",
                users: [
                    {
                        id: "user-2",
                        displayName: "Grace Hopper",
                        username: "grace",
                        kind: "human",
                        role: "admin",
                        presence: "online",
                    },
                ],
                channels: [],
            });
        navigation.navigate({
            ...navigation.get(),
            overlay: { kind: "profile", userId: "user-2" },
        });
        await waitFor(() => expect(screen.container.textContent).toContain("Grace Hopper"));
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
        navigation.navigate({ ...navigation.get(), overlay: { kind: "file", fileId: "file-1" } });
        await waitFor(() => expect(screen.container.textContent).toContain("file-1"));
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("overlay");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="modal-overlay"]')).toBeNull(),
        );
    });
    it("opens and closes route-owned panels and workspace files without remounting chat", async () => {
        history.replaceState(null, "", "/channels/chat-1");
        const navigation = desktopNavigationCreate();
        onTestFinished(() => navigation[Symbol.dispose]());
        const screen = render(<App navigation={navigation} />);
        await waitFor(() => expect(chatPrimarySurface(screen.container)).toBeTruthy());
        const primary = chatPrimarySurface(screen.container);
        navigation.navigate({ ...navigation.get(), panel: { kind: "info" } });
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="info-panel"]')).toBeTruthy(),
        );
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        navigation.close("panel");
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="info-panel"]')).toBeNull(),
        );
        navigation.navigate({
            ...navigation.get(),
            panel: { kind: "thread", rootMessageId: "message-1" },
        });
        await waitFor(() =>
            expect(screen.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy(),
        );
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
        await waitFor(() =>
            expect(
                screen.container.querySelector<HTMLTextAreaElement>(
                    '[data-happy2-ui="thread-panel"] textarea',
                )?.value,
            ).toBe(""),
        );
        navigation.navigate({
            ...navigation.get(),
            panel: { kind: "workspace" },
            overlay: { kind: "workspace-file", chatId: "chat-1", path: "src/main.ts" },
        });
        await waitFor(() => expect(screen.container.textContent).toContain("src/main.ts"));
        expect(chatPrimarySurface(screen.container)).toBe(primary);
    });
    it("restores a deep-linked selected chat and thread after a full component refresh", async () => {
        history.replaceState(null, "", "/channels/chat-1/thread/message-1");
        const first = render(<App />);
        await waitFor(() =>
            expect(first.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy(),
        );
        expect(location.pathname).toBe("/channels/chat-1/thread/message-1");
        first.unmount();
        const second = render(<App />);
        await waitFor(() =>
            expect(second.container.querySelector('[data-happy2-ui="thread-panel"]')).toBeTruthy(),
        );
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
        const screen = render(<DesktopApp navigation={navigation} state={state} />);
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
        expect(state.sidebar().getState().chats[0]?.chat.unreadCount).toBe(3);
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        expect(
            screen.container.querySelector<HTMLInputElement>(
                '[data-happy2-ui="command-palette-input"]',
            )?.value,
        ).toBe("relay");
    });
    it("keeps each channel's audience mode for the session and applies a default-agent change live", async () => {
        const server = createFakeServer();
        const channel = channelFixture();
        const second: ChatSummary = {
            ...channel,
            id: "chat-2",
            name: "Second channel",
            slug: "second-channel",
        };
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [channel, second] }));
        server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat: channel }));
        server.respond("GET", "/v0/chats/chat-2", jsonResponse(200, { chat: second }));
        server.respond(
            "GET",
            /^\/v0\/chats\/chat-[12]\/members/u,
            jsonResponse(200, {
                users: [
                    {
                        id: "agent-1",
                        username: "happy",
                        firstName: "Happy",
                        role: "member",
                        kind: "agent",
                    },
                ],
            }),
        );
        server.respond(
            "GET",
            /^\/v0\/chats\/chat-[12]\/messages/u,
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, {
                users: [
                    {
                        id: "agent-1",
                        username: "happy",
                        firstName: "Happy",
                        role: "member",
                        kind: "agent",
                    },
                ],
                presence: [],
                statuses: [],
            }),
        );
        server.respond("GET", "/v0/presence", jsonResponse(200, { presence: [], statuses: [] }));
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "empty",
                changedChats: [{ ...channel, defaultAgentUserId: "agent-1", pts: "1" }],
                removedChatIds: [],
                areas: [],
                state: { protocolVersion: 1, generation: "g", sequence: "1" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "1" },
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            jsonResponse(200, {
                kind: "difference",
                updates: [],
                messages: [],
                chat: { ...channel, defaultAgentUserId: "agent-1", pts: "1" },
                state: { membershipEpoch: "1", pts: "1" },
                targetState: { membershipEpoch: "1", pts: "1" },
            }),
        );
        const state = happyStateCreate({ transport: server.transport });
        const composerRelease = vi.spyOn(state, "composerRelease");
        await state.syncStart();
        history.replaceState(null, "", "/channels/chat-1");
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
            server.close();
        });
        const screen = render(<DesktopApp navigation={navigation} state={state} />);
        await state.whenIdle();
        const toggle = () =>
            screen.container.querySelector<HTMLElement>('[data-happy2-ui="audience-toggle"]');
        const segment = (label: string) =>
            Array.from(
                screen.container.querySelectorAll<HTMLButtonElement>(
                    '[data-happy2-ui="audience-toggle"] .happy2-segmented-control__segment',
                ),
            ).find((candidate) => candidate.textContent === label)!;
        await waitFor(() => expect(toggle()?.getAttribute("data-value")).toBe("people"));
        fireEvent.click(segment("Agents"));
        await waitFor(() => expect(toggle()?.getAttribute("data-value")).toBe("agents"));
        // Switching to another channel starts from its own default mode…
        navigation.navigate({
            ...navigation.get(),
            primary: { kind: "conversation", conversationKind: "channel", chatId: "chat-2" },
        });
        await state.whenIdle();
        await waitFor(() => expect(toggle()?.getAttribute("data-value")).toBe("people"));
        // …and returning restores the first channel's remembered Agents mode.
        navigation.navigate({
            ...navigation.get(),
            primary: { kind: "conversation", conversationKind: "channel", chatId: "chat-1" },
        });
        await state.whenIdle();
        await waitFor(() => expect(toggle()?.getAttribute("data-value")).toBe("agents"));
        // The route kind participates in resource identity even when a malformed or
        // stale navigation reuses the same chat id for a direct-chat route.
        const releasesBeforeKindChange = composerRelease.mock.calls.length;
        navigation.navigate({
            ...navigation.get(),
            primary: { kind: "conversation", conversationKind: "chat", chatId: "chat-1" },
        });
        await waitFor(() =>
            expect(composerRelease.mock.calls.length).toBeGreaterThan(releasesBeforeKindChange),
        );
        expect(composerRelease).toHaveBeenLastCalledWith("chat-1");
        navigation.navigate({
            ...navigation.get(),
            primary: { kind: "conversation", conversationKind: "channel", chatId: "chat-1" },
        });
        await state.whenIdle();
        await waitFor(() => expect(toggle()?.getAttribute("data-value")).toBe("agents"));
        // A default-agent change arrives through sync and appears in place:
        // the primary surface, composer textarea, and draft all persist.
        const primary = chatPrimarySurface(screen.container);
        const textarea = screen.container.querySelector<HTMLTextAreaElement>(
            '[data-happy2-ui="composer-textarea"]',
        )!;
        fireEvent.input(textarea, { target: { value: "draft in flight" } });
        server.events.sync({ sequence: "1", chats: [{ chatId: "chat-1", pts: "1" }] });
        await state.whenIdle();
        await waitFor(() =>
            expect(
                state
                    .sidebar()
                    .getState()
                    .chats.find(({ id }) => id === "chat-1")?.chat.defaultAgentUserId,
            ).toBe("agent-1"),
        );
        // Agents mode carries no chip row: the composer frame itself marks the
        // mode and the placeholder names the default agent.
        await waitFor(() =>
            expect(
                screen.container
                    .querySelector('[data-happy2-ui="composer"]')
                    ?.hasAttribute("data-agents"),
            ).toBe(true),
        );
        await waitFor(() =>
            expect(
                screen.container.querySelector<HTMLTextAreaElement>(
                    '[data-happy2-ui="composer-textarea"]',
                )?.placeholder,
            ).toBe("Message Happy"),
        );
        expect(chatPrimarySurface(screen.container)).toBe(primary);
        expect(
            screen.container.querySelector<HTMLTextAreaElement>(
                '[data-happy2-ui="composer-textarea"]',
            ),
        ).toBe(textarea);
        expect(textarea.value).toBe("draft in flight");
    });
    it("opens the palette with ⌘K, keeps it open when cleared, and restores focus on close", async () => {
        const navigation = desktopNavigationCreate();
        onTestFinished(() => navigation[Symbol.dispose]());
        const screen = render(<App navigation={navigation} />);
        await waitFor(() => expect(chatPrimarySurface(screen.container)).toBeTruthy());
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
        const screen = render(<App navigation={navigation} />);
        await waitFor(() => expect(chatPrimarySurface(screen.container)).toBeTruthy());
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
    it("shows host window controls only for the desktop platform", async () => {
        const web = render(<App platform="web" />);
        await waitFor(() =>
            expect(web.container.querySelector('[data-happy2-ui="app-shell"]')).toBeTruthy(),
        );
        expect(web.container.querySelector('[data-happy2-ui="title-bar-controls"]')).toBeNull();
        web.unmount();
        history.replaceState(null, "", "/chats");
        const desktop = render(<App platform="desktop" />);
        await waitFor(() =>
            expect(
                desktop.container.querySelector('[data-happy2-ui="title-bar-controls"]'),
            ).toBeTruthy(),
        );
    });
    it("keeps the authentication overlay host-specific while the server probe is pending", async () => {
        vi.stubGlobal(
            "fetch",
            vi.fn(() => new Promise<Response>(() => undefined)),
        );
        try {
            const web = render(<App platform="web" serverUrl="http://server" />);
            await waitFor(() =>
                expect(
                    web.container.querySelector('[data-happy2-ui="onboarding-screen"]'),
                ).toBeTruthy(),
            );
            expect(web.container.querySelector('[data-happy2-ui="window-drag-region"]')).toBeNull();
            web.unmount();
            const desktop = render(<App platform="desktop" serverUrl="http://server" />);
            await waitFor(() =>
                expect(
                    desktop.container.querySelector('[data-happy2-ui="window-drag-region"]'),
                ).toBeTruthy(),
            );
        } finally {
            vi.unstubAllGlobals();
        }
    });
});
describe("default-agent conversation in the sidebar", () => {
    it("shows the default-agent conversation in the agents section at startup, not a pinned row", async () => {
        const state = happyStateCreate();
        const navigation = desktopNavigationCreate();
        onTestFinished(() => {
            navigation[Symbol.dispose]();
            state[Symbol.dispose]();
        });
        const agentDm: ChatSummary = {
            ...channelFixture(),
            id: "agent-dm",
            kind: "dm",
            name: undefined,
            slug: undefined,
            dmType: "direct",
            isListed: false,
            isDefaultAgentConversation: true,
        };
        state
            .sidebar()
            .getState()
            .sidebarInput({
                type: "sidebarLoaded",
                chats: [
                    {
                        id: agentDm.id,
                        chat: agentDm,
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
        const screen = render(
            <DesktopSessionFixture navigation={navigation} sessionReady={() => {}} state={state} />,
        );
        await waitFor(() =>
            expect(
                screen.container.querySelector(
                    '[data-section-id="agents"] [data-item-id="agent-dm"]',
                ),
            ).toBeTruthy(),
        );
        // The existence-invariant marker must not create a privileged pinned row.
        expect(screen.container.querySelector('[data-happy2-ui="sidebar-pinned"]')).toBeNull();
        fireEvent.click(
            screen.container.querySelector<HTMLElement>(
                '[data-section-id="agents"] [data-item-id="agent-dm"]',
            )!,
        );
        await waitFor(() => expect(location.pathname).toBe("/chats/agent-dm"));
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
        followed: false,
        lastReadSequence: "0",
        unreadCount: 0,
        mentionCount: 0,
        notificationLevel: "all",
        isDefaultAgentConversation: false,
        createdAt: "2026-07-17T12:00:00.000Z",
        updatedAt: "2026-07-17T12:00:00.000Z",
    };
}
