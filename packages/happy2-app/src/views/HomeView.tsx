import type { HappyState } from "happy2-state";
import { HomePage } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";
import { useNotificationNavigation } from "../navigation/useNotificationNavigation";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";

export interface HomeViewProps {
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
}
export function HomeView(props: HomeViewProps) {
    const avatars = useAvatarImages(props.state);
    const notifications = useNotificationNavigation(props.state, props.navigation, props.route);
    return (
        <HomePage
            contextLabel={notifications.contextLabel}
            imageUrl={avatars.imageUrl}
            notificationsStore={props.state.notifications()}
            onSelect={notifications.open}
        />
    );
}
