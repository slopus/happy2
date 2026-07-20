import type {
    PluginActionState,
    PluginAppOpenPresentation,
    PluginAppSummary,
    PluginMenuState,
    PluginNavigationStore,
    PluginPresentationState,
} from "happy2-state";

/**
 * The full navigation store state (snapshot + intent methods). The state package
 * exports the store but not its state interface by name, so it is recovered from
 * the store's `getState` return type.
 */
export type PluginNavigationSurface = ReturnType<PluginNavigationStore["getState"]>;
import type { PluginContributionActionState, PluginContributionMenuState } from "happy2-ui";
import type {
    DesktopAppOverlayPresentation,
    DesktopNavigation,
    DesktopRoute,
} from "./navigation/desktopRouteTypes";

/*
 * The plugin navigation/chat contribution stores expose their transient state as
 * ReadonlyMaps keyed by a NUL-joined natural key. That key format is part of the
 * public snapshot contract (the maps are otherwise unusable), so it is mirrored
 * here exactly rather than reaching into the state module. Keep in sync with
 * `pluginSurfacesState.ts` `actionKey` / `menuKey`.
 */
export function pluginActionStateKey(
    contributionId: string,
    actionId: string,
    messageId?: string,
): string {
    return `${contributionId}\u0000${actionId}\u0000${messageId ?? ""}`;
}

export function pluginMenuStateKey(contributionId: string, messageId?: string): string {
    return `${contributionId}\u0000${messageId ?? ""}`;
}

/** Projects the durable action state onto the slim pending/error UI contract. */
export function pluginActionUiState(
    state: PluginActionState | undefined,
): PluginContributionActionState | undefined {
    if (!state) return undefined;
    if (state.type === "running") return { type: "running" };
    if (state.type === "error") return { type: "error", message: state.error.message };
    return undefined;
}

/** Projects the durable menu state onto the slim loading/ready/error UI contract. */
export function pluginMenuUiState(
    state: PluginMenuState | undefined,
): PluginContributionMenuState | undefined {
    if (!state) return undefined;
    if (state.type === "loading") return { type: "loading" };
    if (state.type === "ready") return { type: "ready", items: state.items };
    return { type: "error", message: state.error.message };
}

/** Projects a per-user presentation update onto simple busy/error feedback. */
export function pluginPresentationUiState(state: PluginPresentationState | undefined): {
    busy: boolean;
    error?: string;
} {
    if (!state) return { busy: false };
    if (state.type === "saving") return { busy: true };
    return { busy: false, error: state.error.message };
}

function overlayPresentation(
    presentation: PluginAppOpenPresentation,
): DesktopAppOverlayPresentation {
    return presentation === "fullscreen" ? "fullscreen" : "modal";
}

/**
 * Resolves a browser-supplied `happy2/app-open` instance key to a durable
 * instance id, but ONLY to another visible instance owned by the same
 * installation and plugin as the currently mounted app. The instance key is
 * plugin-controlled and shared across installations, so a global match would let
 * one installation's app open a different installation's instance; scoping to the
 * mounted app's `installationId` + `pluginId` prevents that cross-installation
 * pivot. Returns undefined when nothing safe matches.
 */
export function pluginAppOpenTargetResolve(
    apps: readonly PluginAppSummary[],
    currentInstanceId: string,
    instanceKey: string,
): string | undefined {
    const current = apps.find((app) => app.id === currentInstanceId);
    if (!current) return undefined;
    const match = apps.find(
        (app) =>
            app.instanceKey === instanceKey &&
            app.installationId === current.installationId &&
            app.pluginId === current.pluginId,
    );
    return match?.id;
}

/**
 * Routes an `openApp` invocation result to the requested existing instance in its
 * presentation: `primary` swaps the workspace app page, `modal`/`fullscreen` open
 * the durable app overlay. There is no transient second app-session model.
 */
export function pluginOpenAppNavigate(
    navigation: DesktopNavigation,
    route: DesktopRoute,
    instanceId: string,
    presentation: PluginAppOpenPresentation,
): void {
    if (presentation === "primary") {
        navigation.navigate({
            ...route,
            primary: { kind: "apps", appId: instanceId },
            panel: undefined,
            overlay: undefined,
        });
        return;
    }
    navigation.navigate({
        ...route,
        overlay: { kind: "app", instanceId, presentation: overlayPresentation(presentation) },
    });
}
