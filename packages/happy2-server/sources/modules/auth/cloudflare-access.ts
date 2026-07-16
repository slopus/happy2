import { createRemoteJWKSet, jwtVerify } from "jose";
import type { FastifyRequest } from "fastify";
import type { CloudflareAccessConfig } from "../config/type.js";

export interface CloudflareAccessIdentity {
    subject: string;
    email: string;
    expiresAt: Date;
}

const keySets = new Map<string, ReturnType<typeof createRemoteJWKSet>>();

/**
 * Verifies the assertion Cloudflare Access adds after evaluating the application's
 * policy. The authorization cookie is deliberately not accepted at the origin:
 * Cloudflare recommends this signed header because a cookie is not guaranteed to
 * be forwarded.
 */
export async function cloudflareAccessIdentity(
    request: FastifyRequest,
    config: CloudflareAccessConfig,
): Promise<CloudflareAccessIdentity | undefined> {
    if (!config.enabled || !config.teamDomain || !config.audience) return undefined;
    const assertion = request.headers["cf-access-jwt-assertion"];
    if (typeof assertion !== "string" || assertion.length === 0 || assertion.length > 16_384)
        return undefined;
    try {
        const { payload } = await jwtVerify(assertion, keySet(config.teamDomain), {
            issuer: config.teamDomain,
            audience: config.audience,
            algorithms: ["RS256"],
        });
        if (
            payload.type !== "app" ||
            typeof payload.sub !== "string" ||
            payload.sub.length === 0 ||
            typeof payload.email !== "string" ||
            !email(payload.email) ||
            typeof payload.exp !== "number"
        )
            return undefined;
        return {
            subject: payload.sub,
            email: payload.email.toLowerCase(),
            expiresAt: new Date(payload.exp * 1_000),
        };
    } catch {
        return undefined;
    }
}

function keySet(teamDomain: string): ReturnType<typeof createRemoteJWKSet> {
    let value = keySets.get(teamDomain);
    if (!value) {
        value = createRemoteJWKSet(new URL(`${teamDomain}/cdn-cgi/access/certs`));
        keySets.set(teamDomain, value);
    }
    return value;
}

function email(value: string): boolean {
    return value.length <= 320 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}
