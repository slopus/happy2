import type { ServerConfig } from "./type.js";
import { join } from "node:path";
import { bundledRigCommand } from "../agents/command.js";
import { localRuntimePaths } from "./paths.js";

/**
 * Safe standalone defaults used for configless startup and as the base for
 * partial TOML overrides. Persistent state and generated secrets live under
 * .happy2 in the invoking working directory.
 */
export function defaultConfig(
    cwd = process.cwd(),
    environment: NodeJS.ProcessEnv = process.env,
): ServerConfig {
    const paths = localRuntimePaths(cwd, environment);
    return {
        server: {
            role: "all",
            host: "127.0.0.1",
            port: 3000,
            publicUrl: "http://127.0.0.1:3000",
            trustedProxyHops: 0,
        },
        database: { url: `file:${join(paths.runtimeDirectory, "happy2.db")}` },
        agents: {
            enabled: true,
            daemonMode: "managed",
            directory: paths.rigDirectory,
            socketPath:
                environment.RIG_SERVER_SOCKET_PATH ?? join(paths.rigDirectory, "server.sock"),
            tokenPath: environment.RIG_SERVER_TOKEN_PATH ?? join(paths.rigDirectory, "token"),
            command: environment.RIG_COMMAND ?? bundledRigCommand(),
            defaultCwd: paths.workspacesDirectory,
        },
        files: {
            provider: "local",
            directory: paths.filesDirectory,
            signedUrlExpirySeconds: 300,
            maxUploadBytes: 512 * 1024 * 1024,
            resumableChunkBytes: 8 * 1024 * 1024,
            perUserQuotaBytes: 0,
            serverQuotaBytes: 0,
            incompleteUploadExpirySeconds: 24 * 60 * 60,
            quarantineRetentionSeconds: 30 * 24 * 60 * 60,
            malwareScannerArguments: [],
            malwareScanTimeoutSeconds: 120,
            malwareScanFailureMode: "deny",
        },
        plugins: {
            directory: paths.pluginsDirectory,
            hostApiHost: "0.0.0.0",
            hostApiPort: 3001,
        },
        portSharing: {},
        security: {
            integrationSecretEnv: "HAPPY2_INTEGRATION_SECRET",
            rateLimit: {
                enabled: true,
                readsPerMinute: 1_200,
                writesPerMinute: 300,
                authPerMinute: 30,
            },
            idempotency: {
                enabled: true,
                leaseSeconds: 30,
                retentionSeconds: 24 * 60 * 60,
            },
        },
        jwt: {
            issuer: "http://127.0.0.1:3000",
            audience: "happy2-desktop",
            keyId: "local-generated",
            expiryDays: 30,
        },
        auth: {
            local: { enabled: false, tokenEnv: "HAPPY2_LOCAL_ACCESS_TOKEN" },
            password: { enabled: true },
            magicLink: { enabled: false },
            oidc: new Map(),
            cloudflareAccess: { enabled: false },
            devTokens: { enabled: false },
        },
    };
}
