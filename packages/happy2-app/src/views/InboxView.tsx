import type { HappyState } from "happy2-state";
import { ActivityPage } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";
import { useNotificationNavigation } from "../navigation/useNotificationNavigation";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";

export interface InboxViewProps {
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
    virtualize?: boolean;
}
export function InboxView(props: InboxViewProps) {
    const avatars = useAvatarImages(props.state);
    const notifications = useNotificationNavigation(props.state, props.navigation, props.route);
    return (
        <ActivityPage
            contextLabel={notifications.contextLabel}
            imageUrl={avatars.imageUrl}
            onSelect={notifications.open}
            store={props.state.notifications()}
            virtualize={props.virtualize}
        />
    );
}
