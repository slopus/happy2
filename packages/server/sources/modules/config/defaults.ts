import type { ServerConfig } from "./type.js";
import { join } from "node:path";
import { bundledRigCommand } from "../agents/command.js";
import { localRuntimePaths } from "./paths.js";

/**
 * Safe standalone defaults used only when neither --config nor RIGGED_CONFIG
 * is supplied. Persistent state and generated secrets live under .rigged in
 * the invoking working directory.
 */
export function defaultConfig(): ServerConfig {
    const paths = localRuntimePaths();
    return {
        server: {
            role: "all",
            host: "127.0.0.1",
            port: 3000,
            publicUrl: "http://127.0.0.1:3000",
            trustedProxyHops: 0,
        },
        database: { url: `file:${join(paths.runtimeDirectory, "rigged.db")}` },
        agents: {
            enabled: true,
            directory: paths.rigDirectory,
            socketPath:
                process.env.RIG_SERVER_SOCKET_PATH ?? join(paths.rigDirectory, "server.sock"),
            tokenPath: process.env.RIG_SERVER_TOKEN_PATH ?? join(paths.rigDirectory, "token"),
            command: process.env.RIG_COMMAND ?? bundledRigCommand(),
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
        security: {
            integrationSecretEnv: "RIGGED_INTEGRATION_SECRET",
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
            audience: "rigged-desktop",
            keyId: "local-generated",
            expiryDays: 30,
        },
        auth: {
            password: { enabled: true, signupEnabled: true },
            magicLink: { enabled: false },
            oidc: new Map(),
        },
    };
}
