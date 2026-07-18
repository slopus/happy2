import type { HappyState } from "happy2-state";
import { ThreadsPage } from "happy2-ui";
import { createAvatarImages } from "../avatarImages";

export interface ThreadsViewProps {
    state: HappyState;
}
export function ThreadsView(props: ThreadsViewProps) {
    const avatars = createAvatarImages(() => props.state);
    return <ThreadsPage imageUrl={avatars.imageUrl} store={props.state.threads()} />;
}
