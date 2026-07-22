import type { DesktopStartupValues } from "happy2-app";
import type { DesktopStartRequest } from "./shared/desktopContract";

/**
 * Projects an in-flight or failed start request back to the startup form's two
 * durable modes so the starting and error screens show what the runtime is
 * attempting. The new two-mode runtime keeps no remembered form draft — the
 * chooser starts fresh and saved topologies surface through the instance
 * switcher — so this derives values only from a concrete request. Local carries
 * no fields; the cloud origin round-trips through `cloudUrl`.
 */
export function desktopStartupValues(request?: DesktopStartRequest): DesktopStartupValues {
    return request?.mode === "cloud"
        ? { mode: "cloud", cloudUrl: request.serverUrl }
        : { mode: "local", cloudUrl: "" };
}

/**
 * Projects the chooser's closed two-mode value tree to the runtime start
 * request the desktop main process validates. Local sends no fields; cloud sends
 * the typed HTTPS origin as `serverUrl`. This deliberately does not re-check the
 * origin: the desktop main validator owns every protocol, credential, and path
 * rule, so this boundary never duplicates that security authority.
 */
export function desktopStartRequestFromValues(values: DesktopStartupValues): DesktopStartRequest {
    return values.mode === "local"
        ? { mode: "local" }
        : { mode: "cloud", serverUrl: values.cloudUrl };
}
