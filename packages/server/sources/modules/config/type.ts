export type ServerRole = "all" | "auth" | "api";

export interface OidcProviderConfig {
    id: string;
    discoveryUrl: string;
    clientId: string;
    clientSecretEnv: string;
    scopes: string[];
    redirectPath: string;
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
    jwt: {
        issuer: string;
        audience: string;
        keyId: string;
        privateKeyPath?: string;
        publicKeyPath?: string;
        expiryDays: number;
    };
    auth: {
        password: { enabled: boolean; signupEnabled: boolean };
        magicLink: { enabled: boolean; from?: string; redirectUrl?: string };
        oidc: Map<string, OidcProviderConfig>;
    };
}
