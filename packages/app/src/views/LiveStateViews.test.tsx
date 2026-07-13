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
};

describe("live views use rigged-state", () => {
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

        fireEvent.click(view.container.querySelector('[data-item-id="discoverable"]')!);
        await waitFor(() =>
            expect((view.getByRole("button", { name: "Join" }) as HTMLButtonElement).disabled).toBe(
                false,
            ),
        );
        fireEvent.click(view.getByRole("button", { name: "Join" }));
        await waitFor(() =>
            expect(
                (view.getByRole("button", { name: "Leave" }) as HTMLButtonElement).disabled,
            ).toBe(false),
        );
        fireEvent.click(view.getByRole("button", { name: "Leave" }));
        await waitFor(() =>
            expect(
                server.requests.some(
                    ({ method, path }) =>
                        method === "POST" && path === "/v0/chats/discoverable/leave",
                ),
            ).toBe(true),
        );
        state.stop();
    });

    it("autosaves profile, status, and notification changes on the You screen", async () => {
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
        expect(updateUser).toHaveBeenCalled();

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
    return { ...currentUser, role: "admin" };
}

function sentMessage(text: string): MessageSummary {
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
    };
}
