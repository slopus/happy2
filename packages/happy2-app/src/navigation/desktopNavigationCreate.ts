import { desktopRouteFormat } from "./desktopRouteFormat";
import { desktopRouteNormalize } from "./desktopRouteNormalize";
import { desktopRouteParse } from "./desktopRouteParse";
import type {
    DesktopNavigation,
    DesktopNavigateOptions,
    DesktopRoute,
    DesktopRouteLayer,
} from "./desktopRouteTypes";

interface NavigationHost {
    readonly location: Location;
    readonly history: History;
    addEventListener(type: "popstate", listener: () => void): void;
    removeEventListener(type: "popstate", listener: () => void): void;
}

interface NavigationEntryState {
    readonly happy2Navigation: 1;
    readonly layer?: DesktopRouteLayer;
    readonly parentUrl?: string;
    readonly parentState?: NavigationEntryState;
}

interface QueuedNavigationWrite {
    readonly next: DesktopRoute;
    readonly options: DesktopNavigateOptions;
    readonly resetEntryState: boolean;
}

const transientUrlDelayMs = 500;

/** Owns canonical URL writes and popstate reconciliation without coupling routes to product state. */
export function desktopNavigationCreate(host: NavigationHost = window): DesktopNavigation {
    let route = desktopRouteParse(host.location.href);
    const listeners = new Set<(route: DesktopRoute) => void>();
    let disposed = false;
    let pendingTraversal = false;
    let queuedWrite: QueuedNavigationWrite | undefined;
    let transientUrlTimer: ReturnType<typeof setTimeout> | undefined;

    const notify = () => {
        for (const listener of listeners) listener(route);
    };
    const cancelTransientUrlWrite = () => {
        if (transientUrlTimer === undefined) return;
        clearTimeout(transientUrlTimer);
        transientUrlTimer = undefined;
    };
    const publish = () => {
        cancelTransientUrlWrite();
        route = desktopRouteParse(host.location.href);
        pendingTraversal = false;
        notify();
        const queued = queuedWrite;
        queuedWrite = undefined;
        if (!queued) return;
        write(
            queued.next,
            rebaseQueuedOptions(route, queued.next, queued.options),
            queued.resetEntryState,
        );
    };
    host.addEventListener("popstate", publish);

    function write(
        next: DesktopRoute,
        options: DesktopNavigateOptions = {},
        resetEntryState = false,
    ) {
        if (disposed) return;
        next = desktopRouteNormalize(next);
        if (pendingTraversal) {
            queuedWrite = { next, options, resetEntryState };
            return;
        }
        cancelTransientUrlWrite();
        const currentState = entryState(host.history.state);
        const state: NavigationEntryState = options.replace
            ? resetEntryState
                ? { happy2Navigation: 1 }
                : (currentState ?? { happy2Navigation: 1 })
            : {
                  happy2Navigation: 1,
                  ...(options.layer
                      ? {
                            layer: options.layer,
                            parentUrl: host.location.href,
                            ...(currentState ? { parentState: currentState } : {}),
                        }
                      : {}),
              };
        const url = navigationUrl(host.location, desktopRouteFormat(next));
        if (options.replace && options.transient) {
            transientUrlTimer = setTimeout(() => {
                transientUrlTimer = undefined;
                if (!disposed && !pendingTraversal) host.history.replaceState(state, "", url);
            }, transientUrlDelayMs);
        } else if (options.replace) host.history.replaceState(state, "", url);
        else host.history.pushState(state, "", url);
        route = next;
        notify();
    }

    function close(layer: DesktopRouteLayer) {
        if (disposed || pendingTraversal) return;
        cancelTransientUrlWrite();
        const state = entryState(host.history.state);
        const distance = layerDistance(state, layer);
        if (distance) {
            pendingTraversal = true;
            host.history.go(-distance);
            return;
        }
        const closesDependentOverlay = layer === "panel" && route.panel && route.overlay;
        write(
            {
                ...route,
                ...(layer === "panel"
                    ? {
                          panel: undefined,
                          ...(closesDependentOverlay ? { overlay: undefined } : {}),
                      }
                    : { overlay: undefined }),
            },
            { replace: true },
            Boolean(closesDependentOverlay),
        );
    }

    return {
        get: () => route,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        navigate: write,
        close,
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            cancelTransientUrlWrite();
            queuedWrite = undefined;
            host.removeEventListener("popstate", publish);
            listeners.clear();
        },
    };
}

function rebaseQueuedOptions(
    current: DesktopRoute,
    next: DesktopRoute,
    options: DesktopNavigateOptions,
): DesktopNavigateOptions {
    if (!options.replace) return options;
    if (next.panel && !current.panel) return { layer: "panel" };
    if (next.overlay && !current.overlay) return { layer: "overlay" };
    return options;
}

function navigationUrl(location: Location, logical: string): string {
    if (location.protocol === "file:") {
        const url = new URL(location.href);
        url.hash = logical;
        return url.toString();
    }
    const url = new URL(logical, location.origin);
    const current = new URL(location.href);
    if (current.searchParams.has("desktop")) url.searchParams.set("desktop", "1");
    return `${url.pathname}${url.search}${url.hash}`;
}

function entryState(value: unknown): NavigationEntryState | undefined {
    if (!value || typeof value !== "object") return undefined;
    const candidate = value as Partial<NavigationEntryState>;
    return candidate.happy2Navigation === 1 ? (candidate as NavigationEntryState) : undefined;
}

function layerDistance(
    state: NavigationEntryState | undefined,
    layer: DesktopRouteLayer,
): number | undefined {
    let current = state;
    let distance = 1;
    while (current?.layer) {
        if (current.layer === layer && current.parentUrl) return distance;
        current = current.parentState;
        distance += 1;
    }
    return undefined;
}
