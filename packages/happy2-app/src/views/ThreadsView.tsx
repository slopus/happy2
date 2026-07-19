import type { HappyState } from "happy2-state";
import { ThreadsPage } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";

export interface ThreadsViewProps {
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
}
export function ThreadsView(props: ThreadsViewProps) {
    const avatars = useAvatarImages(props.state);
    const store = props.state.threads();
    return (
        <ThreadsPage
            imageUrl={avatars.imageUrl}
            onSelect={(childChatId) => {
                const snapshot = store.getState().threads;
                const thread =
                    snapshot.type === "ready"
                        ? snapshot.value.find((item) => item.chat.id === childChatId)
                        : undefined;
                if (!thread) return;
                const chat = props.state
                    .sidebar()
                    .getState()
                    .chats.find((item) => item.id === thread.root.chatId);
                const conversationKind =
                    chat?.chat.kind === "public_channel" || chat?.chat.kind === "private_channel"
                        ? "channel"
                        : thread.chat.kind === "dm"
                          ? "chat"
                          : "channel";
                props.navigation.navigate({
                    ...props.route,
                    primary: {
                        kind: "conversation",
                        conversationKind,
                        chatId: thread.root.chatId,
                    },
                    panel: { kind: "thread", rootMessageId: thread.root.id },
                    overlay: undefined,
                });
            }}
            store={store}
        />
    );
}
