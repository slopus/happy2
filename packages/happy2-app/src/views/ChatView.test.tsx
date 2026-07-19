import { cleanup, render, waitFor } from "@testing-library/react";
import { happyStateCreate } from "happy2-state";
import { createFakeServer, jsonResponse } from "happy2-state/testing";
import { afterEach, expect, it, onTestFinished, vi } from "vitest";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { ChatView } from "./ChatView";

afterEach(cleanup);

const files = { filter: "all", query: "" } as const;

function chatRoute(chatId: string, panel?: DesktopRoute["panel"]): DesktopRoute {
    return {
        primary: { kind: "conversation", conversationKind: "chat", chatId },
        panel,
        files,
    };
}

function navigationStub(): DesktopNavigation {
    return {
        router: undefined as never,
        get: () => chatRoute("chat-1"),
        subscribe: () => () => undefined,
        navigate: () => undefined,
        close: () => undefined,
        [Symbol.dispose]: () => undefined,
    };
}

function chatSummary(id: string) {
    return {
        id,
        kind: "dm",
        dmType: "direct",
        isListed: false,
        isMain: false,
        autoJoin: false,
        isDefaultAgentConversation: false,
        retentionMode: "inherit",
        defaultExpiryMode: "none",
        defaultAfterReadScope: "any_reader",
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
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

it("acquires and releases exactly one trace lease per routed panel lifetime", async () => {
    const server = createFakeServer();
    for (const chatId of ["chat-1", "chat-2"]) {
        server.respond(
            "GET",
            `/v0/chats/${chatId}`,
            jsonResponse(200, { chat: chatSummary(chatId) }),
        );
        server.respond(
            "GET",
            `/v0/chats/${chatId}/messages?limit=100`,
            jsonResponse(200, { messages: [], hasMore: false, chatPts: "0" }),
        );
    }
    for (const messageId of ["message-2", "message-3"]) {
        server.respond(
            "GET",
            `/v0/messages/${messageId}/agentTrace`,
            jsonResponse(200, {
                trace: {
                    turnId: "message-1",
                    agentUserId: "agent-1",
                    status: "complete",
                    entryCount: 0,
                    subagents: [],
                    backgroundTerminals: [],
                    entries: [],
                },
            }),
        );
    }
    const state = happyStateCreate({ transport: server.transport });
    onTestFinished(() => state[Symbol.dispose]());
    const leases: Array<{ messageId: string; disposeCount: number }> = [];
    const originalOpen = state.agentTraceOpen.bind(state);
    vi.spyOn(state, "agentTraceOpen").mockImplementation((messageId) => {
        const handle = originalOpen(messageId);
        const record = { messageId, disposeCount: 0 };
        leases.push(record);
        const originalDispose = handle[Symbol.dispose].bind(handle);
        return {
            ...handle,
            [Symbol.dispose]() {
                record.disposeCount += 1;
                originalDispose();
            },
        };
    });
    const navigation = navigationStub();
    const view = (route: DesktopRoute) => (
        <ChatView
            adminStartSection="users"
            canOpenAdmin={false}
            navigation={navigation}
            rail={<div>Rail</div>}
            route={route}
            search=""
            state={state}
            titleBar={<div>Title</div>}
        />
    );

    const screen = render(view(chatRoute("chat-1")));
    await waitFor(() => expect(server.requests.some(({ path }) => path === "/v0/chats/chat-1")));
    expect(leases).toHaveLength(0);

    // Opening the routed trace panel acquires exactly one lease; an unrelated
    // re-render with the same route must not reacquire or release it.
    screen.rerender(view(chatRoute("chat-1", { kind: "trace", messageId: "message-2" })));
    expect(leases).toEqual([{ messageId: "message-2", disposeCount: 0 }]);
    screen.rerender(view(chatRoute("chat-1", { kind: "trace", messageId: "message-2" })));
    expect(leases).toEqual([{ messageId: "message-2", disposeCount: 0 }]);

    // Retargeting the panel to another message swaps the lease.
    screen.rerender(view(chatRoute("chat-1", { kind: "trace", messageId: "message-3" })));
    expect(leases).toEqual([
        { messageId: "message-2", disposeCount: 1 },
        { messageId: "message-3", disposeCount: 0 },
    ]);

    // Closing the panel releases the lease.
    screen.rerender(view(chatRoute("chat-1")));
    expect(leases).toEqual([
        { messageId: "message-2", disposeCount: 1 },
        { messageId: "message-3", disposeCount: 1 },
    ]);

    // A panel open across a chat switch releases the previous lease during the
    // chat replacement instead of leaking it.
    screen.rerender(view(chatRoute("chat-1", { kind: "trace", messageId: "message-2" })));
    expect(leases[2]).toEqual({ messageId: "message-2", disposeCount: 0 });
    screen.rerender(view(chatRoute("chat-2")));
    expect(leases[2]).toEqual({ messageId: "message-2", disposeCount: 1 });

    // Unmount releases everything exactly once.
    screen.rerender(view(chatRoute("chat-2", { kind: "trace", messageId: "message-3" })));
    expect(leases[3]).toEqual({ messageId: "message-3", disposeCount: 0 });
    screen.unmount();
    expect(leases.map(({ disposeCount }) => disposeCount)).toEqual([1, 1, 1, 1]);
});
