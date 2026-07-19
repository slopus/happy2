import type { ServerConfig } from "../config/type.js";

export interface SupportedAuthMethods {
    role: ServerConfig["server"]["role"];
    method: "password" | "magic_link" | "oidc" | "cloudflare_access" | null;
    devTokensEnabled: boolean;
    oidcProvider?: string;
}

/** Returns the one mechanism this deployment can issue, not merely configured mechanisms. */
export function supportedAuthMethods(config: ServerConfig): SupportedAuthMethods {
    const base = {
        role: config.server.role,
        devTokensEnabled: config.server.role !== "api" && config.auth.devTokens.enabled,
    };
    if (config.server.role === "api") return { ...base, method: null };
    if (config.auth.password.enabled) {
        return { ...base, method: "password" };
    }
    if (config.auth.magicLink.enabled) return { ...base, method: "magic_link" };
    if (config.auth.cloudflareAccess.enabled) return { ...base, method: "cloudflare_access" };
    const [provider] = config.auth.oidc.keys();
    return provider
        ? { ...base, method: "oidc", oidcProvider: provider }
        : { ...base, method: null };
}
