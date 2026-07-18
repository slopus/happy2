import { createSignal, onCleanup, type Accessor } from "solid-js";
import type { DesktopNavigation, DesktopRoute } from "./desktopRouteTypes";

/** Adapts the plain desktop navigation subscription to one owner-scoped Solid accessor. */
export function desktopNavigationSignal(navigation: DesktopNavigation): Accessor<DesktopRoute> {
    const [route, setRoute] = createSignal(navigation.get());
    const unsubscribe = navigation.subscribe(setRoute);
    onCleanup(unsubscribe);
    return route;
}
