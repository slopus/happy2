import type { DesktopRuntimeSnapshot } from "../shared/desktopContract";

/** Allows only the packaged renderer document, or the configured development origin. */
export function rendererNavigationAllowed(
    candidateValue: string,
    rendererValue: string,
    development: boolean,
): boolean {
    try {
        const candidate = new URL(candidateValue);
        const renderer = new URL(rendererValue);
        if (development) return candidate.origin === renderer.origin;
        return (
            candidate.protocol === "file:" &&
            candidate.host === renderer.host &&
            candidate.pathname === renderer.pathname &&
            candidate.search === renderer.search
        );
    } catch {
        return false;
    }
}

export type DesktopWindowTarget =
    | { key: "local"; kind: "local" }
    | { key: `cloud:${number}`; kind: "cloud"; url: string };

/**
 * Chooses the trusted renderer boundary for one runtime snapshot. Cloud targets
 * load their own web bundle so authentication cookies, SSE, and WebSockets stay
 * same-origin; every transitional and local state remains in the bundled shell.
 */
export function desktopWindowTarget(snapshot: DesktopRuntimeSnapshot): DesktopWindowTarget {
    if (snapshot.phase !== "ready" || snapshot.activeTarget.mode === "local")
        return { key: "local", kind: "local" };
    const url = new URL(snapshot.activeTarget.serverUrl);
    url.searchParams.set("desktop", "1");
    return {
        key: `cloud:${snapshot.connectionId}`,
        kind: "cloud",
        url: url.toString(),
    };
}

/** Remote Happy and its Cloudflare/identity-provider redirects must remain HTTPS. */
export function remoteNavigationAllowed(candidateValue: string): boolean {
    try {
        return new URL(candidateValue).protocol === "https:";
    } catch {
        return false;
    }
}
