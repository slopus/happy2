import type { FastifyRequest } from "fastify";
import type { RequestMetadata } from "./types.js";

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

export function bearerToken(request: FastifyRequest): string | undefined {
    const value = request.headers.authorization;
    if (typeof value !== "string") return undefined;
    return value?.match(/^Bearer +(.+)$/i)?.[1];
}
