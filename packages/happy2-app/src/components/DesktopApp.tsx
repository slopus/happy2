import { useLayoutEffect, useReducer } from "react";
import {
    Avatar,
    Rail,
    StoreSurface,
    TitleBar,
    type AdminPageSection,
    type RailItem,
    type SearchResultType,
} from "happy2-ui";
import { permissionAllowed, type HappyState, type PermissionsSnapshot } from "happy2-state";
import type { AuthSession } from "./AuthGate";
import { DesktopOverlaySurface } from "./DesktopOverlaySurface";
import { DesktopPrimarySurface } from "./DesktopPrimarySurface";
import { useDesktopNavigation } from "../navigation/useDesktopNavigation";
import { desktopRouteFormat } from "../navigation/desktopRouteFormat";
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
const railItems: RailItem[] = [
    { id: "home", icon: "home", label: "Home" },
    { id: "chat", icon: "chat", label: "Chat" },
    { id: "activity", icon: "bell", label: "Activity" },
    { id: "threads", icon: "thread", label: "Threads" },
    { id: "files", icon: "files", label: "Files" },
    { id: "calls", icon: "mic", label: "Calls" },
];
/** Composes the persistent route owner, primary surface, and independent overlay layer. */
export function DesktopApp(props: DesktopAppProps) {
    const route = useDesktopNavigation(props.navigation);
    const [createRequest, requestCreateNext] = useReducer(
        (request: { kind: "agent" | "channel"; nonce: number }, kind: "agent" | "channel") => ({
            kind,
            nonce: request.nonce + 1,
        }),
        { kind: "agent", nonce: 0 },
    );
    const user = () => props.session?.user;
    const userName = () => user()?.firstName ?? "Profile";
    const userInitials = () => user()?.firstName?.slice(0, 2).toUpperCase() ?? "?";
    const search = () => {
        const overlay = route.overlay;
        return overlay?.kind === "search" ? overlay.query : "";
    };
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
    function railSelect(id: string) {
        const current = route.primary;
        if (id === "chat")
            primaryOpen(
                current.kind === "conversation"
                    ? current
                    : { kind: "conversation", conversationKind: "chat" },
            );
        else if (id === "home" || id === "activity" || id === "threads" || id === "calls")
            primaryOpen({ kind: id });
        else if (id === "files") primaryOpen({ kind: "files" });
    }
    function requestCreate(kind: "agent" | "channel") {
        if (route.primary.kind !== "conversation")
            primaryOpen({ kind: "conversation", conversationKind: "chat" });
        queueMicrotask(() => requestCreateNext(kind));
    }
    /** Opens the empty palette over the current surface without changing the primary route. */
    function paletteOpen() {
        if (route.overlay?.kind === "search") return;
        props.navigation.navigate({ ...route, overlay: { kind: "search", query: "" } });
    }
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
    const rail = () => (
        <Rail
            activeItemId={activeRailId() ?? ""}
            footer={
                <Avatar
                    aria-label={`${userName()} — online`}
                    imageUrl={user()?.avatarUrl}
                    initials={userInitials()}
                    online
                    size="md"
                    tone="brand"
                />
            }
            footerLabel="Open profile"
            items={railItems}
            onFooterSelect={() =>
                props.navigation.navigate({
                    ...route,
                    overlay: { kind: "profile", userId: user()?.id ?? "me" },
                })
            }
            onItemSelect={railSelect}
            primaryAction={{
                icon: "plus",
                label: "Create",
                menuItems: [
                    { id: "agent", icon: "spark", kind: "item", label: "New agent" },
                    { id: "channel", icon: "hash", kind: "item", label: "New channel" },
                ],
                onMenuSelect: (id) => {
                    if (id === "agent" || id === "channel") requestCreate(id);
                },
            }}
        />
    );
    const titleBar = () => (
        <TitleBar
            onSearchOpen={paletteOpen}
            searchPlaceholder="Search Happy (2)…"
            searchValue={search()}
            showWindowControls={props.platform === "desktop"}
        />
    );
    return (
        <StoreSurface store={props.state.permissions()}>
            {(permissions) => {
                const allowed = (permission: Parameters<typeof permissionAllowed>[1]) =>
                    permissionAllowed(permissions, permission);
                const adminSections = adminSectionsProject(permissions);
                return (
                    <>
                        <DesktopPrimarySurface
                            adminSections={adminSections}
                            canAssignSecrets={allowed("assignSecrets")}
                            canManageImages={allowed("manageImages")}
                            canManageSecrets={allowed("manageSecrets")}
                            canViewRoleMembers={allowed("manageAdminRoles")}
                            createRequest={createRequest}
                            navigation={props.navigation}
                            platform={props.platform}
                            rail={rail()}
                            route={route}
                            search={search()}
                            session={props.session}
                            state={props.state}
                            titleBar={titleBar()}
                        />
                        <DesktopOverlaySurface
                            navigation={props.navigation}
                            onSearchQueryChange={searchChange}
                            onSearchSelect={searchSelect}
                            route={route}
                            session={props.session}
                            state={props.state}
                        />
                    </>
                );
            }}
        </StoreSurface>
    );
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
