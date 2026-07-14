import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import {
    createClientState,
    type ChatSummary,
    type ClientUser,
    type MessageSummary,
    type UserSummary,
} from "rigged-state";
import { createFakeServer, jsonResponse } from "rigged-state/testing";
import { describe, expect, it, vi } from "vitest";
import type { AuthSession } from "../components/AuthGate";
import { profile, profileAvailability, profileStatus, settings } from "../mockData";
import { type User } from "../server";
import { ChatView } from "./ChatView";
import { SettingsView } from "./SettingsView";

const currentUser: User = {
    id: "user-1",
    firstName: "Ada",
    lastName: "Lovelace",
    username: "ada",
    email: "ada@example.com",
    kind: "human",
};

describe("live views use rigged-state", () => {
    it("creates an agent user and hides unread while its chat is open", async () => {
        const server = baseServer([]);
        const agent = {
            id: "agent-1",
            firstName: "Fixer",
            username: "fixer",
            role: "member" as const,
            kind: "agent" as const,
            createdByUserId: currentUser.id,
        };
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary(), agent], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary(), agent], memberships: [] }),
        );
        server.respond(
            "GET",
            (path) => path.includes("/messages?limit=100"),
            jsonResponse(200, { messages: [], chatPts: "0", hasMore: false }),
        );
        server.respond(
            "POST",
            "/v0/chats/createAgent",
            jsonResponse(201, {
                chat: chat({
                    id: "agent-chat",
                    kind: "dm",
                    name: undefined,
                    dmType: "direct",
                    membershipRole: "owner",
                    unreadCount: 2,
                }),
            }),
        );
        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();
        const view = render(() => (
            <ChatView
                rail={<div />}
                search={() => ""}
                session={session(state)}
                titleBar={<div />}
            />
        ));

        const start = await view.findByRole("button", { name: "Start an agent" });
        fireEvent.click(start);
        fireEvent.input(await view.findByPlaceholderText("e.g. Fixer"), {
            target: { value: "Fixer" },
        });
        fireEvent.click(view.getByRole("button", { name: "Create agent" }));
        await waitFor(() =>
            expect(view.container.querySelector('[data-kind="agent"]')?.textContent).toContain(
                "Fixer",
            ),
        );
        expect(
            server.requests.some(
                ({ method, path }) => method === "POST" && path === "/v0/chats/createAgent",
            ),
        ).toBe(true);
        expect(view.queryByText("2")?.closest('[data-rigged-ui="count-badge"]')).toBeFalsy();
        expect(server.requests.find(({ path }) => path === "/v0/chats/createAgent")?.body).toEqual({
            name: "Fixer",
            username: "fixer",
        });
    });

    it("creates, joins, and leaves channels through state actions", async () => {
        const server = baseServer([chat({ id: "joined", name: "Joined", slug: "joined" })]);
        const discoverable = chat({
            id: "discoverable",
            name: "Discoverable",
            slug: "discoverable",
            membershipRole: undefined,
        });
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond(
            "GET",
            "/v0/directory/channels",
            jsonResponse(200, { channels: [discoverable] }),
        );
        server.respond(
            "GET",
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.respond(
            "GET",
            (path) => path.includes("/messages?limit=100"),
            jsonResponse(200, { messages: [], chatPts: "0", hasMore: false }),
        );
        server.respond(
            "POST",
            "/v0/chats/createChannel",
            jsonResponse(201, {
                chat: chat({ id: "created", name: "Product", slug: "product" }),
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/discoverable/join",
            jsonResponse(200, { chat: { ...discoverable, membershipRole: "member" } }),
        );
        server.respond(
            "POST",
            "/v0/chats/discoverable/leave",
            jsonResponse(200, { sync: { sequence: "2", chats: [], areas: [] } }),
        );

        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();
        const view = render(() => (
            <ChatView
                rail={<div />}
                search={() => ""}
                session={session(state)}
                titleBar={<div />}
            />
        ));

        await waitFor(() => expect(view.getByRole("button", { name: "Add channel" })).toBeTruthy());
        fireEvent.click(view.getByRole("button", { name: "Add channel" }));
        fireEvent.click(view.getByRole("button", { name: "Create channel" }));
        fireEvent.input(view.getByPlaceholderText("e.g. Product launch"), {
            target: { value: "Product" },
        });
        await waitFor(() =>
            expect(
                (view.getByRole("button", { name: "Create channel" }) as HTMLButtonElement)
                    .disabled,
            ).toBe(false),
        );
        fireEvent.click(view.getByRole("button", { name: "Create channel" }));
        await waitFor(() =>
            expect(state.get().chats.some(({ id }) => id === "created")).toBe(true),
        );

        fireEvent.click(view.getByRole("button", { name: "Add channel" }));
        fireEvent.click(view.getByRole("menuitem", { name: "Discoverable" }));
        await waitFor(() =>
            expect(
                view.container.querySelector('[data-rigged-ui="channel-header-title"]')
                    ?.textContent,
            ).toContain("Discoverable"),
        );
        const actionButton = (label: string) =>
            Array.from(
                view.container.querySelectorAll<HTMLButtonElement>(
                    '[data-rigged-ui="channel-header-actions"] button',
                ),
            ).find((button) => button.textContent?.trim() === label);
        expect(
            Array.from(
                view.container.querySelectorAll<HTMLButtonElement>(
                    '[data-rigged-ui="channel-header-actions"] button',
                ),
            ).map((button) => button.textContent?.trim()),
        ).toEqual(["Join"]);
        await waitFor(() => expect(actionButton("Join")?.disabled).toBe(false));
        fireEvent.click(actionButton("Join")!);
        /* After joining, Leave moves into the channel overflow menu. */
        await waitFor(() => expect(actionButton("Join")).toBeUndefined());
        fireEvent.click(
            view.container.querySelector<HTMLButtonElement>(
                '[data-rigged-ui="channel-header-menu"] button',
            )!,
        );
        const leaveItem = await waitFor(() => {
            const item = view.container.querySelector<HTMLButtonElement>(
                '[data-rigged-ui="channel-header-menu-popover"] [data-item-id="leave"]',
            );
            if (!item) throw new Error("leave menu item not shown");
            return item;
        });
        fireEvent.click(leaveItem);
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ method, path }) =>
                        method === "POST" && path === "/v0/chats/discoverable/leave",
                ),
            ).toBe(true),
        );
        await waitFor(() => {
            expect(view.container.querySelector('[data-item-id="discoverable"]')).toBeNull();
            expect(view.getByText("Your Rigged")).toBeTruthy();
        });
        state.stop();
    });

    it("autosaves ordinary settings but requires confirmation for a username change", async () => {
        const server = baseServer([]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/presence", jsonResponse(200, { presence: [], statuses: [] }));
        server.respond(
            "GET",
            "/v0/me/notificationPreferences",
            jsonResponse(200, {
                preferences: {
                    directMessages: "all",
                    mentions: "all",
                    threadReplies: "all",
                    reactions: "all",
                    calls: "all",
                    emailNotifications: true,
                    desktopNotifications: true,
                },
            }),
        );
        server.route("POST", "/v0/me/updateProfile", (request) => {
            const input = request.body as Record<string, string>;
            return jsonResponse(200, {
                user: { ...currentUser, firstName: input.firstName, lastName: input.lastName },
            });
        });
        server.respond(
            "POST",
            "/v0/me/updateStatus",
            jsonResponse(200, {
                status: {
                    userId: currentUser.id,
                    availability: "away",
                    updatedAt: "2026-01-01T00:00:00.000Z",
                },
                sync: {},
            }),
        );
        server.respond(
            "POST",
            "/v0/me/updateNotificationPreferences",
            jsonResponse(200, {
                preferences: {
                    directMessages: "all",
                    mentions: "all",
                    threadReplies: "all",
                    reactions: "all",
                    calls: "all",
                    emailNotifications: true,
                    desktopNotifications: false,
                },
                sync: {},
            }),
        );
        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();
        const updateUser = vi.fn();
        const view = render(() => (
            <SettingsView
                availability={profileAvailability}
                profile={profile}
                session={{ ...session(state), updateUser }}
                settings={settings}
                status={profileStatus}
            />
        ));

        await waitFor(() => expect(view.getByDisplayValue("Ada Lovelace")).toBeTruthy());
        fireEvent.input(view.getByDisplayValue("Ada Lovelace"), {
            target: { value: "Ada Byron" },
        });
        expect(view.getByText("Saving changes…")).toBeTruthy();
        await waitFor(
            () =>
                expect(
                    server.requests.some(
                        ({ path, body }) =>
                            path === "/v0/me/updateProfile" &&
                            (body as { lastName?: string }).lastName === "Byron",
                    ),
                ).toBe(true),
            { timeout: 1_500 },
        );
        await waitFor(() => expect(updateUser).toHaveBeenCalled());

        fireEvent.input(view.getByDisplayValue("ada"), {
            target: { value: "ada_byron" },
        });
        await new Promise((resolve) => setTimeout(resolve, 500));
        expect(
            server.requests.some(
                ({ path, body }) =>
                    path === "/v0/me/updateProfile" &&
                    (body as { username?: string }).username === "ada_byron",
            ),
        ).toBe(false);
        fireEvent.click(view.getByRole("button", { name: "Confirm username" }));
        expect(view.getByRole("dialog", { name: "Confirm username change" })).toBeTruthy();
        fireEvent.click(view.getByRole("button", { name: "Change username" }));
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ path, body }) =>
                        path === "/v0/me/updateProfile" &&
                        (body as { username?: string }).username === "ada_byron",
                ),
            ).toBe(true),
        );

        fireEvent.click(view.getByRole("button", { name: "Away" }));
        fireEvent.click(view.getByRole("switch", { name: "Desktop notifications" }));
        await waitFor(
            () => {
                expect(
                    server.requests.some(
                        ({ path, body }) =>
                            path === "/v0/me/updateStatus" &&
                            (body as { availability?: string }).availability === "away",
                    ),
                ).toBe(true);
                expect(
                    server.requests.some(
                        ({ path, body }) =>
                            path === "/v0/me/updateNotificationPreferences" &&
                            (body as { desktopNotifications?: boolean }).desktopNotifications ===
                                false,
                    ),
                ).toBe(true);
            },
            { timeout: 1_500 },
        );
        state.stop();
    });

    it("groups messages and backs channel details, reactions, and threads with real actions", async () => {
        const joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
            topic: "Old topic",
        });
        const root = sentMessage("Root note", {
            id: "root",
            threadReplyCount: 1,
        });
        const followUp = sentMessage("Follow-up note", {
            id: "follow-up",
            sequence: "2",
            changePts: "2",
            createdAt: "2026-01-01T00:01:00.000Z",
        });
        const reply = sentMessage("Existing reply", {
            id: "reply",
            sequence: "3",
            changePts: "3",
            threadRootMessageId: "root",
        });
        const server = baseServer([joined]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            "/v0/chats/joined/members",
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.respond(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            jsonResponse(200, { messages: [root, followUp], chatPts: "2", hasMore: false }),
        );
        server.respond(
            "GET",
            "/v0/messages/root/thread?limit=100",
            jsonResponse(200, {
                root,
                messages: [reply],
                chatPts: "3",
                hasMore: false,
            }),
        );
        server.respond(
            "POST",
            "/v0/messages/root/sendThreadMessage",
            jsonResponse(201, { message: sentMessage("New reply", { id: "new-reply" }) }),
        );
        server.respond(
            "POST",
            "/v0/messages/root/addReaction",
            jsonResponse(200, {
                message: sentMessage("Root note", {
                    id: "root",
                    threadReplyCount: 1,
                    reactions: [
                        {
                            key: "🚀",
                            emoji: "🚀",
                            count: 1,
                            reacted: true,
                            userIds: [currentUser.id],
                        },
                    ],
                }),
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/joined/updateChannel",
            jsonResponse(200, {
                chat: { ...joined, name: "Renamed", topic: "New topic" },
            }),
        );

        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();
        const view = render(() => (
            <ChatView
                rail={<div />}
                search={() => ""}
                session={session(state)}
                titleBar={<div />}
            />
        ));

        await waitFor(() => expect(view.getByText("Follow-up note")).toBeTruthy());
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ path, body }) =>
                        path === "/v0/chats/joined/markRead" &&
                        (body as { messageId?: string }).messageId === "follow-up",
                ),
            ).toBe(true),
        );
        const messages = view.container.querySelectorAll('[data-rigged-ui="message"]');
        expect(messages).toHaveLength(2);
        expect(messages[1]?.hasAttribute("data-grouped")).toBe(true);
        expect(view.container.querySelector('[data-rigged-ui="message-attachments"]')).toBeNull();

        const rootMessage = view.getByText("Root note").closest('[data-rigged-ui="message"]')!;
        fireEvent.click(rootMessage.querySelector('[aria-label="Open thread"]')!);
        await waitFor(() => expect(view.getByTestId("thread-panel")).toBeTruthy());
        await waitFor(() => expect(view.getByText("Existing reply")).toBeTruthy());
        const threadComposer = view.getByPlaceholderText("Reply…");
        fireEvent.input(threadComposer, { target: { value: "New reply" } });
        fireEvent.keyDown(threadComposer, { key: "Enter" });
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ path, body }) =>
                        path === "/v0/messages/root/sendThreadMessage" &&
                        (body as { text?: string }).text === "New reply",
                ),
            ).toBe(true),
        );

        const refreshedRootMessage = view
            .getAllByText("Root note")[0]!
            .closest('[data-rigged-ui="message"]')!;
        fireEvent.click(refreshedRootMessage.querySelector('[aria-label="Add reaction"]')!);
        fireEvent.click(view.getByRole("button", { name: "rocket" }));
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ path, body }) =>
                        path === "/v0/messages/root/addReaction" &&
                        (body as { emoji?: string }).emoji === "🚀",
                ),
            ).toBe(true),
        );

        fireEvent.click(view.getByRole("button", { name: "Open Joined details" }));
        await waitFor(() => expect(view.getByTestId("channel-info-panel")).toBeTruthy());
        fireEvent.input(view.getByDisplayValue("Joined"), { target: { value: "Renamed" } });
        fireEvent.input(view.getByDisplayValue("Old topic"), { target: { value: "New topic" } });
        const saveButton = await waitFor(() => view.getByRole("button", { name: "Save changes" }));
        fireEvent.click(saveButton);
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ path, body }) =>
                        path === "/v0/chats/joined/updateChannel" &&
                        (body as { name?: string }).name === "Renamed" &&
                        (body as { topic?: string }).topic === "New topic",
                ),
            ).toBe(true),
        );
        state.stop();
    });

    it("renders a local chat message before the server confirms it", async () => {
        const joined = chat({ id: "joined", name: "Joined", slug: "joined" });
        const server = baseServer([joined]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            "/v0/chats/joined/members",
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.respond(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            jsonResponse(200, { messages: [], chatPts: "0", hasMore: false }),
        );
        server.respond(
            "POST",
            "/v0/chats/joined/sendMessage",
            jsonResponse(201, { message: sentMessage("Local first") }),
        );

        const state = createClientState(server.transport, { sleep: async () => undefined });
        await state.start();
        const view = render(() => (
            <ChatView
                rail={<div />}
                search={() => ""}
                session={session(state)}
                titleBar={<div />}
            />
        ));
        const textarea = (await waitFor(() => {
            const field = view.getByPlaceholderText("Message #joined") as HTMLTextAreaElement;
            expect(field.disabled).toBe(false);
            expect(field.readOnly).toBe(false);
            return field;
        })) as HTMLTextAreaElement;

        fireEvent.input(textarea, { target: { value: "Local first" } });
        fireEvent.keyDown(textarea, { key: "Enter" });

        expect(view.getByText("Local first")).toBeTruthy();
        expect(
            state.get().messagesByChat.joined?.some(({ delivery }) => delivery === "sending"),
        ).toBe(true);
        await state.whenIdle();
        expect(
            server.requests.some(
                ({ path, body }) =>
                    path === "/v0/chats/joined/sendMessage" &&
                    (body as { text?: string }).text === "Local first",
            ),
        ).toBe(true);
        state.stop();
    });
});

function baseServer(chats: readonly ChatSummary[]) {
    const server = createFakeServer();
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: "now",
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats }));
    for (const chat of chats)
        server.respond(
            "POST",
            `/v0/chats/${chat.id}/markRead`,
            jsonResponse(200, { chat: { ...chat, unreadCount: 0 } }),
        );
    return server;
}

function session(state: ReturnType<typeof createClientState>): AuthSession {
    return {
        state,
        user: currentUser,
        updateUser: () => undefined,
    };
}

function chat(overrides: Partial<ChatSummary> = {}): ChatSummary {
    return {
        id: "chat-1",
        kind: "public_channel",
        name: "Channel",
        slug: "channel",
        isListed: true,
        retentionMode: "inherit",
        defaultExpiryMode: "none",
        defaultAfterReadScope: "any_reader",
        lifecycleVersion: "1",
        createdByUserId: currentUser.id,
        pts: "0",
        lastMessageSequence: "0",
        membershipEpoch: "1",
        membershipRole: "member",
        starred: false,
        lastReadSequence: "0",
        unreadCount: 0,
        mentionCount: 0,
        notificationLevel: "all",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}

function userSummary(): UserSummary & ClientUser {
    return { ...currentUser, role: "admin", kind: "human" };
}

function sentMessage(text: string, overrides: Partial<MessageSummary> = {}): MessageSummary {
    return {
        id: "message-1",
        chatId: "joined",
        sequence: "1",
        changePts: "1",
        sender: userSummary(),
        kind: "user",
        text,
        threadReplyCount: 0,
        revision: 1,
        mentions: [],
        attachments: [],
        reactions: [],
        receipts: [],
        expiryMode: "none",
        createdAt: "2026-01-01T00:00:00.000Z",
        ...overrides,
    };
}
