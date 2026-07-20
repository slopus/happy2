import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { happyStateCreate, type ChatSummary } from "happy2-state";
import { createFakeServer as createBareFakeServer, jsonResponse } from "happy2-state/testing";
import { afterEach, describe, expect, it, onTestFinished } from "vitest";
import { DesktopApp } from "./components/DesktopApp";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";

afterEach(cleanup);

function channel(id: string, name: string, values: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id,
        kind: "private_channel",
        name,
        slug: name.toLowerCase().replace(/[^a-z0-9]+/gu, "-"),
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
        ...values,
    };
}
const agent = {
    id: "agent-1",
    username: "happy",
    firstName: "Happy",
    role: "member" as const,
    kind: "agent" as const,
};
function seq(sequence: string) {
    return { protocolVersion: 1 as const, generation: "g", sequence };
}
function baseServer(chats: readonly ChatSummary[]) {
    const server = createBareFakeServer();
    server.respond(
        "GET",
        "/v0/drafts",
        jsonResponse(200, { drafts: [], serverTime: "2026-01-01T00:00:00.000Z" }),
    );
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, { state: seq("0"), serverTime: "now" }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [...chats] }));
    for (const chat of chats)
        server.respond("GET", `/v0/chats/${chat.id}`, jsonResponse(200, { chat }));
    server.respond("GET", /^\/v0\/chats\/[^/]+\/members/u, jsonResponse(200, { users: [agent] }));
    server.respond(
        "GET",
        /^\/v0\/chats\/[^/]+\/messages/u,
        jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
    );
    server.respond(
        "GET",
        "/v0/contacts",
        jsonResponse(200, { users: [agent], presence: [], statuses: [] }),
    );
    server.respond("GET", "/v0/presence", jsonResponse(200, { presence: [], statuses: [] }));
    server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
    return server;
}
function mount(server: ReturnType<typeof baseServer>, path: string) {
    const state = happyStateCreate({ transport: server.transport });
    void state.syncStart();
    history.replaceState(null, "", path);
    const navigation = desktopNavigationCreate();
    onTestFinished(() => {
        navigation[Symbol.dispose]();
        state[Symbol.dispose]();
        server.close();
    });
    const screen = render(<DesktopApp navigation={navigation} state={state} />);
    return { state, navigation, screen };
}
function sidebarRow(container: HTMLElement, id: string): HTMLElement | null {
    return container.querySelector<HTMLElement>(
        `[data-happy2-ui="sidebar-item"][data-item-id="${id}"]`,
    );
}

describe("child channels in the app", () => {
    it("nests a child under its parent, keeps its row identity, and dims it when the parent archive cascades", async () => {
        const parent = channel("chat-1", "Parent");
        const child = channel("chat-2", "Child", { parentChatId: "chat-1" });
        const server = baseServer([parent, child]);
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [
                    { ...parent, archivedAt: "2026-07-02T00:00:00.000Z", pts: "1" },
                    { ...child, archivedAt: "2026-07-02T00:00:00.000Z", pts: "1" },
                ],
                removedChatIds: [],
                areas: [],
                state: seq("1"),
                targetState: seq("1"),
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/getDifference",
            jsonResponse(200, {
                kind: "difference",
                updates: [],
                messages: [],
                chat: { ...parent, archivedAt: "2026-07-02T00:00:00.000Z", pts: "1" },
                state: { membershipEpoch: "1", pts: "1" },
                targetState: { membershipEpoch: "1", pts: "1" },
            }),
        );
        const { state, screen } = mount(server, "/channels/chat-1");
        await waitFor(() => expect(sidebarRow(screen.container, "chat-2")).not.toBeNull());

        // The child renders one indent level under its parent with stable keys.
        expect(sidebarRow(screen.container, "chat-1")!.getAttribute("data-depth")).toBeNull();
        const childRow = sidebarRow(screen.container, "chat-2")!;
        expect(childRow.getAttribute("data-depth")).toBe("1");
        expect(childRow.hasAttribute("data-archived")).toBe(false);

        // A parent archive cascades onto the child through the difference stream.
        server.events.sync({
            sequence: "1",
            chats: [
                { chatId: "chat-1", pts: "1" },
                { chatId: "chat-2", pts: "1" },
            ],
            areas: [],
        });
        await state.whenIdle();
        await waitFor(() =>
            expect(sidebarRow(screen.container, "chat-2")!.hasAttribute("data-archived")).toBe(
                true,
            ),
        );
        // The same DOM node was reused (identity preserved across reconciliation).
        expect(sidebarRow(screen.container, "chat-2")).toBe(childRow);
        expect(sidebarRow(screen.container, "chat-1")!.hasAttribute("data-archived")).toBe(true);
    });

    it("creates a child channel with a chosen model and selects the new child even when a same-named channel already exists", async () => {
        const parent = channel("chat-1", "Parent");
        // A pre-existing top-level channel shares the child's display name but has
        // its own unique slug; selection must not land on it after creation.
        const existing = channel("chat-3", "Investigation", { slug: "investigation-existing" });
        const server = baseServer([parent, existing]);
        server.respond(
            "GET",
            "/v0/agentModels",
            jsonResponse(200, {
                defaultModelId: "gym/mock-agent",
                models: [
                    {
                        id: "gym/mock-agent",
                        name: "Gym mock agent",
                        thinkingLevels: ["low", "high"],
                        defaultThinkingLevel: "high",
                    },
                    {
                        id: "gym/alternate-agent",
                        name: "Gym alternate agent",
                        thinkingLevels: ["low", "high"],
                        defaultThinkingLevel: "high",
                    },
                ],
            }),
        );
        const created = channel("chat-2", "Investigation", { parentChatId: "chat-1" });
        server.respond(
            "POST",
            "/v0/chats/chat-1/createChildChannel",
            jsonResponse(201, { chat: created, sync: {} }),
        );
        const { state, screen } = mount(server, "/channels/chat-1");
        await state.whenIdle();

        // Open the channel menu and pick "Create child channel".
        const menuButton = screen.container.querySelector<HTMLButtonElement>(
            '[data-happy2-ui="channel-header-menu"] button',
        );
        fireEvent.click(menuButton!);
        const childItem = [
            ...screen.container.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="menu-item"]'),
        ].find((item) => item.textContent?.includes("Create child channel"));
        fireEvent.click(childItem!);

        const modal = () => screen.container.querySelector<HTMLElement>('[data-happy2-ui="modal"]');
        await waitFor(() => expect(modal()).not.toBeNull());
        // The model picker loads its options from the server catalog.
        const select = () =>
            modal()!.querySelector<HTMLSelectElement>('[data-happy2-ui="select-native"]');
        await waitFor(() =>
            expect([...(select()?.options ?? [])].map((option) => option.value)).toContain(
                "gym/alternate-agent",
            ),
        );

        const nameInput = modal()!.querySelector<HTMLInputElement>(
            '[data-happy2-ui="text-field-input"]',
        );
        // TextField updates on the native `input` event, while Select uses `change`.
        fireEvent.input(nameInput!, { target: { value: "Investigation" } });
        fireEvent.change(select()!, { target: { value: "gym/alternate-agent" } });
        const createButton = [
            ...modal()!.querySelectorAll<HTMLButtonElement>(
                '[data-happy2-ui="modal-footer"] button',
            ),
        ].find((button) => button.textContent?.includes("Create child channel"));
        fireEvent.click(createButton!);
        await state.whenIdle();

        const request = server.requests.find(
            ({ method, path }) =>
                method === "POST" && path === "/v0/chats/chat-1/createChildChannel",
        );
        expect(request?.body).toMatchObject({
            name: "Investigation",
            slug: "investigation",
            agentModelId: "gym/alternate-agent",
        });

        // The new child appears nested under its parent…
        await waitFor(() => expect(sidebarRow(screen.container, "chat-2")).not.toBeNull());
        const childRow = sidebarRow(screen.container, "chat-2")!;
        expect(childRow.getAttribute("data-depth")).toBe("1");
        const rows = [
            ...screen.container.querySelectorAll<HTMLElement>('[data-happy2-ui="sidebar-item"]'),
        ].map((row) => row.getAttribute("data-item-id"));
        expect(rows.indexOf("chat-2")).toBe(rows.indexOf("chat-1") + 1);
        // …and is the selected/navigated channel, not the pre-existing same-named one.
        await waitFor(() => expect(childRow.getAttribute("aria-current")).toBe("page"));
        expect(sidebarRow(screen.container, "chat-3")!.getAttribute("aria-current")).not.toBe(
            "page",
        );
    });

    it("archives a child channel independently from its parent", async () => {
        const parent = channel("chat-1", "Parent");
        const child = channel("chat-2", "Child", { parentChatId: "chat-1" });
        const server = baseServer([parent, child]);
        server.respond(
            "POST",
            "/v0/chats/chat-2/archiveChannel",
            jsonResponse(200, {
                chat: { ...child, archivedAt: "2026-07-03T00:00:00.000Z", pts: "1" },
                sync: {},
            }),
        );
        const { state, screen } = mount(server, "/channels/chat-2");
        await waitFor(() => expect(sidebarRow(screen.container, "chat-2")).not.toBeNull());
        await state.whenIdle();

        const menuButton = screen.container.querySelector<HTMLButtonElement>(
            '[data-happy2-ui="channel-header-menu"] button',
        );
        fireEvent.click(menuButton!);
        const archiveItem = [
            ...screen.container.querySelectorAll<HTMLButtonElement>('[data-happy2-ui="menu-item"]'),
        ].find((item) => item.textContent?.includes("Archive channel"));
        fireEvent.click(archiveItem!);
        await state.whenIdle();

        expect(
            server.requests.some(
                ({ method, path }) =>
                    method === "POST" && path === "/v0/chats/chat-2/archiveChannel",
            ),
        ).toBe(true);
        // The parent stays active; only the child dims.
        await waitFor(() =>
            expect(sidebarRow(screen.container, "chat-2")!.hasAttribute("data-archived")).toBe(
                true,
            ),
        );
        expect(sidebarRow(screen.container, "chat-1")!.hasAttribute("data-archived")).toBe(false);
    });
});
