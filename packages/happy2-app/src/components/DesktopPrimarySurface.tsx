import { type ReactNode } from "react";
import {
    AppShell,
    EmptyState,
    type AdminPageSection,
    type FilesPageFilter,
    type SidebarSection,
} from "happy2-ui";
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
    navSection?: SidebarSection;
    navActiveId: string;
    onNavSelect: (id: string) => void;
    sidebarFooter: ReactNode;
    /** Admin drill-down sidebar, present only while the admin route is active. */
    adminSidebar?: ReactNode;
    route: DesktopRoute;
    session?: AuthSession;
    state: HappyState;
    windowControls?: boolean;
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
    // Every primary view renders through ChatView so the chat sidebar (channel
    // list, DMs, agents) stays visible; non-conversation views mount in the
    // workspace via workspaceOverride.
    const chatView = (override?: ReactNode, sidebarOverride?: ReactNode) => (
        <ChatView
            adminStartSection={props.adminSections[0] ?? "users"}
            canOpenAdmin={props.adminSections.length > 0}
            createRequest={props.createRequest}
            navActiveId={props.navActiveId}
            navSection={props.navSection}
            navigation={props.navigation}
            onNavSelect={props.onNavSelect}
            platform={props.platform}
            route={props.route}
            session={props.session}
            sidebarFooter={props.sidebarFooter}
            sidebarOverride={sidebarOverride}
            state={props.state}
            windowControls={props.windowControls}
            workspaceOverride={override}
        />
    );
    return primary().kind === "conversation" ? (
        chatView()
    ) : primary().kind === "files" ? (
        chatView(
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
        chatView(<HomeView navigation={props.navigation} route={props.route} state={props.state} />)
    ) : primary().kind === "activity" ? (
        chatView(
            <InboxView navigation={props.navigation} route={props.route} state={props.state} />,
        )
    ) : primary().kind === "threads" ? (
        chatView(
            <ThreadsView navigation={props.navigation} route={props.route} state={props.state} />,
        )
    ) : primary().kind === "calls" ? (
        chatView(<CallsView state={props.state} />)
    ) : adminPrimary() ? (
        chatView(
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
            props.adminSidebar,
        )
    ) : primary().kind === "settings" ? (
        // Settings is a focused account surface, not a chat workspace view — it
        // renders standalone without the chat sidebar.
        <AppShell windowControls={props.windowControls}>
            <SettingsView session={props.session} state={props.state} />
        </AppShell>
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
