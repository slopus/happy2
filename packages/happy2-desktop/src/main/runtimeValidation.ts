import type {
    DesktopActiveTarget,
    DesktopStartRequest,
    DesktopTopology,
    DesktopTopologyTarget,
} from "../shared/desktopContract";

export function desktopStartRequestValidate(request: unknown): DesktopStartRequest {
    if (!request || typeof request !== "object" || Array.isArray(request))
        throw new Error("Choose a desktop mode.");
    const value = request as Record<string, unknown>;
    if (value.mode === "local" && hasOnlyKeys(value, ["mode"])) return { mode: "local" };
    if (
        value.mode === "cloud" &&
        typeof value.serverUrl === "string" &&
        hasOnlyKeys(value, ["mode", "serverUrl"])
    )
        return { mode: "cloud", serverUrl: remoteEndpointNormalize(value.serverUrl) };
    throw new Error("Choose a desktop mode.");
}

export function desktopTopologyFromRequest(
    id: string,
    request: DesktopStartRequest,
): DesktopTopology {
    if (!desktopTopologyIdValid(id)) throw new Error("The desktop topology identity is invalid.");
    return request.mode === "local"
        ? { id, mode: "local" }
        : { id, mode: "cloud", serverUrl: request.serverUrl };
}

export function desktopTopologyRequest(topology: DesktopTopology): DesktopStartRequest {
    return topology.mode === "local"
        ? { mode: "local" }
        : { mode: "cloud", serverUrl: topology.serverUrl };
}

export function desktopTopologyTarget(topology: DesktopTopology): DesktopTopologyTarget {
    if (topology.mode === "local")
        return {
            detail: `System Rig · ${topology.id.slice(-6)}`,
            id: topology.id,
            kind: "local",
            label: "This Mac",
            mode: "local",
        };
    const url = new URL(topology.serverUrl);
    return {
        detail: "Cloud workspace",
        id: topology.id,
        kind: "remote",
        label: url.hostname,
        mode: "cloud",
    };
}

export function desktopActiveTarget(
    topology: DesktopTopology,
    rigVersion?: string,
): DesktopActiveTarget {
    const target = desktopTopologyTarget(topology);
    if (topology.mode === "local") {
        if (!rigVersion) throw new Error("The local Rig version is unavailable.");
        return { ...target, authentication: "rig", mode: "local", rigVersion };
    }
    return {
        ...target,
        authentication: "account",
        mode: "cloud",
        serverUrl: topology.serverUrl,
    };
}

export function desktopTopologyIdValidate(value: unknown): string {
    if (desktopTopologyIdValid(value)) return value;
    throw new Error("The desktop topology identity is invalid.");
}

export function desktopTopologyIdValid(value: unknown): value is string {
    return typeof value === "string" && /^top_[a-f0-9]{32}$/u.test(value);
}

export function remoteEndpointNormalize(value: string): string {
    let url: URL;
    try {
        url = new URL(value.trim());
    } catch {
        throw new Error("Enter a valid HTTPS Happy endpoint.");
    }
    if (url.protocol !== "https:") throw new Error("Cloud Happy endpoints must use HTTPS.");
    if (url.username || url.password || url.search || url.hash)
        throw new Error("The cloud endpoint must be an HTTPS origin without credentials or query.");
    if (url.pathname !== "/")
        throw new Error("The cloud endpoint must be an HTTPS origin without a path.");
    return url.origin;
}

function hasOnlyKeys(value: object, keys: readonly string[]): boolean {
    return Object.keys(value).every((key) => keys.includes(key));
}
