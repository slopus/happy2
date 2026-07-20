export type ServerRole = "all" | "auth" | "api";

export interface OidcProviderConfig {
    id: string;
    discoveryUrl: string;
    clientId: string;
    clientSecretEnv: string;
    scopes: string[];
    redirectPath: string;
}

export interface CloudflareAccessConfig {
    enabled: boolean;
    /** Cloudflare Zero Trust team domain, for example https://team.cloudflareaccess.com. */
    teamDomain?: string;
    /** The immutable Application Audience (AUD) tag assigned by Cloudflare Access. */
    audience?: string;
}

export interface ServerConfig {
    server: {
        role: ServerRole;
        host: string;
        port: number;
        publicUrl: string;
        trustedProxyHops: number;
    };
    database: { url: string; authTokenEnv?: string };
    agents: {
        enabled: boolean;
        directory: string;
        socketPath: string;
        tokenPath: string;
        command: string;
        defaultCwd: string;
    };
    files: {
        provider: "local";
        directory: string;
        signedUrlExpirySeconds: number;
        maxUploadBytes: number;
        resumableChunkBytes: number;
        perUserQuotaBytes: number;
        serverQuotaBytes: number;
        incompleteUploadExpirySeconds: number;
        quarantineRetentionSeconds: number;
        malwareScannerCommand?: string;
        malwareScannerArguments: string[];
        malwareScanTimeoutSeconds: number;
        malwareScanFailureMode: "allow" | "deny";
    };
    plugins: {
        directory: string;
        hostApiHost: string;
        hostApiPort: number;
    };
    portSharing: {
        /** Wildcard DNS suffix without a leading dot, for example preview.example.com. */
        publicDomain?: string;
        /** Public origin whose hostname is publicDomain; share subdomains replace that hostname. */
        publicUrl?: string;
    };
    security: {
        integrationSecretEnv: string;
        rateLimit: {
            enabled: boolean;
            readsPerMinute: number;
            writesPerMinute: number;
            authPerMinute: number;
        };
        idempotency: {
            enabled: boolean;
            leaseSeconds: number;
            retentionSeconds: number;
        };
    };
    jwt: {
        issuer: string;
        audience: string;
        keyId: string;
        privateKeyPath?: string;
        publicKeyPath?: string;
        expiryDays: number;
    };
    auth: {
        password: { enabled: boolean };
        magicLink: { enabled: boolean; from?: string; redirectUrl?: string };
        oidc: Map<string, OidcProviderConfig>;
        cloudflareAccess: CloudflareAccessConfig;
        devTokens: { enabled: boolean };
    };
}
