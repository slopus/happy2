import { useLayoutEffect, useReducer, type ReactNode } from "react";
import type {
    HappyState,
    PluginAppHandle,
    PluginAppSummary,
    PluginAppInstanceSnapshot,
    PluginAppOpenPresentation,
} from "happy2-state";
import {
    Box,
    PluginAppView,
    PluginAssetGlyph,
    PluginSettingsPanel,
    StoreSurface,
    type McpAppDisplayMode,
    type PluginSettingsAppRow,
} from "happy2-ui";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { usePluginAssetMasks, type PluginAssetMasks } from "../pluginAssets";
import {
    pluginAppOpenTargetResolve,
    pluginOpenAppNavigate,
    pluginPresentationUiState,
    type PluginNavigationSurface,
} from "../pluginContributions";
import { PluginInlineContribution } from "./PluginContributionRenderer";

export interface AppsViewProps {
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
}

const APP_DISPLAY_MODES: readonly McpAppDisplayMode[] = ["inline", "fullscreen"];

/**
 * The primary workspace surface for the Apps area. With an app instance selected
 * it hosts that durable app page; with none selected it shows the Apps & plugin
 * settings management panel. It owns no product state — one retained handle per
 * open instance and one coarse subscription to plugin navigation.
 */
export function AppsView(props: AppsViewProps) {
    const appId = props.route.primary.kind === "apps" ? props.route.primary.appId : undefined;
    const masks = usePluginAssetMasks(props.state);
    if (appId)
        return (
            <PluginAppPageView
                instanceId={appId}
                masks={masks}
                navigation={props.navigation}
                route={props.route}
                state={props.state}
            />
        );
    return <AppsManageView masks={masks} state={props.state} />;
}

function PluginAppPageView(props: {
    instanceId: string;
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
    masks: PluginAssetMasks;
}) {
    const [handle, setHandle] = useReducer(
        (_current: PluginAppHandle | undefined, next: PluginAppHandle | undefined) => next,
        undefined,
    );
    useLayoutEffect(() => {
        const acquired = props.state.pluginAppOpen(props.instanceId);
        setHandle(acquired);
        return () => {
            acquired[Symbol.dispose]();
            setHandle(undefined);
        };
    }, [props.state, props.instanceId]);
    if (!handle) return <PluginAppView status="loading" title="App" />;
    return (
        <StoreSurface store={props.state.pluginNavigation()}>
            {(nav: PluginNavigationSurface) => {
                const openApp = (instanceKey: string, presentation: PluginAppOpenPresentation) => {
                    const apps = nav.apps.type === "ready" ? nav.apps.value : [];
                    // Only open another instance owned by the same installation and
                    // plugin as the mounted app — the key is plugin-controlled.
                    const targetId = pluginAppOpenTargetResolve(
                        apps,
                        props.instanceId,
                        instanceKey,
                    );
                    if (targetId)
                        pluginOpenAppNavigate(
                            props.navigation,
                            props.route,
                            targetId,
                            presentation,
                        );
                };
                return (
                    <StoreSurface store={handle}>
                        {(snapshot: PluginAppInstanceSnapshot) =>
                            renderAppPage(snapshot, handle, props, openApp)
                        }
                    </StoreSurface>
                );
            }}
        </StoreSurface>
    );
}

function renderAppPage(
    snapshot: PluginAppInstanceSnapshot,
    handle: PluginAppHandle,
    props: {
        instanceId: string;
        navigation: DesktopNavigation;
        route: DesktopRoute;
        masks: PluginAssetMasks;
    },
    onOpenApp: (instanceKey: string, presentation: PluginAppOpenPresentation) => void,
): ReactNode {
    const view = snapshot.view;
    if (view.type === "error")
        return (
            <PluginAppView
                error={view.error.message}
                onReload={() => handle.pluginAppReload()}
                status="error"
                title="App"
            />
        );
    if (view.type !== "ready") return <PluginAppView status="loading" title="App" />;
    const { app, resource, hostContext } = view.value;
    const glyph = (
        <PluginAssetGlyph
            maskUrl={props.masks.maskUrl(app.installationId, app.assetId)}
            size={24}
        />
    );
    const requestFullscreen = (mode: McpAppDisplayMode): McpAppDisplayMode => {
        if (mode === "fullscreen") {
            props.navigation.navigate({
                ...props.route,
                overlay: { kind: "app", instanceId: props.instanceId, presentation: "fullscreen" },
            });
            return "fullscreen";
        }
        return "inline";
    };
    return (
        <PluginAppView
            availableDisplayModes={APP_DISPLAY_MODES}
            description={app.description}
            displayMode="inline"
            glyph={glyph}
            hostContext={hostContext}
            onOpenApp={onOpenApp}
            onOpenLink={openExternalLink}
            onReload={() => handle.pluginAppReload()}
            onRequestDisplayMode={requestFullscreen}
            onResourceRead={(uri) => handle.pluginAppResourceRead(uri)}
            onToolCall={(name, args) => handle.pluginAppToolCall(name, args)}
            resource={{
                html: resource.html,
                contentHashSha256: resource.contentHashSha256,
                ...(resource.csp ? { csp: resource.csp } : {}),
                ...(resource.permissions ? { permissions: resource.permissions } : {}),
                ...(resource.prefersBorder ? { prefersBorder: true } : {}),
            }}
            status={app.available ? "ready" : "unavailable"}
            title={app.title}
        />
    );
}

function AppsManageView(props: { state: HappyState; masks: PluginAssetMasks }) {
    return (
        <Box
            data-happy2-ui="apps-manage"
            style={{
                display: "flex",
                flexDirection: "column",
                width: "100%",
                height: "100%",
                minHeight: 0,
                overflow: "auto",
            }}
        >
            <Box
                style={{
                    display: "flex",
                    flexDirection: "column",
                    width: "100%",
                    maxWidth: "760px",
                    padding: "24px",
                    gap: "24px",
                    margin: "0 auto",
                }}
            >
                <StoreSurface store={props.state.pluginNavigation()}>
                    {(nav) => renderManage(nav, props.masks)}
                </StoreSurface>
            </Box>
        </Box>
    );
}

function renderManage(nav: PluginNavigationSurface, masks: PluginAssetMasks): ReactNode {
    const apps = nav.apps.type === "ready" ? nav.apps.value : [];
    const sidebarApps = apps
        .filter((app) => app.presentation === "sidebar")
        .slice()
        .sort((left, right) => left.position - right.position);
    const rows: PluginSettingsAppRow[] = sidebarApps.map((app, index) => {
        const presentation = pluginPresentationUiState(nav.presentationStates.get(app.id));
        return {
            id: app.id,
            title: app.title,
            description: app.description,
            glyph: (
                <PluginAssetGlyph
                    maskUrl={masks.maskUrl(app.installationId, app.assetId)}
                    size={20}
                />
            ),
            hidden: app.hidden,
            available: app.available,
            busy: presentation.busy,
            ...(presentation.error ? { error: presentation.error } : {}),
            canMoveUp: index > 0,
            canMoveDown: index < sidebarApps.length - 1,
        };
    });
    const move = (id: string, delta: -1 | 1) => {
        const index = sidebarApps.findIndex((app) => app.id === id);
        const target = sidebarApps[index + delta];
        const current = sidebarApps[index];
        if (!target || !current) return;
        nav.appPresentationUpdate(id, current.hidden, target.position);
    };
    const contributions =
        nav.contributions.type === "ready"
            ? nav.contributions.value.filter((item) => item.location === "pluginSettings")
            : [];
    return (
        <PluginSettingsPanel
            apps={rows}
            contributions={
                contributions.length > 0 ? (
                    <Box style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                        {contributions.map((contribution) => (
                            <PluginInlineContribution
                                contribution={contribution}
                                key={contribution.id}
                                masks={masks}
                                surface={nav}
                            />
                        ))}
                    </Box>
                ) : undefined
            }
            data-testid="apps-settings"
            onHiddenChange={(id, hidden) => nav.appPresentationUpdate(id, hidden)}
            onMoveDown={(id) => move(id, 1)}
            onMoveUp={(id) => move(id, -1)}
        />
    );
}

/**
 * Opens an app-requested external link only when it is a plain web URL. An
 * untrusted app can ask to open a link, so anything but http/https is refused,
 * and the new context is fully severed from Happy with noopener/noreferrer.
 */
function openExternalLink(url: string): void {
    let parsed: URL;
    try {
        parsed = new URL(url);
    } catch {
        return;
    }
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return;
    window.open(parsed.href, "_blank", "noopener,noreferrer");
}

export { openExternalLink };

/** The stable list of app instances to show in the sidebar for the current viewer. */
export function sidebarAppEntries(apps: readonly PluginAppSummary[]): readonly PluginAppSummary[] {
    return apps
        .filter((app) => app.presentation === "sidebar" && !app.hidden)
        .slice()
        .sort((left, right) => left.position - right.position);
}
