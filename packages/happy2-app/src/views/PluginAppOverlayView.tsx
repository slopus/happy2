import { useLayoutEffect, useReducer, type ReactNode } from "react";
import type {
    HappyState,
    PluginAppHandle,
    PluginAppInstanceSnapshot,
    PluginAppOpenPresentation,
} from "happy2-state";
import {
    Modal,
    ModalOverlay,
    PluginAppOverlay,
    PluginAssetGlyph,
    StoreSurface,
    type McpAppDisplayMode,
} from "happy2-ui";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { usePluginAssetMasks, type PluginAssetMasks } from "../pluginAssets";
import {
    pluginAppOpenTargetResolve,
    pluginOpenAppNavigate,
    type PluginNavigationSurface,
} from "../pluginContributions";
import { openExternalLink } from "../externalLink";

export interface PluginAppOverlayViewProps {
    state: HappyState;
    navigation: DesktopNavigation;
    route: DesktopRoute;
    instanceId: string;
    presentation: "modal" | "fullscreen";
    onClose(): void;
    /** Switches the overlay presentation in place (e.g. a display-mode request). */
    onPresentationChange(presentation: "modal" | "fullscreen"): void;
}

const APP_DISPLAY_MODES: readonly McpAppDisplayMode[] = ["inline", "fullscreen"];

/**
 * Hosts one durable app instance as a route-addressable modal or full-window
 * overlay. It leases the instance handle for its own lifetime and renders through
 * a single coarse subscription; a display mode of `fullscreen` maps to the
 * fullscreen overlay and `inline` collapses back to the modal card.
 */
export function PluginAppOverlayView(props: PluginAppOverlayViewProps) {
    const masks = usePluginAssetMasks(props.state);
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
    if (!handle)
        return (
            <ModalOverlay onDismiss={props.onClose}>
                <Modal onClose={props.onClose} size="medium" title="App">
                    Loading app…
                </Modal>
            </ModalOverlay>
        );
    return (
        <StoreSurface store={props.state.pluginNavigation()}>
            {(nav: PluginNavigationSurface) => {
                const openApp = (instanceKey: string, presentation: PluginAppOpenPresentation) => {
                    const apps = nav.apps.type === "ready" ? nav.apps.value : [];
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
                            renderOverlay(snapshot, handle, masks, props, openApp)
                        }
                    </StoreSurface>
                );
            }}
        </StoreSurface>
    );
}

function renderOverlay(
    snapshot: PluginAppInstanceSnapshot,
    handle: PluginAppHandle,
    masks: PluginAssetMasks,
    props: PluginAppOverlayViewProps,
    onOpenApp: (instanceKey: string, presentation: PluginAppOpenPresentation) => void,
): ReactNode {
    const view = snapshot.view;
    const displayMode: McpAppDisplayMode =
        props.presentation === "fullscreen" ? "fullscreen" : "inline";
    const requestMode = (mode: McpAppDisplayMode): McpAppDisplayMode => {
        if (mode === "fullscreen") {
            props.onPresentationChange("fullscreen");
            return "fullscreen";
        }
        props.onPresentationChange("modal");
        return "inline";
    };
    if (view.type === "error")
        return (
            <PluginAppOverlay
                error={view.error.message}
                onClose={props.onClose}
                onReload={() => handle.pluginAppReload()}
                presentation={props.presentation}
                status="error"
                title="App"
            />
        );
    if (view.type !== "ready")
        return (
            <PluginAppOverlay
                onClose={props.onClose}
                presentation={props.presentation}
                status="loading"
                title="App"
            />
        );
    const { app, resource, hostContext } = view.value;
    return (
        <PluginAppOverlay
            availableDisplayModes={APP_DISPLAY_MODES}
            description={app.description}
            displayMode={displayMode}
            glyph={
                <PluginAssetGlyph
                    maskUrl={masks.maskUrl(app.installationId, app.assetId)}
                    size={24}
                />
            }
            hostContext={hostContext}
            onClose={props.onClose}
            onOpenApp={onOpenApp}
            onOpenLink={openExternalLink}
            onReload={() => handle.pluginAppReload()}
            onRequestDisplayMode={requestMode}
            onResourceRead={(uri) => handle.pluginAppResourceRead(uri)}
            onToolCall={(name, args) => handle.pluginAppToolCall(name, args)}
            presentation={props.presentation}
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
