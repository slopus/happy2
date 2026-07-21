import { useSyncExternalStore } from "react";
import type { HappyState, NotificationProjection } from "happy2-state";
import type { DesktopNavigation, DesktopRoute } from "./desktopRouteTypes";

/** Resolves notification destinations from the live sidebar without mirroring either store. */
export function useNotificationNavigation(
    state: HappyState,
    navigation: DesktopNavigation,
    route: DesktopRoute,
) {
    const sidebar = state.sidebar();
    const sidebarSnapshot = useSyncExternalStore(
        sidebar.subscribe,
        sidebar.getState,
        sidebar.getInitialState,
    );
    const chatFor = (chatId?: string) =>
        chatId ? sidebarSnapshot.chats.find((chat) => chat.id === chatId) : undefined;

    return {
        contextLabel(notification: NotificationProjection): string | undefined {
            const chat = chatFor(notification.chatId);
            if (chat) return chat.displayName;
            if (notification.chatId) return "Conversation";
            if (notification.kind === "call") return "Calls";
            if (notification.kind === "moderation") return "Administration";
            if (notification.kind === "automation") return "Automations";
            if (notification.kind === "system") return "System";
            return undefined;
        },
        open(notification: NotificationProjection): void {
            if (notification.kind === "call") {
                navigation.navigate({
                    ...route,
                    primary: { kind: "calls" },
                    panel: undefined,
                    overlay: undefined,
                });
                return;
            }
            if (!notification.chatId) return;
            const chat = chatFor(notification.chatId);
            const conversationKind =
                chat?.chat.kind === "public_channel" || chat?.chat.kind === "private_channel"
                    ? "channel"
                    : "chat";
            navigation.navigate({
                ...route,
                primary: {
                    kind: "conversation",
                    conversationKind,
                    chatId: notification.chatId,
                },
                panel: undefined,
                overlay: undefined,
            });
        },
    };
}
