import type { HappyState } from "happy2-state";
import { CallsPage } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";

export interface CallsViewProps {
    state: HappyState;
}
export function CallsView(props: CallsViewProps) {
    const avatars = useAvatarImages(props.state);
    return <CallsPage imageUrl={avatars.imageUrl} store={props.state.calls()} />;
}
