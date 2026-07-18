import { EmptyState, Modal, ModalOverlay } from "happy2-ui";
import type { HappyState } from "happy2-state";
import { Match, Show, Switch } from "solid-js";
import type { AuthSession } from "./AuthGate";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { SearchOverlay } from "../views/SearchOverlay";
import { SettingsView } from "../views/SettingsView";
import { DesktopFileOverlay } from "./DesktopFileOverlay";

export interface DesktopOverlaySurfaceProps {
    route: DesktopRoute;
    navigation: DesktopNavigation;
    state: HappyState;
    session?: AuthSession;
    onSearchSelect: (type: import("happy2-ui").SearchResultType, id: string) => void;
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
    const modalOverlay = () => {
        const value = overlay();
        return value?.kind === "modal" ? value : undefined;
    };
    const close = () => props.navigation.close("overlay");
    return (
        <Switch fallback={null}>
            <Match when={searchOverlay()}>
                <ModalOverlay onDismiss={close}>
                    <Modal icon="search" onClose={close} size="large" title="Search Happy (2)">
                        <SearchOverlay
                            onSelect={props.onSearchSelect}
                            query={searchOverlay()?.query ?? ""}
                            state={props.state}
                        />
                    </Modal>
                </ModalOverlay>
            </Match>
            <Match when={profileOverlay()}>
                <ModalOverlay onDismiss={close}>
                    <Modal icon="at" onClose={close} size="large" title="Profile and settings">
                        <Show
                            when={
                                profileOverlay()?.userId === "me" ||
                                profileOverlay()?.userId === props.session?.user.id
                            }
                            fallback={
                                <EmptyState
                                    description="This route is ready for the shared P0.5 profile surface."
                                    icon="at"
                                    size="inline"
                                    title="Profile"
                                />
                            }
                        >
                            <SettingsView session={props.session} state={props.state} />
                        </Show>
                    </Modal>
                </ModalOverlay>
            </Match>
            <Match when={fileOverlay()}>
                <DesktopFileOverlay
                    fileId={fileOverlay()?.fileId ?? ""}
                    onClose={close}
                    state={props.state}
                />
            </Match>
            <Match when={overlay()?.kind === "command"}>
                <ModalOverlay onDismiss={close}>
                    <Modal icon="search" onClose={close} size="large" title="Commands">
                        <EmptyState
                            description="The persistent command route is ready for the P0.9 command catalog."
                            icon="search"
                            size="inline"
                            title="Command palette"
                        />
                    </Modal>
                </ModalOverlay>
            </Match>
            <Match when={modalOverlay()}>
                <ModalOverlay onDismiss={close}>
                    <Modal icon="spark" onClose={close} title="Happy (2)">
                        <EmptyState
                            description={`Route-owned modal: ${modalOverlay()?.id ?? ""}`}
                            icon="spark"
                            size="inline"
                            title="Modal surface"
                        />
                    </Modal>
                </ModalOverlay>
            </Match>
        </Switch>
    );
}
