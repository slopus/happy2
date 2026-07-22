import { createElement, useSyncExternalStore, type FunctionComponent, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { createRenderer } from "happy2-gym/playwright";
import {
    happyStateCreate,
    type ChatMessageItem,
    type ChatSummary,
    type HappyState,
} from "happy2-state";
import "happy2-ui/styles.css";
import { expect, it, onTestFinished } from "vitest";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { ChatView } from "./ChatView";

const files = { filter: "all", query: "" } as const;
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

function chatRoute(chatId: string): DesktopRoute {
    return {
        primary: { kind: "conversation", conversationKind: "chat", chatId },
        files,
    };
}

function chatSummary(id: string): ChatSummary {
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
        pts: "100",
        lastMessageSequence: "100",
        membershipEpoch: "1",
        membershipRole: "owner",
        starred: false,
        lastReadSequence: "100",
        unreadCount: 0,
        mentionCount: 0,
        notificationLevel: "all",
        createdAt: "2026-01-01T00:00:00.000Z",
        updatedAt: "2026-01-01T00:00:00.000Z",
    };
}

function chatMessages(chatId: string): readonly ChatMessageItem[] {
    return Array.from({ length: 100 }, (_, index) => {
        const sequence = String(index + 1);
        return {
            source: "server",
            delivery: "sent",
            message: {
                id: `${chatId}-message-${sequence}`,
                chatId,
                sequence,
                changePts: sequence,
                kind: "user",
                automated: false,
                audience: "people",
                agentUserIds: [],
                text: Array.from(
                    { length: 8 },
                    (_, paragraph) =>
                        `${chatId} message ${sequence}, paragraph ${paragraph + 1}: mixed-height markdown must restore the same measured viewport rather than clamp to an estimated list edge.`,
                ).join("\n\n"),
                revision: 1,
                mentions: [],
                attachments: [],
                reactions: [],
                receipts: [],
                expiryMode: "none",
                createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
            },
        };
    });
}

function chatPreload(state: HappyState, chatId: string) {
    const handle = state.chatOpen(chatId);
    handle.getState().chatInput({
        type: "chatLoaded",
        chat: chatSummary(chatId),
        messages: chatMessages(chatId),
        hasMoreMessages: false,
    });
    handle[Symbol.dispose]();
}

it("restores a measured mixed-height chat after visiting a chat at the bottom", async () => {
    const state = happyStateCreate();
    onTestFinished(() => state[Symbol.dispose]());
    chatPreload(state, "chat-1");
    chatPreload(state, "chat-2");

    let currentRoute = chatRoute("chat-1");
    const routeListeners = new Set<() => void>();
    const routeSet = (route: DesktopRoute) => {
        currentRoute = route;
        for (const listener of routeListeners) listener();
    };
    const chatSelect = (chatId: string) => routeSet(chatRoute(chatId));
    function Harness() {
        const route = useSyncExternalStore(
            (listener) => {
                routeListeners.add(listener);
                return () => routeListeners.delete(listener);
            },
            () => currentRoute,
        );
        const navigation: DesktopNavigation = {
            router: undefined as never,
            get: () => route,
            subscribe: () => () => undefined,
            navigate: routeSet,
            close: () => undefined,
            [Symbol.dispose]: () => undefined,
        };
        return (
            <ChatView
                adminStartSection="users"
                canOpenAdmin={false}
                navigation={navigation}
                route={route}
                state={state}
            />
        );
    }

    const view = createRenderer<ReactNode>((component, surface) => {
        const root = createRoot(surface);
        flushSync(() => root.render(createElement(component as FunctionComponent)));
        return () => root.unmount();
    }).render(Harness, { height: 720, width: 1100 });
    await view.ready();
    await frame();
    await frame();
    await frame();
    await frame();
    const messageList = () =>
        view.container.querySelector<HTMLDivElement>('[data-happy2-ui="message-list"]')!;

    expect(messageList().scrollHeight).toBeGreaterThan(messageList().clientHeight);
    const first = messageList();
    first.scrollTop = 0;
    await frame();
    await frame();
    for (let step = 1; step <= 10; step += 1) {
        first.scrollTop = Math.round(((first.scrollHeight - first.clientHeight) * step) / 12);
        await frame();
        await frame();
    }
    const parked = first.scrollTop;
    expect(parked).toBeGreaterThan(chatMessages("chat-1").length * 72);
    expect(first.scrollTop).toBe(parked);

    flushSync(() => chatSelect("chat-2"));
    await frame();
    await frame();
    const second = messageList();
    expect(second).not.toBe(first);
    expect(second.scrollHeight - second.scrollTop - second.clientHeight).toBeLessThanOrEqual(1);

    flushSync(() => chatSelect("chat-1"));
    await frame();
    await frame();
    expect(messageList()).not.toBe(second);
    expect(messageList().scrollTop).toBe(parked);
});
