import { desktopRouteFormat } from "./desktopRouteFormat";
import { desktopRouteNormalize } from "./desktopRouteNormalize";
import { desktopRouteParse } from "./desktopRouteParse";
import { desktopRouterCreate, type DesktopRouter } from "./desktopRouter";
import type {
    DesktopNavigation,
    DesktopNavigateOptions,
    DesktopRoute,
    DesktopRouteLayer,
} from "./desktopRouteTypes";

/** Adapts the product's closed route model to its owning TanStack Router. */
export function desktopNavigationCreate(
    router: DesktopRouter = desktopRouterCreate(),
): DesktopNavigation {
    let disposed = false;

    function current(): DesktopRoute {
        return desktopRouteParse(router.state.location.href);
    }

    function navigate(next: DesktopRoute, options: DesktopNavigateOptions = {}): void {
        if (disposed) return;
        const route = desktopRouteNormalize(next);
        void router.navigate({
            href: desktopRouteFormat(route),
            replace: options.replace,
        });
    }

    function close(layer: DesktopRouteLayer): void {
        if (disposed) return;
        const route = current();
        const closesDependentOverlay = layer === "panel" && route.panel && route.overlay;
        navigate(
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
        );
    }

    return {
        router,
        get: current,
        subscribe(listener) {
            return router.subscribe("onResolved", () => listener(current()));
        },
        navigate,
        close,
        [Symbol.dispose]() {
            if (disposed) return;
            disposed = true;
            router.history.destroy();
        },
    };
}
