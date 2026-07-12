import type { ServerConfig } from "./type.js";

/**
 * Safe local-development defaults used only when neither --config nor
 * RIGGED_CONFIG is supplied. Secrets are initialized beside the working
 * directory by initializeManagedEnvironment.
 */
export function defaultConfig(): ServerConfig {
    return {
        server: {
            role: "all",
            host: "127.0.0.1",
            port: 3000,
            publicUrl: "http://127.0.0.1:3000",
            trustedProxyHops: 0,
        },
        database: { url: "file:rigged.db" },
        files: {
            directory: "files",
            signedUrlExpirySeconds: 300,
            maxUploadBytes: 512 * 1024 * 1024,
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
