import type { DesktopRoute } from "./desktopRouteTypes";

/** Removes layer combinations that cannot be represented by the canonical desktop URL. */
export function desktopRouteNormalize(route: DesktopRoute): DesktopRoute {
    const conversation = route.primary.kind === "conversation" ? route.primary : undefined;
    const panel = conversation?.chatId ? route.panel : undefined;
    const overlay =
        route.overlay?.kind === "workspace-file" || route.overlay?.kind === "document"
            ? conversation?.chatId && route.overlay.chatId === conversation.chatId
                ? route.overlay
                : undefined
            : route.overlay;
    if (panel === route.panel && overlay === route.overlay) return route;
    return { ...route, panel, overlay };
}
