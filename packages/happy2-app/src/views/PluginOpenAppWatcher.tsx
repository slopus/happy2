import { useLayoutEffect, useRef } from "react";
import type { PluginActionState } from "happy2-state";
import type { DesktopNavigation, DesktopRoute } from "../navigation/desktopRouteTypes";
import { pluginOpenAppNavigate } from "../pluginContributions";

export interface PluginOpenAppWatcherProps {
    navigation: DesktopNavigation;
    route: DesktopRoute;
    /** The transient action states of one contribution surface (nav or chat). */
    actionStates: ReadonlyMap<string, PluginActionState>;
}

/**
 * Routes `openApp` invocation results to the requested existing instance. A
 * contribution invocation that succeeds may carry `openApp`; this watcher opens
 * it exactly once (tracked by action key + generation) in its requested
 * presentation. Navigation from a store change is an imperative side effect, so
 * it runs in a layout effect rather than during render. It renders nothing.
 */
export function PluginOpenAppWatcher(props: PluginOpenAppWatcherProps) {
    const handled = useRef<Set<string>>(new Set());
    useLayoutEffect(() => {
        for (const [key, state] of props.actionStates) {
            if (state.type !== "succeeded") continue;
            const openApp = state.result.openApp;
            if (!openApp) continue;
            const token = `${key}:${state.generation}`;
            if (handled.current.has(token)) continue;
            handled.current.add(token);
            pluginOpenAppNavigate(
                props.navigation,
                props.route,
                openApp.instanceId,
                openApp.presentation,
            );
        }
    });
    return null;
}
