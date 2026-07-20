import { readFile } from "node:fs/promises";
import { isIP } from "node:net";
import { parse } from "smol-toml";
import { defaultConfig } from "./defaults.js";
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
    if (value === undefined) return [...fallback];
    if (!Array.isArray(value) || !value.every((item) => typeof item === "string"))
        throw new Error(`${path} must be a string array`);
    return [...value];
}

export function parseConfig(input: string, defaults: ServerConfig = defaultConfig()): ServerConfig {
    const root = table(parse(input), "config");
    const server = table(root.server ?? {}, "server");
    const role = (string(server.role, "server.role", true) ?? defaults.server.role) as ServerRole;
    if (!(["all", "auth", "api"] as const).includes(role))
        throw new Error("server.role must be all, auth, or api");
    const host = string(server.host, "server.host", true) ?? defaults.server.host;
    const port = integer(server.port, "server.port", defaults.server.port);
    const publicUrl =
        string(server.public_url, "server.public_url", true) ?? defaults.server.publicUrl;
    new URL(publicUrl);
    const trustedProxyHops = integer(
        server.trusted_proxy_hops,
        "server.trusted_proxy_hops",
        defaults.server.trustedProxyHops,
    );
    if (trustedProxyHops < 0) throw new Error("server.trusted_proxy_hops cannot be negative");

    const database = table(root.database ?? {}, "database");
    const agents = table(root.agents ?? {}, "agents");
    const files = table(root.files ?? {}, "files");
    const plugins = table(root.plugins ?? {}, "plugins");
    const portSharing = table(root.port_sharing ?? {}, "port_sharing");
    const pluginHostApiPort = boundedPositiveInteger(
        plugins.host_api_port,
        "plugins.host_api_port",
        defaults.plugins.hostApiPort,
        65_535,
    );
    if (pluginHostApiPort === port)
        throw new Error("plugins.host_api_port must differ from server.port");
    const portSharingPublicDomain = normalizedHostname(
        string(portSharing.public_domain, "port_sharing.public_domain", true) ??
            defaults.portSharing.publicDomain,
        "port_sharing.public_domain",
    );
    const portSharingPublicUrl =
        string(portSharing.public_url, "port_sharing.public_url", true) ??
        defaults.portSharing.publicUrl;
    if (!portSharingPublicDomain && portSharingPublicUrl)
        throw new Error(
            "port_sharing.public_domain is required when port_sharing.public_url is configured",
        );
    let normalizedPortSharingPublicUrl = portSharingPublicDomain
        ? (portSharingPublicUrl ?? `https://${portSharingPublicDomain}`)
        : undefined;
    if (normalizedPortSharingPublicUrl) {
        const url = new URL(normalizedPortSharingPublicUrl);
        if (
            (url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password ||
            url.pathname !== "/" ||
            url.search ||
            url.hash
        )
            throw new Error(
                "port_sharing.public_url must be an HTTP(S) origin without credentials, path, query, or fragment",
            );
        if (url.hostname !== portSharingPublicDomain)
            throw new Error(
                "port_sharing.public_url hostname must equal port_sharing.public_domain",
            );
        normalizedPortSharingPublicUrl = url.origin;
    }
    const fileProvider = string(files.provider, "files.provider", true) ?? defaults.files.provider;
    if (fileProvider !== "local")
        throw new Error("files.provider must be local in this server build");
    const signedUrlExpirySeconds = integer(
        files.signed_url_expiry_seconds,
        "files.signed_url_expiry_seconds",
        defaults.files.signedUrlExpirySeconds,
    );
    if (signedUrlExpirySeconds < 1 || signedUrlExpirySeconds > 3600)
        throw new Error("files.signed_url_expiry_seconds must be between 1 and 3600");
    const maxUploadBytes = integer(
        files.max_upload_bytes,
        "files.max_upload_bytes",
        defaults.files.maxUploadBytes,
    );
    if (maxUploadBytes < 1024 || maxUploadBytes > 2 * 1024 * 1024 * 1024)
        throw new Error("files.max_upload_bytes must be between 1 KiB and 2 GiB");
    const resumableChunkBytes = integer(
        files.resumable_chunk_bytes,
        "files.resumable_chunk_bytes",
        defaults.files.resumableChunkBytes,
    );
    if (resumableChunkBytes < 64 * 1024 || resumableChunkBytes > 64 * 1024 * 1024)
        throw new Error("files.resumable_chunk_bytes must be between 64 KiB and 64 MiB");
    const perUserQuotaBytes = quota(
        files.per_user_quota_bytes,
        "files.per_user_quota_bytes",
        defaults.files.perUserQuotaBytes,
    );
    const serverQuotaBytes = quota(
        files.server_quota_bytes,
        "files.server_quota_bytes",
        defaults.files.serverQuotaBytes,
    );
    const incompleteUploadExpirySeconds = integer(
        files.incomplete_upload_expiry_seconds,
        "files.incomplete_upload_expiry_seconds",
        defaults.files.incompleteUploadExpirySeconds,
    );
    if (incompleteUploadExpirySeconds < 60 || incompleteUploadExpirySeconds > 30 * 24 * 60 * 60)
        throw new Error("files.incomplete_upload_expiry_seconds must be between 60 and 2592000");
    const quarantineRetentionSeconds = integer(
        files.quarantine_retention_seconds,
        "files.quarantine_retention_seconds",
        defaults.files.quarantineRetentionSeconds,
    );
    if (quarantineRetentionSeconds < 0 || quarantineRetentionSeconds > 365 * 24 * 60 * 60)
        throw new Error("files.quarantine_retention_seconds must be between 0 and 31536000");
    const malwareScanTimeoutSeconds = integer(
        files.malware_scan_timeout_seconds,
        "files.malware_scan_timeout_seconds",
        defaults.files.malwareScanTimeoutSeconds,
    );
    if (malwareScanTimeoutSeconds < 1 || malwareScanTimeoutSeconds > 3600)
        throw new Error("files.malware_scan_timeout_seconds must be between 1 and 3600");
    const malwareScanFailureMode =
        string(files.malware_scan_failure_mode, "files.malware_scan_failure_mode", true) ??
        defaults.files.malwareScanFailureMode;
    if (malwareScanFailureMode !== "allow" && malwareScanFailureMode !== "deny")
        throw new Error("files.malware_scan_failure_mode must be allow or deny");
    const security = table(root.security ?? {}, "security");
    const rateLimit = table(security.rate_limit ?? {}, "security.rate_limit");
    const idempotency = table(security.idempotency ?? {}, "security.idempotency");
    const readsPerMinute = boundedPositiveInteger(
        rateLimit.reads_per_minute,
        "security.rate_limit.reads_per_minute",
        defaults.security.rateLimit.readsPerMinute,
        1_000_000,
    );
    const writesPerMinute = boundedPositiveInteger(
        rateLimit.writes_per_minute,
        "security.rate_limit.writes_per_minute",
        defaults.security.rateLimit.writesPerMinute,
        1_000_000,
    );
    const authPerMinute = boundedPositiveInteger(
        rateLimit.auth_per_minute,
        "security.rate_limit.auth_per_minute",
        defaults.security.rateLimit.authPerMinute,
        1_000_000,
    );
    const idempotencyLeaseSeconds = boundedPositiveInteger(
        idempotency.lease_seconds,
        "security.idempotency.lease_seconds",
        defaults.security.idempotency.leaseSeconds,
        3_600,
    );
    const idempotencyRetentionSeconds = boundedPositiveInteger(
        idempotency.retention_seconds,
        "security.idempotency.retention_seconds",
        defaults.security.idempotency.retentionSeconds,
        31_536_000,
    );
    if (idempotencyRetentionSeconds < idempotencyLeaseSeconds)
        throw new Error("security.idempotency.retention_seconds must be at least lease_seconds");
    const jwt = table(root.jwt ?? {}, "jwt");
    const expiryDays = integer(jwt.expiry_days, "jwt.expiry_days", defaults.jwt.expiryDays);
    if (expiryDays < 1 || expiryDays > 90)
        throw new Error("jwt.expiry_days must be between 1 and 90");
    const privateKeyPath =
        string(jwt.private_key_path, "jwt.private_key_path", true) ?? defaults.jwt.privateKeyPath;
    const publicKeyPath =
        string(jwt.public_key_path, "jwt.public_key_path", true) ?? defaults.jwt.publicKeyPath;

    const auth = table(root.auth ?? {}, "auth");
    const password = table(auth.password ?? {}, "auth.password");
    const magicLink = table(auth.magic_link ?? {}, "auth.magic_link");
    const cloudflareAccess = table(auth.cloudflare_access ?? {}, "auth.cloudflare_access");
    const devTokens = table(auth.dev_tokens ?? {}, "auth.dev_tokens");
    const oidc = new Map<string, OidcProviderConfig>(defaults.auth.oidc);
    for (const [id, value] of Object.entries(table(auth.oidc ?? {}, "auth.oidc"))) {
        const provider = table(value, `auth.oidc.${id}`);
        if (!boolean(provider.enabled, `auth.oidc.${id}.enabled`)) {
            oidc.delete(id);
            continue;
        }
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

    const passwordEnabled = boolean(
        password.enabled,
        "auth.password.enabled",
        defaults.auth.password.enabled,
    );
    const magicEnabled = boolean(
        magicLink.enabled,
        "auth.magic_link.enabled",
        defaults.auth.magicLink.enabled,
    );
    const magicRedirectUrl =
        string(magicLink.redirect_url, "auth.magic_link.redirect_url", true) ??
        defaults.auth.magicLink.redirectUrl;
    if (magicEnabled && !magicRedirectUrl)
        throw new Error("auth.magic_link.redirect_url is required when magic links are enabled");
    const cloudflareAccessEnabled = boolean(
        cloudflareAccess.enabled,
        "auth.cloudflare_access.enabled",
        defaults.auth.cloudflareAccess.enabled,
    );
    const cloudflareAccessTeamDomain =
        string(cloudflareAccess.team_domain, "auth.cloudflare_access.team_domain", true) ??
        defaults.auth.cloudflareAccess.teamDomain;
    const cloudflareAccessAudience =
        string(cloudflareAccess.audience, "auth.cloudflare_access.audience", true) ??
        defaults.auth.cloudflareAccess.audience;
    if (cloudflareAccessEnabled && !cloudflareAccessTeamDomain)
        throw new Error(
            "auth.cloudflare_access.team_domain is required when Cloudflare Access is enabled",
        );
    if (cloudflareAccessEnabled && !cloudflareAccessAudience)
        throw new Error(
            "auth.cloudflare_access.audience is required when Cloudflare Access is enabled",
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
        passwordEnabled,
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
            host,
            port,
            publicUrl: publicUrl.replace(/\/$/, ""),
            trustedProxyHops,
        },
        database: {
            url: string(database.url, "database.url", true) ?? defaults.database.url,
            authTokenEnv:
                string(database.auth_token_env, "database.auth_token_env", true) ??
                defaults.database.authTokenEnv,
        },
        agents: {
            enabled: boolean(agents.enabled, "agents.enabled", defaults.agents.enabled),
            directory: defaults.agents.directory,
            socketPath:
                string(agents.socket_path, "agents.socket_path", true) ??
                defaults.agents.socketPath,
            tokenPath:
                string(agents.token_path, "agents.token_path", true) ?? defaults.agents.tokenPath,
            command: string(agents.command, "agents.command", true) ?? defaults.agents.command,
            defaultCwd:
                string(agents.default_cwd, "agents.default_cwd", true) ??
                defaults.agents.defaultCwd,
        },
        files: {
            provider: fileProvider,
            directory: string(files.directory, "files.directory", true) ?? defaults.files.directory,
            signedUrlExpirySeconds,
            maxUploadBytes,
            resumableChunkBytes,
            perUserQuotaBytes,
            serverQuotaBytes,
            incompleteUploadExpirySeconds,
            quarantineRetentionSeconds,
            malwareScannerCommand:
                string(files.malware_scanner_command, "files.malware_scanner_command", true) ??
                defaults.files.malwareScannerCommand,
            malwareScannerArguments: strings(
                files.malware_scanner_arguments,
                "files.malware_scanner_arguments",
                defaults.files.malwareScannerArguments,
            ),
            malwareScanTimeoutSeconds,
            malwareScanFailureMode,
        },
        plugins: {
            directory:
                string(plugins.directory, "plugins.directory", true) ?? defaults.plugins.directory,
            hostApiHost:
                string(plugins.host_api_host, "plugins.host_api_host", true) ??
                defaults.plugins.hostApiHost,
            hostApiPort: pluginHostApiPort,
        },
        portSharing: {
            publicDomain: portSharingPublicDomain,
            publicUrl: normalizedPortSharingPublicUrl,
        },
        security: {
            integrationSecretEnv:
                string(security.integration_secret_env, "security.integration_secret_env", true) ??
                defaults.security.integrationSecretEnv,
            rateLimit: {
                enabled: boolean(
                    rateLimit.enabled,
                    "security.rate_limit.enabled",
                    defaults.security.rateLimit.enabled,
                ),
                readsPerMinute,
                writesPerMinute,
                authPerMinute,
            },
            idempotency: {
                enabled: boolean(
                    idempotency.enabled,
                    "security.idempotency.enabled",
                    defaults.security.idempotency.enabled,
                ),
                leaseSeconds: idempotencyLeaseSeconds,
                retentionSeconds: idempotencyRetentionSeconds,
            },
        },
        jwt: {
            issuer: string(jwt.issuer, "jwt.issuer", true) ?? defaults.jwt.issuer,
            audience: string(jwt.audience, "jwt.audience", true) ?? defaults.jwt.audience,
            keyId: string(jwt.key_id, "jwt.key_id", true) ?? defaults.jwt.keyId,
            privateKeyPath,
            publicKeyPath,
            expiryDays,
        },
        auth: {
            password: {
                enabled: passwordEnabled,
            },
            magicLink: {
                enabled: magicEnabled,
                from:
                    string(magicLink.from, "auth.magic_link.from", true) ??
                    defaults.auth.magicLink.from,
                redirectUrl: magicRedirectUrl,
            },
            oidc,
            cloudflareAccess: {
                enabled: cloudflareAccessEnabled,
                teamDomain: normalizedCloudflareAccessTeamDomain,
                audience: cloudflareAccessAudience,
            },
            devTokens: {
                enabled: boolean(
                    devTokens.enabled,
                    "auth.dev_tokens.enabled",
                    defaults.auth.devTokens.enabled,
                ),
            },
        },
    };
}

function normalizedHostname(value: string | undefined, path: string): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.toLowerCase().replace(/^\*\./, "").replace(/\.$/, "");
    let url: URL;
    try {
        url = new URL(`http://${normalized}`);
    } catch {
        throw new Error(`${path} must be a valid DNS hostname`);
    }
    if (
        url.hostname !== normalized ||
        url.port ||
        normalized === "localhost" ||
        isIP(normalized) !== 0 ||
        !normalized.includes(".") ||
        normalized.length > 253 ||
        !normalized
            .split(".")
            .every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label))
    )
        throw new Error(`${path} must be a valid DNS hostname`);
    return normalized;
}

function quota(value: unknown, path: string, fallback: number): number {
    const result = integer(value, path, fallback);
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

export async function loadConfig(
    path: string,
    defaults: ServerConfig = defaultConfig(),
): Promise<ServerConfig> {
    return parseConfig(await readFile(path, "utf8"), defaults);
}
