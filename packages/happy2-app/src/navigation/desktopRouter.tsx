import {
    createBrowserHistory,
    createHashHistory,
    createMemoryHistory,
    createRoute,
    createRootRouteWithContext,
    createRouter,
    Outlet,
    type RouterHistory,
} from "@tanstack/react-router";
import type { ReactNode } from "react";

interface DesktopRouterContext {
    content: ReactNode;
}

function DesktopRouterRoot() {
    return <Outlet />;
}

function DesktopRouterContent() {
    return rootRoute.useRouteContext().content;
}

const rootRoute = createRootRouteWithContext<DesktopRouterContext>()({
    component: DesktopRouterRoot,
});

const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "/",
    component: DesktopRouterContent,
});

const desktopRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: "$",
    component: DesktopRouterContent,
});

const routeTree = rootRoute.addChildren([indexRoute, desktopRoute]);

/** Creates the one TanStack Router that owns a desktop window's location lifetime. */
export function desktopRouterCreate(history: RouterHistory = defaultHistory()) {
    const router = createRouter({
        context: { content: null },
        defaultPreload: false,
        history,
        routeTree,
        scrollRestoration: () => false,
        scrollToTopSelectors: [],
    });
    void router.load();
    return router;
}

/** Creates deterministic router history for app and navigation tests. */
export function desktopMemoryHistoryCreate(initialEntry = "/chats"): RouterHistory {
    return createMemoryHistory({ initialEntries: [initialEntry] });
}

function defaultHistory(): RouterHistory {
    if (typeof window === "undefined") return desktopMemoryHistoryCreate();
    return window.location.protocol === "file:" ? createHashHistory() : createBrowserHistory();
}

export type DesktopRouter = ReturnType<typeof desktopRouterCreate>;
