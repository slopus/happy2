import { readFile } from "node:fs/promises";
import { parse } from "smol-toml";
import type { OidcProviderConfig, ServerConfig, ServerRole } from "./type.js";

export type { ServerConfig } from "./type.js";

type Table = Record<string, unknown>;

function table(value: unknown, path: string): Table {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error(`${path} must be a TOML table`);
    return value as Table;
}

function string(value: unknown, path: string, optional = false): string | undefined {
    if (value === undefined && optional) return undefined;
    if (typeof value !== "string" || value.length === 0)
        throw new Error(`${path} must be a non-empty string`);
    return value;
}

function boolean(value: unknown, path: string, fallback = false): boolean {
    if (value === undefined) return fallback;
    if (typeof value !== "boolean") throw new Error(`${path} must be true or false`);
    return value;
}

function integer(value: unknown, path: string, fallback?: number): number {
    if (value === undefined && fallback !== undefined) return fallback;
    if (typeof value !== "number" || !Number.isInteger(value))
        throw new Error(`${path} must be an integer`);
    return value;
}

export function parseConfig(input: string): ServerConfig {
    const root = table(parse(input), "config");
    const server = table(root.server, "server");
    const role = string(server.role, "server.role") as ServerRole;
    if (!(["all", "auth", "api"] as const).includes(role))
        throw new Error("server.role must be all, auth, or api");
    const publicUrl = string(server.public_url, "server.public_url")!;
    new URL(publicUrl);
    const trustedProxyHops = integer(server.trusted_proxy_hops, "server.trusted_proxy_hops", 0);
    if (trustedProxyHops < 0) throw new Error("server.trusted_proxy_hops cannot be negative");

    const database = table(root.database, "database");
    const jwt = table(root.jwt, "jwt");
    const expiryDays = integer(jwt.expiry_days, "jwt.expiry_days", 30);
    if (expiryDays < 1 || expiryDays > 90)
        throw new Error("jwt.expiry_days must be between 1 and 90");
    const privateKeyPath = string(jwt.private_key_path, "jwt.private_key_path", true);
    const publicKeyPath = string(jwt.public_key_path, "jwt.public_key_path", true);

    const auth = table(root.auth ?? {}, "auth");
    const password = table(auth.password ?? {}, "auth.password");
    const magicLink = table(auth.magic_link ?? {}, "auth.magic_link");
    const oidc = new Map<string, OidcProviderConfig>();
    for (const [id, value] of Object.entries(table(auth.oidc ?? {}, "auth.oidc"))) {
        const provider = table(value, `auth.oidc.${id}`);
        if (!boolean(provider.enabled, `auth.oidc.${id}.enabled`)) continue;
        const scopes = provider.scopes ?? ["openid", "email", "profile"];
        if (!Array.isArray(scopes) || !scopes.every((scope) => typeof scope === "string"))
            throw new Error(`auth.oidc.${id}.scopes must be string array`);
        const redirectPath = string(provider.redirect_path, `auth.oidc.${id}.redirect_path`)!;
        if (!redirectPath.startsWith("/v0/auth/oidc/"))
            throw new Error(`auth.oidc.${id}.redirect_path must be a /v0 auth route`);
        oidc.set(id, {
            id,
            discoveryUrl: string(provider.discovery_url, `auth.oidc.${id}.discovery_url`)!,
            clientId: string(provider.client_id, `auth.oidc.${id}.client_id`)!,
            clientSecretEnv: string(
                provider.client_secret_env,
                `auth.oidc.${id}.client_secret_env`,
            )!,
            scopes: [...scopes],
            redirectPath,
        });
    }

    const magicEnabled = boolean(magicLink.enabled, "auth.magic_link.enabled");
    const magicRedirectUrl = string(magicLink.redirect_url, "auth.magic_link.redirect_url", true);
    if (magicEnabled && !magicRedirectUrl)
        throw new Error("auth.magic_link.redirect_url is required when magic links are enabled");
    return {
        server: {
            role,
            host: string(server.host, "server.host")!,
            port: integer(server.port, "server.port"),
            publicUrl: publicUrl.replace(/\/$/, ""),
            trustedProxyHops,
        },
        database: {
            url: string(database.url, "database.url")!,
            authTokenEnv: string(database.auth_token_env, "database.auth_token_env", true),
        },
        jwt: {
            issuer: string(jwt.issuer, "jwt.issuer")!,
            audience: string(jwt.audience, "jwt.audience")!,
            keyId: string(jwt.key_id, "jwt.key_id")!,
            privateKeyPath,
            publicKeyPath,
            expiryDays,
        },
        auth: {
            password: {
                enabled: boolean(password.enabled, "auth.password.enabled"),
                signupEnabled: boolean(password.signup_enabled, "auth.password.signup_enabled"),
            },
            magicLink: {
                enabled: magicEnabled,
                from: string(magicLink.from, "auth.magic_link.from", true),
                redirectUrl: magicRedirectUrl,
            },
            oidc,
        },
    };
}

export async function loadConfig(path: string): Promise<ServerConfig> {
    return parseConfig(await readFile(path, "utf8"));
}
