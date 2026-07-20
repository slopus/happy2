import { CommandPalette, Modal, ModalOverlay } from "happy2-ui";
import type { HappyState } from "happy2-state";
import type { AuthSession } from "./AuthGate";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { SearchOverlay } from "../views/SearchOverlay";
import { ProfileView } from "../views/ProfileView";
import { SettingsView } from "../views/SettingsView";
import { PluginAppOverlayView } from "../views/PluginAppOverlayView";
import { DesktopFileOverlay } from "./DesktopFileOverlay";
export interface DesktopOverlaySurfaceProps {
    route: DesktopRoute;
    navigation: DesktopNavigation;
    state: HappyState;
    session?: AuthSession;
    onSearchSelect: (type: import("happy2-ui").SearchResultType, id: string) => void;
    onSearchQueryChange: (value: string) => void;
}
/** Renders route-addressable modal layers without owning or replacing the primary surface. */
export function DesktopOverlaySurface(props: DesktopOverlaySurfaceProps) {
    const overlay = () => props.route.overlay;
    const searchOverlay = () => {
        const value = overlay();
        return value?.kind === "search" ? value : undefined;
    };
    const fileOverlay = () => {
        const value = overlay();
        return value?.kind === "file" ? value : undefined;
    };
    const profileOverlay = () => {
        const value = overlay();
        return value?.kind === "profile" ? value : undefined;
    };
    const appOverlay = () => {
        const value = overlay();
        return value?.kind === "app" ? value : undefined;
    };
    const close = () => props.navigation.close("overlay");
    return searchOverlay() ? (
        <ModalOverlay onDismiss={close} placement="top">
            <CommandPalette
                onClose={close}
                onQueryChange={props.onSearchQueryChange}
                placeholder="Search Happy (2)…"
                query={searchOverlay()?.query ?? ""}
            >
                <SearchOverlay
                    onSelect={props.onSearchSelect}
                    query={searchOverlay()?.query ?? ""}
                    state={props.state}
                />
            </CommandPalette>
        </ModalOverlay>
    ) : profileOverlay() ? (
        <ModalOverlay onDismiss={close}>
            <Modal icon="at" onClose={close} size="large" title="Profile and settings">
                {profileOverlay()?.userId === "me" ||
                profileOverlay()?.userId === props.session?.user.id ? (
                    <SettingsView session={props.session} state={props.state} />
                ) : (
                    <ProfileView state={props.state} userId={profileOverlay()?.userId ?? ""} />
                )}
            </Modal>
        </ModalOverlay>
    ) : fileOverlay() ? (
        <DesktopFileOverlay
            fileId={fileOverlay()?.fileId ?? ""}
            onClose={close}
            state={props.state}
        />
    ) : appOverlay() ? (
        <PluginAppOverlayView
            instanceId={appOverlay()!.instanceId}
            navigation={props.navigation}
            route={props.route}
            onClose={close}
            onPresentationChange={(presentation) =>
                props.navigation.navigate(
                    {
                        ...props.route,
                        overlay: {
                            kind: "app",
                            instanceId: appOverlay()!.instanceId,
                            presentation,
                        },
                    },
                    { replace: true },
                )
            }
            presentation={appOverlay()!.presentation}
            state={props.state}
        />
    ) : null;
}
