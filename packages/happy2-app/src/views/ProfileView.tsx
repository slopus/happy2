import type { HappyState } from "happy2-state";
import { ProfilePage } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";

export interface ProfileViewProps {
    state: HappyState;
    userId: string;
}

export function ProfileView(props: ProfileViewProps) {
    const avatars = useAvatarImages(props.state);
    return (
        <ProfilePage
            imageUrl={avatars.imageUrl}
            store={props.state.directory()}
            userId={props.userId}
        />
    );
}
