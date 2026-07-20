import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import {
    happyStateCreate,
    type ChatSummary,
    type PluginContributionPlacement,
    type PluginContributionSummary,
} from "happy2-state";
import { createFakeServer as createBareFakeServer, jsonResponse } from "happy2-state/testing";
import { afterEach, beforeEach, expect, it, onTestFinished, vi } from "vitest";
import { DesktopApp } from "./components/DesktopApp";
import { desktopNavigationCreate } from "./navigation/desktopNavigationCreate";
import type { PluginAssetMasks } from "./pluginAssets";
import {
    chatMenuContributionNodes,
    composerContributionNodes,
    messageMenuContributionNodes,
    type ContributionSurface,
} from "./views/PluginContributionRenderer";

afterEach(cleanup);
beforeEach(() => history.replaceState(null, "", "/chats"));

const NOW = "2026-07-20T00:00:00.000Z";
const masks: PluginAssetMasks = { maskUrl: () => undefined };

function buttonContribution(
    id: string,
    location: PluginContributionPlacement,
): PluginContributionSummary {
    return {
        id,
        installationId: "install-1",
        pluginId: "plugin-todos",
        pluginShortName: "todos",
        externalKey: `${location}:${id}`,
        location,
        title: `${location} action`,
        description: "Native action",
        spec: {
            kind: "button",
            id: `${id}-act`,
            title: `${location} action`,
            description: "Native action",
            assetId: "todo-mark",
            action: { toolName: "todos_app_add_item" },
        },
        available: true,
        scope: "all_users",
        position: 10,
        revision: 1,
        createdAt: NOW,
        updatedAt: NOW,
    };
}

function fakeSurface() {
    const pluginContributionInvoke =
        vi.fn<
            (input: {
                contributionId: string;
                actionId: string;
                value?: unknown;
                messageId?: string;
            }) => void
        >();
    const pluginContributionMenuResolve =
        vi.fn<(contributionId: string, messageId?: string) => void>();
    const surface: ContributionSurface = {
        actionStates: new Map(),
        menuStates: new Map(),
        pluginContributionInvoke,
        pluginContributionMenuResolve,
    };
    return { surface, pluginContributionInvoke, pluginContributionMenuResolve };
}

it("renders composer and chat-menu placement triggers", () => {
    const { surface } = fakeSurface();
    const contributions = [
        buttonContribution("c-icon", "composerIcon"),
        buttonContribution("c-menu-composer", "composerMenu"),
        buttonContribution("c-menu-chat", "chatMenu"),
        buttonContribution("c-msg", "messageMenu"),
    ];
    const screen = render(
        <div>
            <div data-testid="composer">
                {composerContributionNodes(contributions, surface, masks)}
            </div>
            <div data-testid="header">
                {chatMenuContributionNodes(contributions, surface, masks)}
            </div>
        </div>,
    );
    // Both composer placements appear in the composer group; chatMenu appears in
    // the header; the message-menu contribution is NOT placed in either.
    expect(
        screen.getByTestId("composer").querySelectorAll("[data-happy2-ui='plugin-menu']").length,
    ).toBe(2);
    expect(
        screen.getByTestId("header").querySelectorAll("[data-happy2-ui='plugin-menu']").length,
    ).toBe(1);
});

it("routes a message-menu invocation with the message id", () => {
    const { surface, pluginContributionInvoke } = fakeSurface();
    const contributions = [buttonContribution("c-msg", "messageMenu")];
    const screen = render(
        <div data-testid="msg">
            {messageMenuContributionNodes(contributions, surface, masks, "message-42")}
        </div>,
    );
    const trigger = screen.getByTestId("msg").querySelector("button") as HTMLButtonElement;
    fireEvent.click(trigger);
    expect(pluginContributionInvoke).toHaveBeenCalledWith({
        contributionId: "c-msg",
        actionId: "c-msg-act",
        messageId: "message-42",
    });
});

it("resolves an async message-menu on open, scoped to the message id", async () => {
    const { surface, pluginContributionMenuResolve } = fakeSurface();
    const asyncContribution: PluginContributionSummary = {
        ...buttonContribution("c-async", "messageMenu"),
        spec: {
            kind: "asyncMenu",
            id: "c-async",
            title: "More",
            description: "Async actions",
            resolverToolName: "todos_app_list_snapshot",
        },
    };
    const screen = render(
        <div data-testid="msg">
            {messageMenuContributionNodes([asyncContribution], surface, masks, "message-9")}
        </div>,
    );
    const trigger = screen.getByTestId("msg").querySelector("button") as HTMLButtonElement;
    fireEvent.click(trigger);
    // Opening an async menu resolves it (scoped to the message), no manual refresh.
    await waitFor(() =>
        expect(pluginContributionMenuResolve).toHaveBeenCalledWith("c-async", "message-9"),
    );
});

function chatFixture(): ChatSummary {
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
        createdAt: NOW,
        updatedAt: NOW,
    };
}

it("shows chat/composer contributions for the active chat and releases them on navigate away", async () => {
    const chat = chatFixture();
    const contributions = [
        buttonContribution("c-icon", "composerIcon"),
        buttonContribution("c-chatmenu", "chatMenu"),
    ];
    const server = createBareFakeServer();
    server.respond("GET", "/v0/drafts", jsonResponse(200, { drafts: [], serverTime: NOW }));
    server.respond(
        "GET",
        "/v0/sync/state",
        jsonResponse(200, {
            state: { protocolVersion: 1, generation: "g", sequence: "0" },
            serverTime: NOW,
        }),
    );
    server.respond("GET", "/v0/chats", jsonResponse(200, { chats: [chat] }));
    server.respond("GET", "/v0/chats/chat-1", jsonResponse(200, { chat }));
    server.respond("GET", /^\/v0\/chats\/chat-1\/members/u, jsonResponse(200, { users: [] }));
    server.respond(
        "GET",
        /^\/v0\/chats\/chat-1\/messages/u,
        jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
    );
    server.respond(
        "GET",
        "/v0/contacts",
        jsonResponse(200, { users: [], presence: [], statuses: [] }),
    );
    server.respond("GET", "/v0/apps", jsonResponse(200, { apps: [] }));
    server.respond("GET", /^\/v0\/contributions(\?|$)/u, jsonResponse(200, { contributions }));
    server.respond("GET", /^\/v0\/pluginInstallations\/.+\/uiAssets\/.+$/u, jsonResponse(404, {}));

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
    // The composer contribution slot is populated for the active chat.
    await waitFor(() =>
        expect(
            screen.container.querySelector(
                '[data-happy2-ui="composer-contributions"] [data-happy2-ui="plugin-menu"]',
            ),
        ).not.toBeNull(),
    );
    // Navigating away from the conversation releases the chat-contribution surface,
    // so the composer contributions are gone (the composer itself unmounts).
    fireEvent.click(await screen.findByRole("button", { name: "Apps" }));
    await waitFor(() =>
        expect(
            screen.container.querySelector('[data-happy2-ui="composer-contributions"]'),
        ).toBeNull(),
    );
});
