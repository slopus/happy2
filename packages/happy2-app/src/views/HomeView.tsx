import type { HappyState } from "happy2-state";
import { HomePage } from "happy2-ui";
import { createAvatarImages } from "../avatarImages";

export interface HomeViewProps {
    state: HappyState;
}
export function HomeView(props: HomeViewProps) {
    const avatars = createAvatarImages(() => props.state);
    return (
        <HomePage imageUrl={avatars.imageUrl} notificationsStore={props.state.notifications()} />
    );
}
