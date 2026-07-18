import type { HappyState } from "happy2-state";
import { ActivityPage } from "happy2-ui";
import { createAvatarImages } from "../avatarImages";

export interface InboxViewProps {
    state: HappyState;
}
export function InboxView(props: InboxViewProps) {
    const avatars = createAvatarImages(() => props.state);
    return <ActivityPage imageUrl={avatars.imageUrl} store={props.state.notifications()} />;
}
