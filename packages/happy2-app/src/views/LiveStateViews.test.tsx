import { fireEvent, render, waitFor } from "@solidjs/testing-library";
import {
    createClientState,
    type ChatSummary,
    type ClientUser,
    type MessageSummary,
    type UserSummary,
} from "happy2-state";
import { createFakeServer, jsonResponse } from "happy2-state/testing";
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

describe("live views use happy2-state", () => {
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
        expect(view.queryByText("2")?.closest('[data-happy2-ui="count-badge"]')).toBeFalsy();
        expect(server.requests.find(({ path }) => path === "/v0/chats/createAgent")?.body).toEqual({
            name: "Fixer",
            username: "fixer",
        });
    });

    it("changes an agent's reasoning effort from its info panel and reconciles a sync", async () => {
        const agent = {
            id: "agent-1",
            firstName: "Deep",
            lastName: "Thinker",
            username: "deep_thinker",
            role: "member" as const,
            kind: "agent" as const,
            agentEffort: "high",
            createdByUserId: currentUser.id,
        };
        const agentChat = chat({
            id: "agent-chat",
            kind: "dm",
            name: undefined,
            dmType: "direct",
            membershipRole: "owner",
        });
        const server = baseServer([agentChat]);
        let contactsEffort = "high";
        server.route("GET", "/v0/contacts", () =>
            jsonResponse(200, {
                users: [userSummary(), { ...agent, agentEffort: contactsEffort }],
                presence: [],
                statuses: [],
            }),
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
            "GET",
            "/v0/agents/agent-1/effort",
            jsonResponse(200, {
                agentUserId: "agent-1",
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
            }),
        );
        server.respond(
            "POST",
            "/v0/agents/agent-1/changeEffort",
            jsonResponse(200, {
                agent: { ...agent, agentEffort: "low" },
                agentUserId: "agent-1",
                effort: "low",
                options: ["low", "medium", "high", "xhigh"],
                sync: { areas: ["users"] },
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

        fireEvent.click(await openAgentInfoPanel(view));

        const control = await waitFor(() => view.getByTestId("agent-effort-control"));
        const segment = (label: string) =>
            Array.from(control.querySelectorAll("button")).find(
                (button) => button.textContent === label,
            )!;
        await waitFor(() => expect(segment("High").getAttribute("aria-pressed")).toBe("true"));

        fireEvent.click(segment("Low"));
        await waitFor(() =>
            expect(
                server.requests.find(({ path }) => path === "/v0/agents/agent-1/changeEffort")
                    ?.body,
            ).toEqual({ effort: "low" }),
        );
        await waitFor(() => expect(segment("Low").getAttribute("aria-pressed")).toBe("true"));

        /* A `users` sync re-fetches contacts; the panel adopts the reconciled
           value without any manual refresh. */
        contactsEffort = "xhigh";
        const contactsBefore = server.requests.filter((r) => r.path === "/v0/contacts").length;
        server.respond(
            "POST",
            "/v0/sync/getDifference",
            jsonResponse(200, {
                kind: "difference",
                changedChats: [],
                removedChatIds: [],
                areas: ["users"],
                state: { protocolVersion: 1, generation: "g", sequence: "3" },
                targetState: { protocolVersion: 1, generation: "g", sequence: "3" },
            }),
        );
        server.events.sync({ sequence: "3", areas: ["users"] });
        await waitFor(() =>
            expect(server.requests.filter((r) => r.path === "/v0/contacts").length).toBeGreaterThan(
                contactsBefore,
            ),
        );
        await waitFor(() => expect(segment("X-High").getAttribute("aria-pressed")).toBe("true"));
        state.stop();
    });

    it("shows an agent's reasoning effort read-only to non-owners", async () => {
        const agent = {
            id: "agent-1",
            firstName: "Deep",
            lastName: "Thinker",
            username: "deep_thinker",
            role: "member" as const,
            kind: "agent" as const,
            agentEffort: "high",
            createdByUserId: "someone-else",
        };
        const agentChat = chat({
            id: "agent-chat",
            kind: "dm",
            name: undefined,
            dmType: "direct",
            membershipRole: "member",
        });
        const server = baseServer([agentChat]);
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
            "GET",
            "/v0/agents/agent-1/effort",
            jsonResponse(200, {
                agentUserId: "agent-1",
                effort: "high",
                options: ["low", "medium", "high", "xhigh"],
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

        fireEvent.click(await openAgentInfoPanel(view));

        const control = await waitFor(() => view.getByTestId("agent-effort-control"));
        expect(control.hasAttribute("data-disabled")).toBe(true);
        expect(server.requests.some(({ path }) => path === "/v0/agents/agent-1/changeEffort")).toBe(
            false,
        );
        state.stop();
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
                view.container.querySelector('[data-happy2-ui="channel-header-title"]')
                    ?.textContent,
            ).toContain("Discoverable"),
        );
        const actionButton = (label: string) =>
            Array.from(
                view.container.querySelectorAll<HTMLButtonElement>(
                    '[data-happy2-ui="channel-header-actions"] button',
                ),
            ).find((button) => button.textContent?.trim() === label);
        /* The icon-only workspace-files toggle also lives in the actions slot;
           filter to the text actions so this stays a "Join is offered" check. */
        expect(
            Array.from(
                view.container.querySelectorAll<HTMLButtonElement>(
                    '[data-happy2-ui="channel-header-actions"] button',
                ),
            )
                .map((button) => button.textContent?.trim())
                .filter(Boolean),
        ).toEqual(["Join"]);
        expect(
            view.container.querySelector(
                '[data-happy2-ui="channel-header-actions"] button[aria-label="Workspace files"]',
            ),
        ).not.toBeNull();
        await waitFor(() => expect(actionButton("Join")?.disabled).toBe(false));
        fireEvent.click(actionButton("Join")!);
        /* After joining, Leave moves into the channel overflow menu. */
        await waitFor(() => expect(actionButton("Join")).toBeUndefined());
        fireEvent.click(
            view.container.querySelector<HTMLButtonElement>(
                '[data-happy2-ui="channel-header-menu"] button',
            )!,
        );
        const leaveItem = await waitFor(() => {
            const item = view.container.querySelector<HTMLButtonElement>(
                '[data-happy2-ui="channel-header-menu-popover"] [data-item-id="leave"]',
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
            expect(view.getByText("Your Happy (2)")).toBeTruthy();
        });
        state.stop();
    });

    it("stars a channel through state and floats it into a Starred section", async () => {
        const channel = chat({ id: "general", name: "General", slug: "general" });
        const server = createFakeServer();
        server.respond(
            "GET",
            "/v0/sync/state",
            jsonResponse(200, {
                state: { protocolVersion: 1, generation: "g", sequence: "0" },
                serverTime: "now",
            }),
        );
        /* The star toggle persists to the server, then re-pulls chats; a dynamic
           /v0/chats route reflects the server-authoritative `starred`/`starOrder`
           so the reconciled summary is what drives the sidebar. */
        let starred = false;
        server.route("GET", "/v0/chats", () =>
            jsonResponse(200, {
                chats: [{ ...channel, starred, starOrder: starred ? 1 : undefined }],
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/general/markRead",
            jsonResponse(200, { chat: { ...channel, unreadCount: 0 } }),
        );
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
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
        server.route("POST", "/v0/chats/general/setStar", (request) => {
            starred = (request.body as { starred: boolean }).starred;
            return jsonResponse(200, { sync: { sequence: "1", chats: [], areas: [] } });
        });

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

        const channelItem = await waitFor(() => {
            const item = view.container.querySelector<HTMLButtonElement>(
                '[data-section-id="channels"] [data-item-id="general"]',
            );
            if (!item) throw new Error("channel row not shown");
            return item;
        });
        fireEvent.click(channelItem);
        await waitFor(() =>
            expect(
                view.container.querySelector('[data-happy2-ui="channel-header-title"]')
                    ?.textContent,
            ).toContain("General"),
        );

        fireEvent.click(
            view.container.querySelector<HTMLButtonElement>(
                '[data-happy2-ui="channel-header-menu"] button',
            )!,
        );
        const starMenuItem = await waitFor(() => {
            const item = view.container.querySelector<HTMLButtonElement>(
                '[data-happy2-ui="channel-header-menu-popover"] [data-item-id="star"]',
            );
            if (!item) throw new Error("star menu item not shown");
            return item;
        });
        fireEvent.click(starMenuItem);

        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ method, path }) => method === "POST" && path === "/v0/chats/general/setStar",
                ),
            ).toBe(true),
        );
        expect(
            server.requests.find(({ path }) => path === "/v0/chats/general/setStar")?.body,
        ).toEqual({ starred: true });

        /* Wait for the post-star `getChats` reconcile to land in durable state
           (not just the optimistic paint) so the section reflects the
           server-authoritative `starred`/`starOrder`. */
        await waitFor(() =>
            expect(state.get().chats.find(({ id }) => id === "general")?.starred).toBe(true),
        );

        await waitFor(() => {
            const starredSection = view.container.querySelector('[data-section-id="starred"]');
            expect(starredSection).not.toBeNull();
            expect(starredSection?.querySelector('[data-item-id="general"]')).not.toBeNull();
        });
        /* A starred chat lives only in the Starred section, not in its normal
           Channels section, so it never appears twice. */
        expect(
            view.container.querySelector('[data-section-id="channels"] [data-item-id="general"]'),
        ).toBeNull();
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
        const messages = view.container.querySelectorAll('[data-happy2-ui="message"]');
        expect(messages).toHaveLength(2);
        expect(messages[1]?.hasAttribute("data-grouped")).toBe(true);
        expect(view.container.querySelector('[data-happy2-ui="message-attachments"]')).toBeNull();

        const rootMessage = view.getByText("Root note").closest('[data-happy2-ui="message"]')!;
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
            .closest('[data-happy2-ui="message"]')!;
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

    it("opens a message author's profile in the info panel and restores channel details", async () => {
        const joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
            topic: "Old topic",
        });
        const author: UserSummary = {
            id: "grace",
            firstName: "Grace",
            lastName: "Hopper",
            username: "grace",
            title: "Rear Admiral",
            role: "member",
            kind: "human",
        };
        const note = sentMessage("Coordinating the release", { id: "note", sender: author });
        const server = baseServer([joined]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary(), author], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            "/v0/chats/joined/members",
            jsonResponse(200, { users: [userSummary(), author], memberships: [] }),
        );
        server.respond(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            jsonResponse(200, { messages: [note], chatPts: "1", hasMore: false }),
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

        await waitFor(() => expect(view.getByText("Coordinating the release")).toBeTruthy());
        const row = view
            .getByText("Coordinating the release")
            .closest('[data-happy2-ui="message"]')!;

        /* Both the avatar and the author name are profile buttons. */
        const authorButton = row.querySelector('[data-happy2-ui="message-author"]')!;
        expect(authorButton.tagName).toBe("BUTTON");
        expect(authorButton.getAttribute("aria-label")).toBe("View Grace Hopper’s profile");
        expect(row.querySelector('[data-happy2-ui="message-identity"]')?.tagName).toBe("BUTTON");

        /* Clicking the name opens the sender's profile — no channel roster. */
        fireEvent.click(authorButton);
        await waitFor(() => expect(view.getByTestId("channel-info-panel")).toBeTruthy());
        const panel = () => view.getByTestId("channel-info-panel");
        expect(panel().querySelector('[data-happy2-ui="profile-card-name"]')?.textContent).toBe(
            "Grace Hopper",
        );
        expect(panel().querySelector('[data-happy2-ui="profile-card-username"]')?.textContent).toBe(
            "@grace",
        );
        expect(panel().querySelector('[data-happy2-ui="profile-card-title"]')?.textContent).toBe(
            "Rear Admiral",
        );
        expect(panel().querySelector('[data-happy2-ui="info-panel-members"]')).toBeNull();

        /* Opening the channel details clears the author override: the profile
           gives way to the channel roster and edit form. */
        fireEvent.click(view.getByRole("button", { name: "Open Joined details" }));
        await waitFor(() =>
            expect(panel().querySelector('[data-happy2-ui="info-panel-members"]')).toBeTruthy(),
        );
        expect(panel().querySelector('[data-happy2-ui="profile-card-name"]')).toBeNull();
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

    it("streams an agent Markdown reply and settles it into one durable row", async () => {
        const joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
        });
        /* The same durable message id is served twice: first mid-stream, then
           settled — exactly what a live reconcile delivers to the client. */
        let reply = automatedMessage("## Draft\n\n- **par", {
            generationStatus: "streaming",
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
        server.route(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            () =>
                jsonResponse(200, { messages: [reply], chatPts: reply.changePts, hasMore: false }),
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

        /* Streaming: the automated body renders as Markdown with a live caret. */
        const streamingBody = await waitFor(() => {
            const body = view.container.querySelector(
                '[data-happy2-ui="message-body"][data-markdown]',
            );
            expect(body).toBeTruthy();
            expect(body!.querySelector("h2")?.textContent).toBe("Draft");
            return body!;
        });
        expect(view.container.querySelectorAll('[data-happy2-ui="message"]')).toHaveLength(1);
        const streamingRow = streamingBody.closest('[data-happy2-ui="message"]')!;
        expect(streamingRow.getAttribute("data-generation-status")).toBe("streaming");
        expect(streamingRow.getAttribute("aria-busy")).toBe("true");
        expect(
            view.container.querySelector('[data-happy2-ui="message-stream-caret"]'),
        ).toBeTruthy();

        /* The reply settles in place: same id, final Markdown, complete status. */
        reply = automatedMessage(
            "## Draft\n\n- **partial** done\n\n```ts\nconst answer = 42;\n```\n",
            { generationStatus: "complete", revision: 2, sequence: "2", changePts: "2" },
        );
        await state.loadMessages("joined");

        await waitFor(() => {
            expect(
                view.container.querySelector('[data-happy2-ui="message-stream-caret"]'),
            ).toBeNull();
            const body = view.container.querySelector(
                '[data-happy2-ui="message-body"][data-markdown]',
            )!;
            expect(body.querySelector("strong")?.textContent).toBe("partial");
            expect(body.querySelector("pre code")?.textContent).toContain("const answer = 42;");
        });
        /* Reconciled into the single existing row — never duplicated. */
        expect(view.container.querySelectorAll('[data-happy2-ui="message"]')).toHaveLength(1);
        const settledRow = view.container.querySelector('[data-happy2-ui="message"]')!;
        expect(settledRow.getAttribute("data-generation-status")).toBe("complete");
        expect(settledRow.getAttribute("aria-busy")).toBeNull();
        /* Tear down the view (clearing ChatView's subscriptions) before stopping
           the state, so no in-flight workspace refresh runs against a stopped
           instance during teardown. */
        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("keeps every row's DOM node stable while an agent reply streams over the sync channel", async () => {
        /* Two known channels: `joined` is active, `other` streams in the
           background. Neither the topology nor membership changes across the
           run, so a stream tick must patch in memory — no workspace refetch. */
        let joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
            pts: "2",
            lastMessageSequence: "2",
        });
        let other = chat({
            id: "other",
            membershipRole: "owner",
            name: "Other",
            slug: "other",
            pts: "0",
            lastMessageSequence: "0",
        });
        const prior = sentMessage("Kickoff at ten", {
            id: "prior-1",
            sequence: "1",
            changePts: "1",
        });
        let reply = automatedMessage("## Draft\n\n- **par", {
            id: "reply-1",
            sequence: "2",
            changePts: "2",
        });

        const server = baseServer([joined, other]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.route(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            () =>
                jsonResponse(200, {
                    messages: [prior, reply],
                    chatPts: reply.changePts,
                    hasMore: false,
                }),
        );

        /* Realtime sync plumbing: the workspace diff and the per-chat diff both
           read mutable closures so each tick can serve fresh content. */
        let seq = 0;
        let syncDiff: unknown = null;
        let chatDiff: unknown = null;
        server.route("POST", "/v0/sync/getDifference", () => jsonResponse(200, syncDiff));
        server.route(
            "POST",
            (path) => path.includes("/v0/chats/") && path.endsWith("/getDifference"),
            () => jsonResponse(200, chatDiff),
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

        /* Drive one realtime sync tick that advances a chat's pts and, for a
           loaded chat, delivers the given message through the per-chat diff. */
        async function tick(changedChat: ChatSummary, message?: MessageSummary) {
            seq += 1;
            const syncState = { protocolVersion: 1, generation: "g", sequence: String(seq) };
            syncDiff = {
                kind: "difference",
                changedChats: [changedChat],
                removedChatIds: [],
                areas: [],
                state: syncState,
                targetState: syncState,
            };
            chatDiff = message
                ? {
                      kind: "difference",
                      updates: [{ pts: changedChat.pts, ptsCount: 1, kind: "message" }],
                      messages: [message],
                      chat: changedChat,
                      state: { membershipEpoch: changedChat.membershipEpoch, pts: changedChat.pts },
                      targetState: {
                          membershipEpoch: changedChat.membershipEpoch,
                          pts: changedChat.pts,
                      },
                  }
                : null;
            server.events.sync({
                sequence: String(seq),
                chats: [{ chatId: changedChat.id, pts: changedChat.pts }],
                areas: [],
            });
            await state.whenIdle();
        }

        const messageRows = () =>
            [...view.container.querySelectorAll('[data-happy2-ui="message"]')] as HTMLElement[];

        /* Initial streaming render: prior user row + streaming agent row, with
           the member count resolved so its DOM node exists to be captured. */
        await waitFor(() => {
            expect(messageRows()).toHaveLength(2);
            expect(messageRows()[1]?.getAttribute("data-generation-status")).toBe("streaming");
            expect(
                view.container.querySelector('[data-happy2-ui="channel-header-member-count"]'),
            ).toBeTruthy();
        });

        /* Capture the concrete DOM nodes whose identity must survive streaming. */
        const header = view.container.querySelector('[data-happy2-ui="channel-header"]')!;
        const memberCount = view.container.querySelector(
            '[data-happy2-ui="channel-header-member-count"]',
        )!;
        const sidebarRow = view.container.querySelector(
            '[data-happy2-ui="sidebar-item"][data-item-id="joined"]',
        )!;
        const priorRow = messageRows()[0]!;
        const streamRow = messageRows()[1]!;
        expect(memberCount.textContent).toContain("1");
        expect(priorRow.textContent).toContain("Kickoff at ten");

        const forbiddenReads = () =>
            server.requests.filter(
                ({ method, path }) =>
                    method === "GET" &&
                    (path === "/v0/contacts" ||
                        path === "/v0/directory/channels" ||
                        path.includes("/members") ||
                        path.includes("/messages?limit=100")),
            ).length;
        const readsBefore = forbiddenReads();

        /* Two more streaming partials over the sync channel. Each advances chat
           pts and rewrites the same durable message id. */
        joined = { ...joined, pts: "3" };
        reply = automatedMessage("## Draft\n\n- **partial** in progress", {
            id: "reply-1",
            sequence: "2",
            changePts: "3",
            revision: 2,
        });
        await tick(joined, reply);
        await waitFor(() => expect(streamRow.querySelector("strong")?.textContent).toBe("partial"));

        joined = { ...joined, pts: "4" };
        reply = automatedMessage("## Draft\n\n- **partial** in progress\n- second point", {
            id: "reply-1",
            sequence: "2",
            changePts: "4",
            revision: 3,
        });
        await tick(joined, reply);
        await waitFor(() => expect(streamRow.querySelectorAll("ul > li")).toHaveLength(2));

        /* Completion: caret and busy state clear, still the same row. */
        joined = { ...joined, pts: "5" };
        reply = automatedMessage(
            "## Draft\n\n- **partial** in progress\n- second point\n\n```ts\nconst answer = 42;\n```\n",
            {
                id: "reply-1",
                sequence: "2",
                changePts: "5",
                revision: 4,
                generationStatus: "complete",
            },
        );
        await tick(joined, reply);
        await waitFor(() => {
            expect(streamRow.getAttribute("data-generation-status")).toBe("complete");
            expect(streamRow.querySelector("pre code")?.textContent).toContain(
                "const answer = 42;",
            );
        });

        /* Row identity held throughout: no remount of any surface. */
        expect(messageRows()).toHaveLength(2);
        expect(messageRows()[0]).toBe(priorRow);
        expect(messageRows()[1]).toBe(streamRow);
        expect(view.container.querySelector('[data-happy2-ui="channel-header"]')).toBe(header);
        expect(view.container.querySelector('[data-happy2-ui="channel-header-member-count"]')).toBe(
            memberCount,
        );
        expect(memberCount.textContent).toContain("1");
        expect(
            view.container.querySelector('[data-happy2-ui="sidebar-item"][data-item-id="joined"]'),
        ).toBe(sidebarRow);
        /* Settled row carries no caret or busy affordance. */
        expect(streamRow.querySelector('[data-happy2-ui="message-stream-caret"]')).toBeNull();
        expect(streamRow.getAttribute("aria-busy")).toBeNull();

        /* Ordinary same-topology stream ticks never refetch the workspace. */
        expect(forbiddenReads()).toBe(readsBefore);

        /* A background chat advancing does not steal the active conversation. */
        other = { ...other, pts: "1", lastMessageSequence: "1", unreadCount: 3 };
        await tick(other);
        expect(
            view.container.querySelector('[data-happy2-ui="channel-header-title"]')?.textContent,
        ).toBe("Joined");
        expect(
            view.container
                .querySelector('[data-happy2-ui="sidebar-item"][data-active]')
                ?.getAttribute("data-item-id"),
        ).toBe("joined");
        expect(messageRows()[1]).toBe(streamRow);
        expect(forbiddenReads()).toBe(readsBefore);

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("reconciles an open thread in place from the stream without refetching it", async () => {
        let joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
            pts: "3",
            lastMessageSequence: "3",
        });
        const root = sentMessage("Root note", {
            id: "root",
            sequence: "1",
            changePts: "1",
            threadReplyCount: 1,
        });
        const mainFollow = sentMessage("Main follow", {
            id: "main-follow",
            sequence: "2",
            changePts: "2",
        });
        let reply = sentMessage("Existing reply", {
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
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.route(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            () =>
                jsonResponse(200, {
                    messages: [root, mainFollow],
                    chatPts: "3",
                    hasMore: false,
                }),
        );
        /* Count getThread calls to prove the stream hot path never refetches. */
        let threadRequests = 0;
        server.route("GET", "/v0/messages/root/thread?limit=100", () => {
            threadRequests += 1;
            return jsonResponse(200, { root, messages: [reply], chatPts: "3", hasMore: false });
        });

        let seq = 0;
        let syncDiff: unknown = null;
        let chatDiff: unknown = null;
        server.route("POST", "/v0/sync/getDifference", () => jsonResponse(200, syncDiff));
        server.route(
            "POST",
            (path) => path.includes("/v0/chats/") && path.endsWith("/getDifference"),
            () => jsonResponse(200, chatDiff),
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

        async function tick(changedChat: ChatSummary, message?: MessageSummary) {
            seq += 1;
            const syncState = { protocolVersion: 1, generation: "g", sequence: String(seq) };
            syncDiff = {
                kind: "difference",
                changedChats: [changedChat],
                removedChatIds: [],
                areas: [],
                state: syncState,
                targetState: syncState,
            };
            chatDiff = message
                ? {
                      kind: "difference",
                      updates: [{ pts: changedChat.pts, ptsCount: 1, kind: "message" }],
                      messages: [message],
                      chat: changedChat,
                      state: { membershipEpoch: changedChat.membershipEpoch, pts: changedChat.pts },
                      targetState: {
                          membershipEpoch: changedChat.membershipEpoch,
                          pts: changedChat.pts,
                      },
                  }
                : null;
            server.events.sync({
                sequence: String(seq),
                chats: [{ chatId: changedChat.id, pts: changedChat.pts }],
                areas: [],
            });
            await state.whenIdle();
        }

        await waitFor(() => expect(view.getByText("Main follow")).toBeTruthy());
        const rootMessage = view.getByText("Root note").closest('[data-happy2-ui="message"]')!;
        fireEvent.click(rootMessage.querySelector('[aria-label="Open thread"]')!);
        await waitFor(() => expect(view.getByTestId("thread-panel")).toBeTruthy());
        await waitFor(() => expect(view.getByText("Existing reply")).toBeTruthy());
        expect(threadRequests, "thread loaded exactly once on open").toBe(1);

        const threadReplyRow = view
            .getByText("Existing reply")
            .closest('[data-happy2-ui="message"]')!;
        const threadComposer = () =>
            view.container.querySelector(
                '[data-testid="thread-panel"] [data-happy2-ui="composer"]',
            )!;

        /* An unrelated main-message partial must not touch the thread: no
           getThread request, no busy/pending composer, no panel change. */
        joined = { ...joined, pts: "4", lastMessageSequence: "4" };
        await tick(
            joined,
            sentMessage("Chatter", { id: "chatter", sequence: "4", changePts: "4" }),
        );
        await waitFor(() => expect(view.getByText("Chatter")).toBeTruthy());
        expect(threadRequests, "unrelated main partial does not refetch the thread").toBe(1);
        expect(
            threadComposer().hasAttribute("data-pending"),
            "unrelated main partial leaves the thread composer idle",
        ).toBe(false);
        expect(
            view.getByText("Existing reply").closest('[data-happy2-ui="message"]'),
            "thread reply row is untouched",
        ).toBe(threadReplyRow);

        /* A changed thread reply reconciles the same row in place — still no
           network request. */
        joined = { ...joined, pts: "5", lastMessageSequence: "5" };
        reply = sentMessage("Existing reply — edited", {
            id: "reply",
            sequence: "3",
            changePts: "5",
            revision: 2,
            threadRootMessageId: "root",
        });
        await tick(joined, reply);
        await waitFor(() =>
            expect(threadReplyRow.textContent).toContain("Existing reply — edited"),
        );
        expect(
            view.getByText("Existing reply — edited").closest('[data-happy2-ui="message"]'),
            "thread reply reconciled its existing DOM node",
        ).toBe(threadReplyRow);
        expect(threadRequests, "in-memory reconcile makes no getThread request").toBe(1);

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("discards a stale thread response after the panel closes", async () => {
        const joined = chat({
            id: "joined",
            membershipRole: "owner",
            name: "Joined",
            slug: "joined",
        });
        const root = sentMessage("Root note", { id: "root", threadReplyCount: 1 });
        const reply = sentMessage("Late reply", {
            id: "reply",
            sequence: "2",
            changePts: "2",
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
            jsonResponse(200, { messages: [root], chatPts: "1", hasMore: false }),
        );
        /* Hold the thread response so the panel can close before it resolves. */
        let releaseThread: (() => void) | undefined;
        server.route("GET", "/v0/messages/root/thread?limit=100", async () => {
            await new Promise<void>((resolve) => (releaseThread = resolve));
            return jsonResponse(200, { root, messages: [reply], chatPts: "2", hasMore: false });
        });

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

        await waitFor(() => expect(view.getByText("Root note")).toBeTruthy());
        const rootMessage = view.getByText("Root note").closest('[data-happy2-ui="message"]')!;
        fireEvent.click(rootMessage.querySelector('[aria-label="Open thread"]')!);
        await waitFor(() => expect(view.getByTestId("thread-panel")).toBeTruthy());
        await waitFor(() => expect(releaseThread).toBeTruthy());

        /* Close the panel while getThread is still in flight, then let the stale
           response resolve — it must not repopulate the closed panel. */
        fireEvent.click(view.getByRole("button", { name: "Close thread" }));
        await waitFor(() => expect(view.queryByTestId("thread-panel")).toBeNull());
        releaseThread!();
        await new Promise((resolve) => setTimeout(resolve, 0));
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(view.queryByTestId("thread-panel")).toBeNull();
        expect(view.queryByText("Late reply")).toBeNull();

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("hydrates on a known chat's membership change but not on an ordinary stream tick", async () => {
        let joined = chat({
            id: "joined",
            membershipRole: "member",
            name: "Joined",
            slug: "joined",
            pts: "1",
            lastMessageSequence: "1",
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
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.route(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            () => jsonResponse(200, { messages: [], chatPts: joined.pts, hasMore: false }),
        );

        let seq = 0;
        let syncDiff: unknown = null;
        let chatDiff: unknown = null;
        server.route("POST", "/v0/sync/getDifference", () => jsonResponse(200, syncDiff));
        server.route(
            "POST",
            (path) => path.includes("/v0/chats/") && path.endsWith("/getDifference"),
            () => jsonResponse(200, chatDiff),
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

        async function tick(changedChat: ChatSummary, message: MessageSummary) {
            seq += 1;
            const syncState = { protocolVersion: 1, generation: "g", sequence: String(seq) };
            syncDiff = {
                kind: "difference",
                changedChats: [changedChat],
                removedChatIds: [],
                areas: [],
                state: syncState,
                targetState: syncState,
            };
            chatDiff = {
                kind: "difference",
                updates: [{ pts: changedChat.pts, ptsCount: 1, kind: "message" }],
                messages: [message],
                chat: changedChat,
                state: { membershipEpoch: changedChat.membershipEpoch, pts: changedChat.pts },
                targetState: { membershipEpoch: changedChat.membershipEpoch, pts: changedChat.pts },
            };
            server.events.sync({
                sequence: String(seq),
                chats: [{ chatId: changedChat.id, pts: changedChat.pts }],
                areas: [],
            });
            await state.whenIdle();
        }

        await waitFor(() =>
            expect(
                view.container.querySelector(
                    '[data-happy2-ui="sidebar-item"][data-item-id="joined"]',
                ),
            ).toBeTruthy(),
        );
        const hydrationReads = () =>
            server.requests.filter(
                ({ method, path }) =>
                    method === "GET" &&
                    (path === "/v0/contacts" || path === "/v0/directory/channels"),
            ).length;
        const readsBefore = hydrationReads();

        /* An ordinary pts/text tick is patched in memory — no workspace refetch. */
        joined = { ...joined, pts: "2", lastMessageSequence: "2" };
        await tick(joined, sentMessage("Hello", { id: "m2", sequence: "2", changePts: "2" }));
        await waitFor(() => expect(view.getByText("Hello")).toBeTruthy());
        expect(hydrationReads(), "ordinary stream tick does not hydrate").toBe(readsBefore);

        /* A membership change on a known chat is topology — it must hydrate. */
        joined = { ...joined, pts: "3", lastMessageSequence: "3", membershipRole: "admin" };
        await tick(joined, sentMessage("Promoted", { id: "m3", sequence: "3", changePts: "3" }));
        await waitFor(() => expect(hydrationReads()).toBeGreaterThan(readsBefore));

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("coalesces mount and topology hydration into one in-flight run plus one trailing rerun", async () => {
        let joined = chat({
            id: "joined",
            membershipRole: "member",
            name: "Joined",
            slug: "joined",
            pts: "1",
            lastMessageSequence: "1",
        });
        const server = baseServer([joined]);
        /* Hold the contacts fetch so the mount hydration stays in flight while a
           burst of topology events arrives; count fetches to prove coalescing. */
        let contactsCalls = 0;
        let releaseContacts: (() => void) | undefined;
        server.route("GET", "/v0/contacts", async () => {
            contactsCalls += 1;
            await new Promise<void>((resolve) => (releaseContacts = resolve));
            return jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] });
        });
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
        server.respond(
            "GET",
            /\/v0\/chats\/[^/]+\/members/,
            jsonResponse(200, { users: [userSummary()], memberships: [] }),
        );
        server.route(
            "GET",
            (path) => path.includes("/v0/chats/joined/messages?limit=100"),
            () => jsonResponse(200, { messages: [], chatPts: joined.pts, hasMore: false }),
        );

        let seq = 0;
        let syncDiff: unknown = null;
        server.route("POST", "/v0/sync/getDifference", () => jsonResponse(200, syncDiff));
        server.route(
            "POST",
            (path) => path.includes("/v0/chats/") && path.endsWith("/getDifference"),
            () => jsonResponse(200, null),
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

        /* The mount hydration is now in flight, parked on the gated contacts. */
        await waitFor(() => expect(contactsCalls).toBe(1));

        async function topologyTick(role: "member" | "admin") {
            seq += 1;
            joined = { ...joined, membershipRole: role };
            const syncState = { protocolVersion: 1, generation: "g", sequence: String(seq) };
            syncDiff = {
                kind: "difference",
                changedChats: [joined],
                removedChatIds: [],
                areas: [],
                state: syncState,
                targetState: syncState,
            };
            server.events.sync({
                sequence: String(seq),
                chats: [{ chatId: "joined", pts: joined.pts }],
                areas: [],
            });
            await new Promise((resolve) => setTimeout(resolve, 0));
            await new Promise((resolve) => setTimeout(resolve, 0));
        }

        /* A burst of topology events while one hydration is in flight collapses to
           a single trailing rerun rather than one refetch per event. */
        await topologyTick("admin");
        await topologyTick("member");
        await topologyTick("admin");
        expect(contactsCalls, "the burst starts no concurrent hydration").toBe(1);

        releaseContacts!();
        await waitFor(() => expect(contactsCalls).toBe(2));
        releaseContacts!();
        await state.whenIdle();
        await new Promise((resolve) => setTimeout(resolve, 0));
        expect(contactsCalls, "one in-flight plus exactly one trailing rerun").toBe(2);

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("opens the workspace files panel on demand and expands directories lazily", async () => {
        const server = baseServer([
            chat({ id: "chat-1", name: "Repo", slug: "repo", membershipRole: "member" }),
        ]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
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
            "GET",
            "/v0/chats/chat-1/workspace",
            jsonResponse(200, {
                workspace: {
                    paths: [".git/", "src/"],
                    gitStatus: [{ path: "src/", status: "modified" }],
                    revision: "r1",
                    unloadedDirectories: [".git/", "src/"],
                    gitStatusPending: false,
                },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace?directory=src%2F",
            jsonResponse(200, {
                workspace: {
                    directory: "src/",
                    paths: ["src/app.ts", "src/index.ts"],
                    gitStatus: [{ path: "src/index.ts", status: "modified" }],
                    revision: "r1",
                    unloadedDirectories: [],
                    gitStatusPending: false,
                },
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

        await waitFor(() =>
            expect(
                view.container.querySelector('[data-happy2-ui="channel-header-title"]')
                    ?.textContent,
            ).toContain("Repo"),
        );
        /* Nothing is fetched until the panel is opened — files are on demand. */
        expect(server.requests.some(({ path }) => path.includes("/workspace"))).toBe(false);

        fireEvent.click(view.getByRole("button", { name: "Workspace files" }));

        const panel = await waitFor(() => {
            const element = view.container.querySelector('[data-testid="workspace-file-panel"]');
            if (!element) throw new Error("file panel not shown");
            return element;
        });
        await waitFor(() => expect(panel.querySelector('[data-path="src/"]')).not.toBeNull());
        expect(panel.querySelector('[data-path=".git/"]')).not.toBeNull();
        expect(panel.querySelector('[data-path="src/"]')?.getAttribute("data-status")).toBe(
            "modified",
        );
        /* Collapsed until asked: no child rows and no directory page fetched yet. */
        expect(panel.querySelector('[data-path="src/index.ts"]')).toBeNull();
        expect(server.requests.some(({ path }) => path.includes("directory=src%2F"))).toBe(false);

        fireEvent.click(
            panel.querySelector('[data-path="src/"] [data-happy2-ui="file-tree-chevron"]')!,
        );
        await waitFor(() =>
            expect(panel.querySelector('[data-path="src/index.ts"]')).not.toBeNull(),
        );
        expect(panel.querySelector('[data-path="src/app.ts"]')).not.toBeNull();
        expect(panel.querySelector('[data-path="src/index.ts"]')?.getAttribute("data-status")).toBe(
            "modified",
        );
        expect(
            server.requests.filter(({ path }) =>
                path.startsWith("/v0/chats/chat-1/workspace?directory=src%2F"),
            ),
        ).toHaveLength(1);

        view.unmount();
        await state.whenIdle();
        state.stop();
    });

    it("opens a workspace file in the editor and saves an edit conflict-safely", async () => {
        const server = baseServer([
            chat({ id: "chat-1", name: "Repo", slug: "repo", membershipRole: "member" }),
        ]);
        server.respond(
            "GET",
            "/v0/contacts",
            jsonResponse(200, { users: [userSummary()], presence: [], statuses: [] }),
        );
        server.respond("GET", "/v0/directory/channels", jsonResponse(200, { channels: [] }));
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
            "GET",
            "/v0/chats/chat-1/workspace",
            jsonResponse(200, {
                workspace: {
                    paths: ["src/"],
                    gitStatus: [],
                    revision: "r1",
                    unloadedDirectories: ["src/"],
                    gitStatusPending: false,
                },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace?directory=src%2F",
            jsonResponse(200, {
                workspace: {
                    directory: "src/",
                    paths: ["src/index.ts"],
                    gitStatus: [{ path: "src/index.ts", status: "modified" }],
                    revision: "r1",
                    unloadedDirectories: [],
                    gitStatusPending: false,
                },
            }),
        );
        server.respond(
            "GET",
            "/v0/chats/chat-1/workspace/file?path=src%2Findex.ts",
            jsonResponse(200, {
                file: {
                    path: "src/index.ts",
                    content: "export const value = 1;\n",
                    size: 24,
                    version: "f1",
                },
            }),
        );
        server.respond(
            "POST",
            "/v0/chats/chat-1/workspace/writeFile",
            jsonResponse(200, {
                file: { path: "src/index.ts", size: 24, version: "f2", created: false },
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

        await waitFor(() =>
            expect(
                view.container.querySelector('[data-happy2-ui="channel-header-title"]')
                    ?.textContent,
            ).toContain("Repo"),
        );
        fireEvent.click(view.getByRole("button", { name: "Workspace files" }));
        const panel = await waitFor(() => {
            const element = view.container.querySelector('[data-testid="workspace-file-panel"]');
            if (!element) throw new Error("file panel not shown");
            return element;
        });
        await waitFor(() => expect(panel.querySelector('[data-path="src/"]')).not.toBeNull());
        fireEvent.click(
            panel.querySelector('[data-path="src/"] [data-happy2-ui="file-tree-chevron"]')!,
        );
        await waitFor(() =>
            expect(panel.querySelector('[data-path="src/index.ts"]')).not.toBeNull(),
        );

        /* No file content is fetched until a file is actually opened. */
        expect(server.requests.some(({ path }) => path.includes("/workspace/file"))).toBe(false);
        fireEvent.click(
            panel.querySelector('[data-path="src/index.ts"] [data-happy2-ui="file-tree-entry"]')!,
        );

        const editor = await waitFor(() => {
            const element = view.container.querySelector('[data-testid="workspace-file-editor"]');
            if (!element) throw new Error("editor not shown");
            return element;
        });
        const area = await waitFor(() => {
            const element = editor.querySelector<HTMLTextAreaElement>(
                '[data-happy2-ui="file-editor-area"]',
            );
            if (!element || element.value !== "export const value = 1;\n")
                throw new Error("file content not loaded");
            return element;
        });
        const saveButton = () =>
            Array.from(
                editor.querySelectorAll<HTMLButtonElement>(
                    '[data-happy2-ui="file-editor-actions"] [data-happy2-ui="button"]',
                ),
            ).find((button) => button.textContent === "Save")!;
        /* Clean file: Save is disabled until an edit makes it dirty. */
        expect(saveButton().disabled).toBe(true);

        fireEvent.input(area, { target: { value: "export const value = 2;\n" } });
        await waitFor(() => expect(saveButton().disabled).toBe(false));
        fireEvent.click(saveButton());

        await waitFor(() => {
            const write = server.requests.find(
                ({ method, path }) =>
                    method === "POST" && path === "/v0/chats/chat-1/workspace/writeFile",
            );
            expect(write?.body).toEqual({
                path: "src/index.ts",
                expectedVersion: "f1",
                content: "export const value = 2;\n",
            });
        });
        /* After a successful save the editor is clean again. */
        await waitFor(() => expect(saveButton().disabled).toBe(true));

        view.unmount();
        await state.whenIdle();
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

/* Select the seeded `agent-chat` DM in the sidebar and open its info panel via
   the header title button, returning the panel-open trigger already clicked. */
async function openAgentInfoPanel(view: ReturnType<typeof render>) {
    const item = await waitFor(() => {
        const element = view.container.querySelector<HTMLButtonElement>(
            '[data-item-id="agent-chat"]',
        );
        if (!element) throw new Error("agent DM sidebar item not ready");
        return element;
    });
    fireEvent.click(item);
    return await waitFor(() => {
        const lead = view.container.querySelector<HTMLButtonElement>(
            'button[data-happy2-ui="channel-header-lead"]',
        );
        if (!lead) throw new Error("channel header title button not ready");
        return lead;
    });
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

function automatedMessage(text: string, overrides: Partial<MessageSummary> = {}): MessageSummary {
    return sentMessage(text, {
        kind: "automated",
        sender: undefined,
        senderBot: { id: "bot-1", name: "Fixer", username: "fixer" },
        generationStatus: "streaming",
        ...overrides,
    });
}
