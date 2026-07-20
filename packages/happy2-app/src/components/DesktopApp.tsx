import { useLayoutEffect, useReducer } from "react";
import {
    Avatar,
    Box,
    Button,
    Sidebar,
    SidebarAppsSection,
    StoreSurface,
    ThemeScope,
    type AdminPageSection,
    type IconName,
    type SearchResultType,
    type SidebarItem,
    type SidebarSection,
    type ThemeMode,
} from "happy2-ui";
import { permissionAllowed, type HappyState, type PermissionsSnapshot } from "happy2-state";
import type { AuthSession } from "./AuthGate";
import { DesktopOverlaySurface } from "./DesktopOverlaySurface";
import { DesktopPrimarySurface } from "./DesktopPrimarySurface";
import { useDesktopNavigation } from "../navigation/useDesktopNavigation";
import { desktopRouteFormat } from "../navigation/desktopRouteFormat";
import { usePluginAssetMasks, type PluginAssetMasks } from "../pluginAssets";
import { sidebarAppEntries } from "../views/AppsView";
import { PluginMenuContribution } from "../views/PluginContributionRenderer";
import { PluginOpenAppWatcher } from "../views/PluginOpenAppWatcher";
import type { PluginNavigationSurface } from "../pluginContributions";
import type {
    DesktopNavigation,
    DesktopPrimaryRoute,
    DesktopRoute,
} from "../navigation/desktopRouteTypes";
export interface DesktopAppProps {
    navigation: DesktopNavigation;
    platform?: "desktop" | "web";
    session?: AuthSession;
    state: HappyState;
}
/** Label + icon for each administration sub-section, used by the drill-down sidebar. */
const adminSectionMeta: Record<AdminPageSection, { label: string; icon: IconName }> = {
    users: { label: "Users", icon: "users" },
    reports: { label: "Reports", icon: "shield" },
    automations: { label: "Automations", icon: "zap" },
    integrations: { label: "Integrations", icon: "link" },
    images: { label: "Agent images", icon: "spark" },
    secrets: { label: "Agent secrets", icon: "shield" },
    plugins: { label: "Plugins", icon: "braces" },
    roles: { label: "Roles", icon: "shield" },
};
/** Composes the persistent route owner, primary surface, and independent overlay layer. */
export function DesktopApp(props: DesktopAppProps) {
    const route = useDesktopNavigation(props.navigation);
    const masks = usePluginAssetMasks(props.state);
    const [themeMode, themeModeSelect] = useReducer(
        (_mode: ThemeMode, currentAppearance: "dark" | "light") =>
            currentAppearance === "dark" ? "light" : "dark",
        "system" as ThemeMode,
    );
    // Channel/agent creation is driven by the sidebar's per-section "+" actions
    // and the New chat composer, so the surface takes a stable create request.
    const createRequest = { kind: "agent" as const, nonce: 0 };
    const user = () => props.session?.user;
    const userName = () => user()?.firstName ?? "Profile";
    const userInitials = () => user()?.firstName?.slice(0, 2).toUpperCase() ?? "?";
    function primaryOpen(primary: DesktopPrimaryRoute) {
        const next: DesktopRoute = {
            ...route,
            primary,
            panel: undefined,
            overlay: undefined,
        };
        if (desktopRouteFormat(next) === desktopRouteFormat(route)) return;
        props.navigation.navigate(next);
    }
    const chatOpen = () =>
        primaryOpen(
            route.primary.kind === "conversation"
                ? route.primary
                : { kind: "conversation", conversationKind: "chat" },
        );
    /** Updates the live palette query, keeping the palette open when the query is cleared. */
    function searchChange(value: string) {
        if (route.overlay?.kind !== "search") return;
        props.navigation.navigate(
            { ...route, overlay: { kind: "search", query: value } },
            { replace: true },
        );
    }
    useLayoutEffect(() => {
        const onKeyDown = (event: KeyboardEvent) => {
            if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
            if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
            if (event.key !== "k" && event.key !== "K") return;
            event.preventDefault();
            if (route.overlay?.kind === "search") return;
            props.navigation.navigate({
                ...route,
                overlay: { kind: "search", query: "" },
            });
        };
        window.addEventListener("keydown", onKeyDown);
        return () => window.removeEventListener("keydown", onKeyDown);
    }, [props.navigation, route]);
    function searchSelect(type: SearchResultType, id: string) {
        if (type === "channel")
            props.navigation.navigate(
                {
                    ...route,
                    primary: { kind: "conversation", conversationKind: "channel", chatId: id },
                    panel: undefined,
                    overlay: undefined,
                },
                { replace: true },
            );
        else if (type === "file")
            props.navigation.navigate(
                { ...route, overlay: { kind: "file", fileId: id } },
                { replace: true },
            );
        else if (type === "user") {
            const current = route.primary;
            if (current.kind === "conversation" && current.chatId)
                props.navigation.navigate(
                    { ...route, panel: { kind: "profile", userId: id }, overlay: undefined },
                    { replace: true },
                );
            else
                props.navigation.navigate(
                    { ...route, overlay: { kind: "profile", userId: id } },
                    { replace: true },
                );
        } else props.navigation.close("overlay");
    }
    const activeRailId = () => {
        const primary = route.primary;
        if (primary.kind === "conversation") return "chat";
        if (primary.kind === "settings") return undefined;
        if (primary.kind === "onboarding") return undefined;
        return primary.kind;
    };
    const systemAppearance = () =>
        window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
    const appearance = () => (themeMode === "system" ? systemAppearance() : themeMode);
    const profileOpen = () =>
        props.navigation.navigate({
            ...route,
            overlay: { kind: "profile", userId: user()?.id ?? "me" },
        });
    const appearanceToggle = () =>
        themeModeSelect(themeMode === "system" ? systemAppearance() : themeMode);
    /** Profile control + appearance toggle pinned to the bottom of the sidebar. */
    const sidebarFooter = (
        <Box style={{ display: "flex", alignItems: "center", gap: "4px", width: "100%" }}>
            <button
                aria-label="Open profile"
                className="happy2-sidebar__profile"
                data-happy2-ui="sidebar-profile"
                onClick={profileOpen}
                type="button"
            >
                <Avatar
                    aria-label={`${userName()} — online`}
                    imageUrl={user()?.avatarUrl}
                    initials={userInitials()}
                    online
                    size="sm"
                    tone="brand"
                />
                <span className="happy2-sidebar__profile-name">{userName()}</span>
            </button>
            <Button
                aria-label={
                    appearance() === "dark" ? "Use light appearance" : "Use dark appearance"
                }
                icon={appearance() === "dark" ? "sun" : "moon"}
                iconOnly
                onClick={appearanceToggle}
                size="small"
                variant="ghost"
            />
        </Box>
    );
    const windowControls = () => props.platform === "desktop";
    return (
        <StoreSurface store={props.state.permissions()}>
            {(permissions) => {
                const allowed = (permission: Parameters<typeof permissionAllowed>[1]) =>
                    permissionAllowed(permissions, permission);
                const adminSections = adminSectionsProject(permissions);
                const canOpenAdmin = adminSections.length > 0;
                // Workspace nav rows above the chat list: Apps (always available)
                // and Administration (owner/permission gated). Selecting either
                // pushes its drill-down sidebar (appsSidebar / adminSidebar).
                const navItems: SidebarItem[] = [
                    { id: "apps", kind: "view", icon: "spark", label: "Apps" },
                ];
                if (canOpenAdmin)
                    navItems.push({
                        id: "admin",
                        kind: "view",
                        icon: "settings",
                        label: "Administration",
                    });
                const navSection: SidebarSection = { id: "workspace", items: navItems };
                const navSelect = (id: string) => {
                    if (id === "admin")
                        primaryOpen({ kind: "admin", section: adminSections[0] ?? "users" });
                    else if (id === "apps") primaryOpen({ kind: "apps" });
                    else chatOpen();
                };
                const adminRoute = route.primary.kind === "admin" ? route.primary : undefined;
                const adminSidebar =
                    adminRoute && canOpenAdmin ? (
                        <Sidebar
                            activeItemId={adminRoute.section}
                            footer={sidebarFooter}
                            onBack={chatOpen}
                            onItemSelect={(id) =>
                                primaryOpen({ kind: "admin", section: id as AdminPageSection })
                            }
                            sections={[
                                {
                                    id: "admin-sections",
                                    items: adminSections.map((section) => ({
                                        id: section,
                                        kind: "view" as const,
                                        icon: adminSectionMeta[section].icon,
                                        label: adminSectionMeta[section].label,
                                    })),
                                },
                            ]}
                            title="Administration"
                        />
                    ) : undefined;
                const appsRoute = route.primary.kind === "apps" ? route.primary : undefined;
                const appsSidebar = appsRoute ? (
                    <StoreSurface store={props.state.pluginNavigation()}>
                        {(nav) => (
                            <SidebarAppsSection
                                activeAppId={appsRoute.appId ?? ""}
                                apps={sidebarAppEntries(
                                    nav.apps.type === "ready" ? nav.apps.value : [],
                                ).map((app) => ({
                                    id: app.id,
                                    title: app.title,
                                    maskUrl: masks.maskUrl(app.pluginId, app.assetId),
                                    available: app.available,
                                }))}
                                menu={sidebarMenuContributions(nav, masks)}
                                onAppSelect={(id) => primaryOpen({ kind: "apps", appId: id })}
                                onBack={chatOpen}
                                onManage={() => primaryOpen({ kind: "apps" })}
                            />
                        )}
                    </StoreSurface>
                ) : undefined;
                return (
                    <ThemeScope mode={themeMode}>
                        <DesktopPrimarySurface
                            adminSections={adminSections}
                            adminSidebar={adminSidebar}
                            appsSidebar={appsSidebar}
                            canAssignSecrets={allowed("assignSecrets")}
                            canManageImages={allowed("manageImages")}
                            canManageSecrets={allowed("manageSecrets")}
                            canViewRoleMembers={allowed("manageAdminRoles")}
                            canResetPasswords={allowed("resetPasswords")}
                            createRequest={createRequest}
                            navActiveId={activeRailId() ?? ""}
                            navSection={navSection}
                            navigation={props.navigation}
                            onNavSelect={navSelect}
                            platform={props.platform}
                            route={route}
                            session={props.session}
                            sidebarFooter={sidebarFooter}
                            state={props.state}
                            windowControls={windowControls()}
                        />
                        <DesktopOverlaySurface
                            navigation={props.navigation}
                            onSearchQueryChange={searchChange}
                            onSearchSelect={searchSelect}
                            route={route}
                            session={props.session}
                            state={props.state}
                        />
                        <StoreSurface store={props.state.pluginNavigation()}>
                            {(nav) => (
                                <PluginOpenAppWatcher
                                    actionStates={nav.actionStates}
                                    navigation={props.navigation}
                                    route={route}
                                />
                            )}
                        </StoreSurface>
                    </ThemeScope>
                );
            }}
        </StoreSurface>
    );
}

/** Renders the sidebar-menu contribution triggers shown in the Apps sidebar footer. */
function sidebarMenuContributions(nav: PluginNavigationSurface, masks: PluginAssetMasks) {
    const contributions =
        nav.contributions.type === "ready"
            ? nav.contributions.value.filter((item) => item.location === "sidebarMenu")
            : [];
    if (contributions.length === 0) return undefined;
    return contributions.map((contribution) => (
        <PluginMenuContribution
            contribution={contribution}
            key={contribution.id}
            masks={masks}
            surface={nav}
        />
    ));
}

function adminSectionsProject(snapshot: PermissionsSnapshot): readonly AdminPageSection[] {
    const owner = snapshot.permissions.type === "ready" && snapshot.permissions.value.owner;
    const allowed = (permission: Parameters<typeof permissionAllowed>[1]) =>
        permissionAllowed(snapshot, permission);
    const sections: AdminPageSection[] = [];
    if (allowed("viewAllMembers")) sections.push("users");
    if (owner) sections.push("reports", "automations", "integrations");
    if (allowed("manageImages") || allowed("assignImagesToChats")) sections.push("images");
    if (allowed("manageSecrets") || allowed("assignSecrets")) sections.push("secrets");
    if (allowed("managePlugins")) sections.push("plugins");
    if (allowed("manageAdminRoles")) sections.push("roles");
    return sections;
}
