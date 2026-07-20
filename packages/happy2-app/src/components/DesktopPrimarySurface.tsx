import { type ReactNode } from "react";
import { AppShell, EmptyState, type AdminPageSection, type FilesPageFilter } from "happy2-ui";
import type { HappyState } from "happy2-state";
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
import { ServerOnboarding } from "./ServerOnboarding";
export interface DesktopPrimarySurfaceProps {
    createRequest: {
        kind: "agent" | "channel";
        nonce: number;
    };
    navigation: DesktopNavigation;
    platform?: "desktop" | "web";
    rail: ReactNode;
    route: DesktopRoute;
    search: string;
    session?: AuthSession;
    state: HappyState;
    titleBar: ReactNode;
    adminSections: readonly AdminPageSection[];
    canManageImages: boolean;
    canManageSecrets: boolean;
    canAssignSecrets: boolean;
    canViewRoleMembers: boolean;
    canResetPasswords: boolean;
}
/** Selects one primary desktop surface; overlays are deliberately hosted by its parent. */
export function DesktopPrimarySurface(props: DesktopPrimarySurfaceProps) {
    const primary = () => props.route.primary;
    const adminPrimary = () => {
        const value = primary();
        return value.kind === "admin" ? value : undefined;
    };
    const adminSectionAllowed = () => {
        const value = adminPrimary();
        return Boolean(value && props.adminSections.includes(value.section));
    };
    const onboardingPrimary = () => {
        const value = primary();
        return value.kind === "onboarding" ? value : undefined;
    };
    const shell = (child: ReactNode) => (
        <AppShell rail={props.rail} titleBar={props.titleBar}>
            {child}
        </AppShell>
    );
    return primary().kind === "conversation" ? (
        <ChatView
            adminStartSection={props.adminSections[0] ?? "users"}
            canOpenAdmin={props.adminSections.length > 0}
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
    ) : primary().kind === "files" ? (
        shell(
            <FilesView
                filter={props.route.files.filter as FilesPageFilter}
                onFilterChange={(filter) =>
                    props.navigation.navigate(
                        { ...props.route, files: { ...props.route.files, filter } },
                        { replace: true },
                    )
                }
                onOpen={(fileId) =>
                    props.navigation.navigate({ ...props.route, overlay: { kind: "file", fileId } })
                }
                onQueryChange={(query) =>
                    props.navigation.navigate(
                        { ...props.route, files: { ...props.route.files, query } },
                        { replace: true },
                    )
                }
                query={props.route.files.query}
                state={props.state}
            />,
        )
    ) : primary().kind === "home" ? (
        shell(<HomeView navigation={props.navigation} route={props.route} state={props.state} />)
    ) : primary().kind === "activity" ? (
        shell(<InboxView navigation={props.navigation} route={props.route} state={props.state} />)
    ) : primary().kind === "threads" ? (
        shell(<ThreadsView navigation={props.navigation} route={props.route} state={props.state} />)
    ) : primary().kind === "calls" ? (
        shell(<CallsView state={props.state} />)
    ) : adminPrimary() ? (
        shell(
            adminSectionAllowed() ? (
                <AdminView
                    canAssignSecrets={props.canAssignSecrets}
                    canManageImages={props.canManageImages}
                    canManageSecrets={props.canManageSecrets}
                    canViewRoleMembers={props.canViewRoleMembers}
                    canResetPasswords={props.canResetPasswords}
                    onSectionChange={(section: AdminPageSection) =>
                        props.navigation.navigate({
                            ...props.route,
                            primary: { kind: "admin", section },
                            panel: undefined,
                            overlay: undefined,
                        })
                    }
                    section={adminPrimary()?.section ?? props.adminSections[0] ?? "users"}
                    sections={props.adminSections}
                    state={props.state}
                />
            ) : (
                <EmptyState
                    description="Your current roles do not grant access to this administration section."
                    icon="shield"
                    title="Administration unavailable"
                />
            ),
        )
    ) : primary().kind === "settings" ? (
        shell(<SettingsView session={props.session} state={props.state} />)
    ) : onboardingPrimary() ? (
        <ServerOnboarding
            navigation={props.navigation}
            onComplete={() =>
                props.navigation.navigate(
                    {
                        ...props.route,
                        primary: { kind: "home" },
                        panel: undefined,
                        overlay: undefined,
                    },
                    { replace: true },
                )
            }
            showWindowDragRegion={props.platform === "desktop"}
            state={props.state}
        />
    ) : null;
}
