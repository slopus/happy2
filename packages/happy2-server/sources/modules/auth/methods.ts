import type { ServerConfig } from "../config/type.js";

export interface SupportedAuthMethods {
    role: ServerConfig["server"]["role"];
    method: "password" | "magic_link" | "oidc" | "cloudflare_access" | null;
    signupEnabled?: boolean;
    oidcProvider?: string;
}

/** Returns the one mechanism this deployment can issue, not merely configured mechanisms. */
export function supportedAuthMethods(config: ServerConfig): SupportedAuthMethods {
    if (config.server.role === "api") return { role: config.server.role, method: null };
    if (config.auth.password.enabled) {
        return {
            role: config.server.role,
            method: "password",
            signupEnabled: config.auth.password.signupEnabled,
        };
    }
    if (config.auth.magicLink.enabled) return { role: config.server.role, method: "magic_link" };
    if (config.auth.cloudflareAccess.enabled)
        return { role: config.server.role, method: "cloudflare_access" };
    const [provider] = config.auth.oidc.keys();
    return provider
        ? { role: config.server.role, method: "oidc", oidcProvider: provider }
        : { role: config.server.role, method: null };
}
