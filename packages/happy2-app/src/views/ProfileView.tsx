import type { HappyState } from "happy2-state";
import { Box, ProfilePage, StoreSurface } from "happy2-ui";
import { useAvatarImages } from "../avatarImages";
import { usePluginAssetMasks, type PluginAssetMasks } from "../pluginAssets";
import type { PluginNavigationSurface } from "../pluginContributions";
import { PluginInlineContribution } from "./PluginContributionRenderer";

export interface ProfileViewProps {
    state: HappyState;
    userId: string;
}

export function ProfileView(props: ProfileViewProps) {
    const avatars = useAvatarImages(props.state);
    const masks = usePluginAssetMasks(props.state);
    return (
        <Box style={{ display: "flex", flexDirection: "column", width: "100%", minHeight: 0 }}>
            <ProfilePage
                imageUrl={avatars.imageUrl}
                store={props.state.directory()}
                userId={props.userId}
            />
            <StoreSurface store={props.state.pluginNavigation()}>
                {(nav) => renderProfileContributions(nav, masks)}
            </StoreSurface>
        </Box>
    );
}

function renderProfileContributions(nav: PluginNavigationSurface, masks: PluginAssetMasks) {
    const contributions =
        nav.contributions.type === "ready"
            ? nav.contributions.value.filter((item) => item.location === "profileSection")
            : [];
    if (contributions.length === 0) return null;
    return (
        <Box
            data-happy2-ui="profile-contributions"
            style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "16px" }}
        >
            {contributions.map((contribution) => (
                <PluginInlineContribution
                    contribution={contribution}
                    key={contribution.id}
                    masks={masks}
                    surface={nav}
                />
            ))}
        </Box>
    );
}
