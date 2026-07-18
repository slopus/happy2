import { AppShell, EmptyState, type AdminPageSection, type FilesPageFilter } from "happy2-ui";
import type { HappyState } from "happy2-state";
import { Match, Switch, type JSX } from "solid-js";
import type { AuthSession } from "./AuthGate";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { AdminView } from "../views/AdminView";
import { CallsView } from "../views/CallsView";
import { ChatView } from "../views/ChatView";
import { FilesView } from "../views/FilesView";
import { HomeView } from "../views/HomeView";
import { InboxView } from "../views/InboxView";
import { SettingsView } from "../views/SettingsView";
import { ThreadsView } from "../views/ThreadsView";

export interface DesktopPrimarySurfaceProps {
    createRequest: () => { kind: "agent" | "channel"; nonce: number };
    navigation: DesktopNavigation;
    platform?: "desktop" | "web";
    rail: JSX.Element;
    route: DesktopRoute;
    search: () => string;
    session?: AuthSession;
    state: HappyState;
    titleBar: JSX.Element;
}

/** Selects one primary desktop surface; overlays are deliberately hosted by its parent. */
export function DesktopPrimarySurface(props: DesktopPrimarySurfaceProps) {
    const primary = () => props.route.primary;
    const adminPrimary = () => {
        const value = primary();
        return value.kind === "admin" ? value : undefined;
    };
    const onboardingPrimary = () => {
        const value = primary();
        return value.kind === "onboarding" ? value : undefined;
    };
    const shell = (child: JSX.Element) => (
        <AppShell rail={props.rail} titleBar={props.titleBar}>
            {child}
        </AppShell>
    );
    return (
        <Switch fallback={null}>
            <Match when={primary().kind === "conversation"}>
                <ChatView
                    createRequest={props.createRequest}
                    navigation={props.navigation}
                    platform={props.platform}
                    rail={props.rail}
                    route={props.route}
                    search={props.search}
                    session={props.session}
                    state={props.state}
                    titleBar={props.titleBar}
                />
            </Match>
            <Match when={primary().kind === "files"}>
                {shell(
                    <FilesView
                        filter={props.route.files.filter as FilesPageFilter}
                        onFilterChange={(filter) =>
                            props.navigation.navigate(
                                { ...props.route, files: { ...props.route.files, filter } },
                                { replace: true },
                            )
                        }
                        onOpen={(fileId) =>
                            props.navigation.navigate(
                                { ...props.route, overlay: { kind: "file", fileId } },
                                { layer: "overlay" },
                            )
                        }
                        onQueryChange={(query) =>
                            props.navigation.navigate(
                                { ...props.route, files: { ...props.route.files, query } },
                                { replace: true, transient: true },
                            )
                        }
                        query={props.route.files.query}
                        state={props.state}
                    />,
                )}
            </Match>
            <Match when={primary().kind === "home"}>
                {shell(<HomeView state={props.state} />)}
            </Match>
            <Match when={primary().kind === "activity"}>
                {shell(<InboxView state={props.state} />)}
            </Match>
            <Match when={primary().kind === "threads"}>
                {shell(<ThreadsView state={props.state} />)}
            </Match>
            <Match when={primary().kind === "calls"}>
                {shell(<CallsView state={props.state} />)}
            </Match>
            <Match when={adminPrimary()}>
                {shell(
                    <AdminView
                        onSectionChange={(section: AdminPageSection) =>
                            props.navigation.navigate({
                                ...props.route,
                                primary: { kind: "admin", section },
                                panel: undefined,
                                overlay: undefined,
                            })
                        }
                        section={adminPrimary()?.section ?? "users"}
                        state={props.state}
                    />,
                )}
            </Match>
            <Match when={primary().kind === "settings"}>
                {shell(<SettingsView session={props.session} state={props.state} />)}
            </Match>
            <Match when={onboardingPrimary()}>
                {shell(
                    <EmptyState
                        description="The route is reserved for the centered P0.4 server-driven onboarding flow."
                        icon="spark"
                        title={`Setup: ${onboardingPrimary()?.step ?? ""}`}
                    />,
                )}
            </Match>
        </Switch>
    );
}
