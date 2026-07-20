import type { DesktopPrimaryRoute, DesktopRoute } from "./desktopRouteTypes";
import { desktopRouteNormalize } from "./desktopRouteNormalize";

/** Formats one desktop route as its canonical hosted-server logical path and query. */
export function desktopRouteFormat(route: DesktopRoute): string {
    route = desktopRouteNormalize(route);
    const search = new URLSearchParams();
    let path = primaryPath(route.primary);
    if (route.panel && route.primary.kind === "conversation" && route.primary.chatId) {
        if (route.panel.kind === "thread")
            path += `/thread/${encodeURIComponent(route.panel.rootMessageId)}`;
        else if (route.panel.kind === "trace")
            path += `/trace/${encodeURIComponent(route.panel.messageId)}`;
        else if (route.panel.kind === "profile")
            path += `/profile/${encodeURIComponent(route.panel.userId)}`;
        else search.set("inspector", route.panel.kind);
    }
    const overlay = route.overlay;
    if (overlay?.kind === "file" && route.primary.kind === "files")
        path += `/${encodeURIComponent(overlay.fileId)}`;
    else if (overlay) {
        search.set("overlay", overlay.kind);
        if (overlay.kind === "search") search.set("q", overlay.query);
        else if (overlay.kind === "profile") search.set("profile", overlay.userId);
        else if (overlay.kind === "file") search.set("file", overlay.fileId);
        else if (overlay.kind === "workspace-file") search.set("path", overlay.path);
        else if (overlay.kind === "document") search.set("document", overlay.documentId);
    }
    if (route.primary.kind === "files") {
        if (route.files.filter !== "all") search.set("filter", route.files.filter);
        if (route.files.query) search.set("filesQuery", route.files.query);
    }
    const query = search.toString();
    return query ? `${path}?${query}` : path;
}

function primaryPath(primary: DesktopPrimaryRoute): string {
    switch (primary.kind) {
        case "conversation": {
            const base = primary.conversationKind === "channel" ? "/channels" : "/chats";
            return primary.chatId ? `${base}/${encodeURIComponent(primary.chatId)}` : base;
        }
        case "settings":
            return `/settings/${primary.section}`;
        case "admin":
            return `/admin/${primary.section}`;
        case "onboarding":
            return `/onboarding/${primary.step}`;
        default:
            return `/${primary.kind}`;
    }
}
