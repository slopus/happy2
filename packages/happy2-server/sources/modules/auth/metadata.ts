import type { FastifyRequest } from "fastify";
import type { RequestMetadata } from "./types.js";

export type AuthenticationRequest = Pick<FastifyRequest, "headers">;

function header(request: FastifyRequest, name: string): string | undefined {
    const value = request.headers[name];
    return typeof value === "string" && value.length > 0 ? value.slice(0, 512) : undefined;
}

export function requestMetadata(request: FastifyRequest): RequestMetadata {
    const location = Object.fromEntries(
        [
            ["country", header(request, "cf-ipcountry")],
            ["region", header(request, "cf-region")],
            ["regionCode", header(request, "cf-region-code")],
            ["city", header(request, "cf-ipcity")],
            ["timezone", header(request, "cf-timezone")],
        ].filter((entry): entry is [string, string] => Boolean(entry[1])),
    );
    return {
        ip: request.ip,
        forwardedFor: request.ips?.length ? request.ips : undefined,
        location: Object.keys(location).length ? location : undefined,
        device: header(request, "x-happy2-device"),
        appVersion: header(request, "x-happy2-app-version"),
        userAgent: header(request, "user-agent"),
    };
}

export function bearerToken(request: AuthenticationRequest): string | undefined {
    const value = request.headers.authorization;
    if (typeof value !== "string") return undefined;
    return value?.match(/^Bearer +(.+)$/i)?.[1];
}

/** The HttpOnly browser-session cookie issued only by the web gateway after authentication. */
export const authenticationCookieName = "happy2_auth_token";

/**
 * Returns the credential from the web gateway's exact HttpOnly cookie. It may be a
 * configured development token or a normal session JWT; both are verified by the
 * same durable-session checks as Authorization Bearer credentials.
 */
export function authenticationCookie(request: AuthenticationRequest): string | undefined {
    const value = request.headers.cookie;
    if (typeof value !== "string") return undefined;
    for (const part of value.split(";")) {
        const [name, ...values] = part.trim().split("=");
        if (name !== authenticationCookieName) continue;
        const token = values.join("=");
        return token.length > 0 && token.length <= 4_096 ? token : undefined;
    }
    return undefined;
}
