import type {
    DesktopAdminSection,
    DesktopFileFilter,
    DesktopOnboardingStep,
    DesktopOverlayRoute,
    DesktopPanelRoute,
    DesktopPrimaryRoute,
    DesktopRoute,
    DesktopSettingsSection,
} from "./desktopRouteTypes";

const adminSections = new Set<DesktopAdminSection>([
    "users",
    "reports",
    "automations",
    "integrations",
    "images",
    "secrets",
]);
const settingsSections = new Set<DesktopSettingsSection>([
    "profile",
    "notifications",
    "account",
    "appearance",
]);
const onboardingSteps = new Set<DesktopOnboardingStep>([
    "bootstrap-account",
    "sign-in",
    "profile",
    "sandbox-provider",
    "base-image",
    "build-progress",
    "completion",
    "waiting",
]);
const fileFilters = new Set<DesktopFileFilter>(["all", "photo", "video", "gif", "file"]);

/** Parses one hosted or file-protocol URL into the complete safe desktop navigation state. */
export function desktopRouteParse(input: string | URL): DesktopRoute {
    const hostUrl = typeof input === "string" ? new URL(input, "https://happy.invalid") : input;
    const routeUrl = hostUrl.hash.startsWith("#/")
        ? new URL(hostUrl.hash.slice(1), "https://happy.invalid")
        : hostUrl;
    const segments = routeUrl.pathname.split("/").filter(Boolean).map(decodeSegment);
    const primary = primaryParse(segments);
    const pathPanel = panelParse(primary, segments);
    const pathOverlay = filePathOverlay(primary, segments);
    const queryPanel = panelQueryParse(primary, routeUrl.searchParams);
    const queryOverlay = overlayQueryParse(primary, routeUrl.searchParams);
    const filterValue =
        primary.kind === "files"
            ? (routeUrl.searchParams.get("filter") as DesktopFileFilter | null)
            : null;
    return {
        primary,
        panel: pathPanel ?? queryPanel,
        overlay: queryOverlay ?? pathOverlay,
        files: {
            filter: filterValue && fileFilters.has(filterValue) ? filterValue : "all",
            query: primary.kind === "files" ? (routeUrl.searchParams.get("filesQuery") ?? "") : "",
        },
    };
}

function primaryParse(segments: string[]): DesktopPrimaryRoute {
    const [head, value] = segments;
    if (head === "home") return { kind: "home" };
    if (head === "activity") return { kind: "activity" };
    if (head === "threads") return { kind: "threads" };
    if (head === "calls") return { kind: "calls" };
    if (head === "files") return { kind: "files" };
    if (head === "settings")
        return {
            kind: "settings",
            section: settingsSections.has(value as DesktopSettingsSection)
                ? (value as DesktopSettingsSection)
                : "profile",
        };
    if (head === "admin")
        return {
            kind: "admin",
            section: adminSections.has(value as DesktopAdminSection)
                ? (value as DesktopAdminSection)
                : "users",
        };
    if (head === "onboarding")
        return {
            kind: "onboarding",
            step: onboardingSteps.has(value as DesktopOnboardingStep)
                ? (value as DesktopOnboardingStep)
                : "bootstrap-account",
        };
    if (head === "channels")
        return { kind: "conversation", conversationKind: "channel", chatId: value || undefined };
    return {
        kind: "conversation",
        conversationKind: "chat",
        chatId: head === "chats" ? value || undefined : undefined,
    };
}

function panelParse(
    primary: DesktopPrimaryRoute,
    segments: string[],
): DesktopPanelRoute | undefined {
    if (primary.kind !== "conversation" || !primary.chatId) return undefined;
    const kind = segments[2];
    const id = segments[3];
    if (kind === "thread" && id) return { kind: "thread", rootMessageId: id };
    if (kind === "profile" && id) return { kind: "profile", userId: id };
    return undefined;
}

function panelQueryParse(
    primary: DesktopPrimaryRoute,
    search: URLSearchParams,
): DesktopPanelRoute | undefined {
    if (primary.kind !== "conversation" || !primary.chatId) return undefined;
    const inspector = search.get("inspector");
    if (inspector === "info") return { kind: "info" };
    if (inspector === "workspace") return { kind: "workspace" };
    return undefined;
}

function filePathOverlay(
    primary: DesktopPrimaryRoute,
    segments: string[],
): DesktopOverlayRoute | undefined {
    return primary.kind === "files" && segments[1]
        ? { kind: "file", fileId: segments[1] }
        : undefined;
}

function overlayQueryParse(
    primary: DesktopPrimaryRoute,
    search: URLSearchParams,
): DesktopOverlayRoute | undefined {
    const kind = search.get("overlay");
    if (kind === "search") return { kind: "search", query: search.get("q") ?? "" };
    if (kind === "profile" && search.get("profile"))
        return { kind: "profile", userId: search.get("profile")! };
    if (kind === "file" && search.get("file")) return { kind: "file", fileId: search.get("file")! };
    if (
        kind === "workspace-file" &&
        primary.kind === "conversation" &&
        primary.chatId &&
        search.get("path")
    )
        return { kind: "workspace-file", chatId: primary.chatId, path: search.get("path")! };
    return undefined;
}

function decodeSegment(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return "";
    }
}
