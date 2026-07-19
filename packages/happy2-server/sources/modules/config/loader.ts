import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { parse } from "smol-toml";
import { bundledRigCommand } from "../agents/command.js";
import { localRuntimePaths } from "./paths.js";
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

function strings(value: unknown, path: string, fallback: string[] = []): string[] {
    if (value === undefined) return fallback;
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
        throw new Error(`${path} must be a string array`);
    return [...value];
}

export function parseConfig(input: string): ServerConfig {
    const paths = localRuntimePaths();
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
    const agents = table(root.agents ?? {}, "agents");
    const files = table(root.files ?? {}, "files");
    const plugins = table(root.plugins ?? {}, "plugins");
    const pluginHostApiPort = boundedPositiveInteger(
        plugins.host_api_port,
        "plugins.host_api_port",
        3001,
        65_535,
    );
    if (pluginHostApiPort === integer(server.port, "server.port"))
        throw new Error("plugins.host_api_port must differ from server.port");
    const fileProvider = string(files.provider, "files.provider", true) ?? "local";
    if (fileProvider !== "local")
        throw new Error("files.provider must be local in this server build");
    const signedUrlExpirySeconds = integer(
        files.signed_url_expiry_seconds,
        "files.signed_url_expiry_seconds",
        300,
    );
    if (signedUrlExpirySeconds < 1 || signedUrlExpirySeconds > 3600)
        throw new Error("files.signed_url_expiry_seconds must be between 1 and 3600");
    const maxUploadBytes = integer(
        files.max_upload_bytes,
        "files.max_upload_bytes",
        512 * 1024 * 1024,
    );
    if (maxUploadBytes < 1024 || maxUploadBytes > 2 * 1024 * 1024 * 1024)
        throw new Error("files.max_upload_bytes must be between 1 KiB and 2 GiB");
    const resumableChunkBytes = integer(
        files.resumable_chunk_bytes,
        "files.resumable_chunk_bytes",
        8 * 1024 * 1024,
    );
    if (resumableChunkBytes < 64 * 1024 || resumableChunkBytes > 64 * 1024 * 1024)
        throw new Error("files.resumable_chunk_bytes must be between 64 KiB and 64 MiB");
    const perUserQuotaBytes = quota(files.per_user_quota_bytes, "files.per_user_quota_bytes");
    const serverQuotaBytes = quota(files.server_quota_bytes, "files.server_quota_bytes");
    const incompleteUploadExpirySeconds = integer(
        files.incomplete_upload_expiry_seconds,
        "files.incomplete_upload_expiry_seconds",
        24 * 60 * 60,
    );
    if (incompleteUploadExpirySeconds < 60 || incompleteUploadExpirySeconds > 30 * 24 * 60 * 60)
        throw new Error("files.incomplete_upload_expiry_seconds must be between 60 and 2592000");
    const quarantineRetentionSeconds = integer(
        files.quarantine_retention_seconds,
        "files.quarantine_retention_seconds",
        30 * 24 * 60 * 60,
    );
    if (quarantineRetentionSeconds < 0 || quarantineRetentionSeconds > 365 * 24 * 60 * 60)
        throw new Error("files.quarantine_retention_seconds must be between 0 and 31536000");
    const malwareScanTimeoutSeconds = integer(
        files.malware_scan_timeout_seconds,
        "files.malware_scan_timeout_seconds",
        120,
    );
    if (malwareScanTimeoutSeconds < 1 || malwareScanTimeoutSeconds > 3600)
        throw new Error("files.malware_scan_timeout_seconds must be between 1 and 3600");
    const malwareScanFailureMode =
        string(files.malware_scan_failure_mode, "files.malware_scan_failure_mode", true) ?? "deny";
    if (malwareScanFailureMode !== "allow" && malwareScanFailureMode !== "deny")
        throw new Error("files.malware_scan_failure_mode must be allow or deny");
    const security = table(root.security ?? {}, "security");
    const rateLimit = table(security.rate_limit ?? {}, "security.rate_limit");
    const idempotency = table(security.idempotency ?? {}, "security.idempotency");
    const readsPerMinute = boundedPositiveInteger(
        rateLimit.reads_per_minute,
        "security.rate_limit.reads_per_minute",
        1_200,
        1_000_000,
    );
    const writesPerMinute = boundedPositiveInteger(
        rateLimit.writes_per_minute,
        "security.rate_limit.writes_per_minute",
        300,
        1_000_000,
    );
    const authPerMinute = boundedPositiveInteger(
        rateLimit.auth_per_minute,
        "security.rate_limit.auth_per_minute",
        30,
        1_000_000,
    );
    const idempotencyLeaseSeconds = boundedPositiveInteger(
        idempotency.lease_seconds,
        "security.idempotency.lease_seconds",
        30,
        3_600,
    );
    const idempotencyRetentionSeconds = boundedPositiveInteger(
        idempotency.retention_seconds,
        "security.idempotency.retention_seconds",
        86_400,
        31_536_000,
    );
    if (idempotencyRetentionSeconds < idempotencyLeaseSeconds)
        throw new Error("security.idempotency.retention_seconds must be at least lease_seconds");
    const jwt = table(root.jwt, "jwt");
    const expiryDays = integer(jwt.expiry_days, "jwt.expiry_days", 30);
    if (expiryDays < 1 || expiryDays > 90)
        throw new Error("jwt.expiry_days must be between 1 and 90");
    const privateKeyPath = string(jwt.private_key_path, "jwt.private_key_path", true);
    const publicKeyPath = string(jwt.public_key_path, "jwt.public_key_path", true);

    const auth = table(root.auth ?? {}, "auth");
    const password = table(auth.password ?? {}, "auth.password");
    const magicLink = table(auth.magic_link ?? {}, "auth.magic_link");
    const cloudflareAccess = table(auth.cloudflare_access ?? {}, "auth.cloudflare_access");
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

    if (oidc.size > 1) {
        throw new Error("only one OIDC provider can be enabled at a time");
    }

    const magicEnabled = boolean(magicLink.enabled, "auth.magic_link.enabled");
    const magicRedirectUrl = string(magicLink.redirect_url, "auth.magic_link.redirect_url", true);
    if (magicEnabled && !magicRedirectUrl)
        throw new Error("auth.magic_link.redirect_url is required when magic links are enabled");
    const cloudflareAccessEnabled = boolean(
        cloudflareAccess.enabled,
        "auth.cloudflare_access.enabled",
    );
    const cloudflareAccessTeamDomain = string(
        cloudflareAccess.team_domain,
        "auth.cloudflare_access.team_domain",
        !cloudflareAccessEnabled,
    );
    const cloudflareAccessAudience = string(
        cloudflareAccess.audience,
        "auth.cloudflare_access.audience",
        !cloudflareAccessEnabled,
    );
    let normalizedCloudflareAccessTeamDomain = cloudflareAccessTeamDomain;
    if (cloudflareAccessEnabled) {
        const teamDomain = new URL(cloudflareAccessTeamDomain!);
        if (
            teamDomain.protocol !== "https:" ||
            !teamDomain.hostname.endsWith(".cloudflareaccess.com") ||
            teamDomain.username ||
            teamDomain.password ||
            teamDomain.port ||
            teamDomain.pathname !== "/" ||
            teamDomain.search ||
            teamDomain.hash
        )
            throw new Error(
                "auth.cloudflare_access.team_domain must be an https Cloudflare Access team domain",
            );
        normalizedCloudflareAccessTeamDomain = teamDomain.origin;
    }
    const enabledMethods = [
        boolean(password.enabled, "auth.password.enabled"),
        magicEnabled,
        oidc.size > 0,
        cloudflareAccessEnabled,
    ].filter(Boolean).length;
    if (enabledMethods > 1) {
        throw new Error("only one authentication method can be enabled at a time");
    }
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
        agents: {
            enabled: boolean(agents.enabled, "agents.enabled", true),
            directory: paths.rigDirectory,
            socketPath:
                string(agents.socket_path, "agents.socket_path", true) ??
                process.env.RIG_SERVER_SOCKET_PATH ??
                join(paths.rigDirectory, "server.sock"),
            tokenPath:
                string(agents.token_path, "agents.token_path", true) ??
                process.env.RIG_SERVER_TOKEN_PATH ??
                join(paths.rigDirectory, "token"),
            command:
                string(agents.command, "agents.command", true) ??
                process.env.RIG_COMMAND ??
                bundledRigCommand(),
            defaultCwd:
                string(agents.default_cwd, "agents.default_cwd", true) ?? paths.workspacesDirectory,
        },
        files: {
            provider: fileProvider,
            directory: string(files.directory, "files.directory", true) ?? paths.filesDirectory,
            signedUrlExpirySeconds,
            maxUploadBytes,
            resumableChunkBytes,
            perUserQuotaBytes,
            serverQuotaBytes,
            incompleteUploadExpirySeconds,
            quarantineRetentionSeconds,
            malwareScannerCommand: string(
                files.malware_scanner_command,
                "files.malware_scanner_command",
                true,
            ),
            malwareScannerArguments: strings(
                files.malware_scanner_arguments,
                "files.malware_scanner_arguments",
            ),
            malwareScanTimeoutSeconds,
            malwareScanFailureMode,
        },
        plugins: {
            directory:
                string(plugins.directory, "plugins.directory", true) ?? paths.pluginsDirectory,
            hostApiHost: string(plugins.host_api_host, "plugins.host_api_host", true) ?? "0.0.0.0",
            hostApiPort: pluginHostApiPort,
        },
        security: {
            integrationSecretEnv:
                string(security.integration_secret_env, "security.integration_secret_env", true) ??
                "HAPPY2_INTEGRATION_SECRET",
            rateLimit: {
                enabled: boolean(rateLimit.enabled, "security.rate_limit.enabled", true),
                readsPerMinute,
                writesPerMinute,
                authPerMinute,
            },
            idempotency: {
                enabled: boolean(idempotency.enabled, "security.idempotency.enabled", true),
                leaseSeconds: idempotencyLeaseSeconds,
                retentionSeconds: idempotencyRetentionSeconds,
            },
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
            },
            magicLink: {
                enabled: magicEnabled,
                from: string(magicLink.from, "auth.magic_link.from", true),
                redirectUrl: magicRedirectUrl,
            },
            oidc,
            cloudflareAccess: {
                enabled: cloudflareAccessEnabled,
                teamDomain: normalizedCloudflareAccessTeamDomain,
                audience: cloudflareAccessAudience,
            },
        },
    };
}

function quota(value: unknown, path: string): number {
    const result = integer(value, path, 0);
    if (!Number.isSafeInteger(result) || result < 0)
        throw new Error(`${path} must be zero or a positive safe integer`);
    return result;
}

function boundedPositiveInteger(
    value: unknown,
    path: string,
    fallback: number,
    maximum: number,
): number {
    const result = integer(value, path, fallback);
    if (result < 1 || result > maximum) throw new Error(`${path} must be between 1 and ${maximum}`);
    return result;
}

export async function loadConfig(path: string): Promise<ServerConfig> {
    return parseConfig(await readFile(path, "utf8"));
}
