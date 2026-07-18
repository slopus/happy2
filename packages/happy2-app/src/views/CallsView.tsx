import type { HappyState } from "happy2-state";
import { CallsPage } from "happy2-ui";
import { createAvatarImages } from "../avatarImages";

export interface CallsViewProps {
    state: HappyState;
}
export function CallsView(props: CallsViewProps) {
    const avatars = createAvatarImages(() => props.state);
    return <CallsPage imageUrl={avatars.imageUrl} store={props.state.calls()} />;
}
