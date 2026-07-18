import { useRouterState } from "@tanstack/react-router";
import { desktopRouteParse } from "./desktopRouteParse";
import type { DesktopNavigation, DesktopRoute } from "./desktopRouteTypes";

/** Selects and parses the active location directly from TanStack Router. */
export function useDesktopNavigation(navigation: DesktopNavigation): DesktopRoute {
    const href = useRouterState({
        router: navigation.router,
        select: (state) => state.location.href,
    });
    return desktopRouteParse(href);
}
