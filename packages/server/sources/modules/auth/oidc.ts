import { createHash } from "node:crypto";
import { createRemoteJWKSet, jwtVerify } from "jose";
import type { OidcProviderConfig } from "../config/type.js";

interface Discovery {
    authorization_endpoint: string;
    token_endpoint: string;
    jwks_uri: string;
    issuer: string;
}
interface Identity {
    subject: string;
    email: string;
}

const cache = new Map<string, Discovery>();

async function discovery(provider: OidcProviderConfig): Promise<Discovery> {
    const cached = cache.get(provider.discoveryUrl);
    if (cached) return cached;
    const response = await fetch(provider.discoveryUrl);
    if (!response.ok) throw new Error(`OIDC discovery failed (${response.status})`);
    const value = (await response.json()) as Discovery;
    for (const field of ["authorization_endpoint", "token_endpoint", "jwks_uri", "issuer"] as const)
        if (!value[field]) throw new Error("OIDC discovery document is incomplete");
    cache.set(provider.discoveryUrl, value);
    return value;
}

export async function authorizationUrl(
    provider: OidcProviderConfig,
    redirectUri: string,
    state: string,
    verifier: string,
    nonce: string,
): Promise<string> {
    const info = await discovery(provider);
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const url = new URL(info.authorization_endpoint);
    url.search = new URLSearchParams({
        response_type: "code",
        client_id: provider.clientId,
        redirect_uri: redirectUri,
        scope: provider.scopes.join(" "),
        state,
        nonce,
        code_challenge: challenge,
        code_challenge_method: "S256",
    }).toString();
    return url.toString();
}

export async function exchangeCode(
    provider: OidcProviderConfig,
    code: string,
    verifier: string,
    redirectUri: string,
    nonce: string,
): Promise<Identity> {
    const secret = process.env[provider.clientSecretEnv];
    if (!secret)
        throw new Error(`${provider.clientSecretEnv} is required for OIDC provider ${provider.id}`);
    const info = await discovery(provider);
    const response = await fetch(info.token_endpoint, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
            grant_type: "authorization_code",
            code,
            redirect_uri: redirectUri,
            client_id: provider.clientId,
            client_secret: secret,
            code_verifier: verifier,
        }),
    });
    if (!response.ok) throw new Error(`OIDC token exchange failed (${response.status})`);
    const payload = (await response.json()) as { id_token?: string };
    if (!payload.id_token) throw new Error("OIDC token response has no id_token");
    const keySet = createRemoteJWKSet(new URL(info.jwks_uri));
    const verified = await jwtVerify(payload.id_token, keySet, {
        issuer: info.issuer,
        audience: provider.clientId,
    });
    if (
        verified.payload.nonce !== nonce ||
        typeof verified.payload.sub !== "string" ||
        typeof verified.payload.email !== "string" ||
        verified.payload.email_verified === false
    )
        throw new Error("OIDC identity is incomplete or unverified");
    return { subject: verified.payload.sub, email: verified.payload.email.toLowerCase() };
}
