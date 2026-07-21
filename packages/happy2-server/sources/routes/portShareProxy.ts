import proxy from "@fastify/http-proxy";
import type { ClientOptions } from "ws";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { CollaborationError } from "../modules/chat/types.js";
import type { PortShareService } from "../modules/port-share/service.js";
import { PortShareError } from "../modules/port-share/types.js";
import { portShareWebHandoffPath } from "../portShareWebHandoff.js";
import { portShareReturnTo } from "./portShareReturnTo.js";

export const portShareAuthenticationCookieName = "happy2_port_share";
const PORT_SHARE_CONSTRAINT = "happy2PortShareHost";
const PORT_SHARE_CONSTRAINT_VALUE = "port-share";
const SESSION_PATH = "/.happy2/auth/session";
const REDEEM_PATH = "/.happy2/auth/redeem";

/** Registers audience-aware hostname proxying, user-only browser redemption, and host-only user-and-subdomain cookies without exposing preview auth routes on the app hostname. */
export async function registerPortShareProxy(
    app: FastifyInstance,
    portShares: PortShareService,
    options: { appPublicUrl: string; secureCookies: boolean },
): Promise<void> {
    const upstreams = new WeakMap<object, string>();
    const identities = new WeakMap<object, string>();
    const corsOrigin = new URL(options.appPublicUrl).origin;
    const hostConstraint: Parameters<typeof app.addConstraintStrategy>[0] = {
        name: PORT_SHARE_CONSTRAINT,
        storage() {
            const handlers = new Map();
            return {
                get(value) {
                    return handlers.get(value) ?? null;
                },
                set(value, handler) {
                    handlers.set(value, handler);
                },
            };
        },
        validate: () => true,
        deriveConstraint: (request) =>
            portShares.subdomainForHost(request.headers.host)
                ? PORT_SHARE_CONSTRAINT_VALUE
                : undefined,
        mustMatchWhenDerived: true,
    };
    app.addConstraintStrategy(hostConstraint);
    app.options(SESSION_PATH, {
        constraints: { [PORT_SHARE_CONSTRAINT]: PORT_SHARE_CONSTRAINT_VALUE },
        handler: (request, reply) => {
            sessionCors(reply, request, corsOrigin);
            return reply
                .header("access-control-allow-headers", "authorization")
                .header("access-control-allow-methods", "GET, OPTIONS")
                .code(204)
                .send();
        },
    });
    app.get(SESSION_PATH, {
        constraints: { [PORT_SHARE_CONSTRAINT]: PORT_SHARE_CONSTRAINT_VALUE },
        handler: async (request, reply) => {
            sessionCors(reply, request, corsOrigin);
            try {
                const authorization = bearerToken(request);
                const result = await portShares.authenticateAccess(request.host, authorization);
                reply.header("set-cookie", portShareCookie(authorization!, options.secureCookies));
                return {
                    authenticated: true,
                    userId: result.userId,
                    portShare: result.portShare,
                };
            } catch (error) {
                return handled(reply, error);
            }
        },
    });
    app.get(REDEEM_PATH, {
        constraints: { [PORT_SHARE_CONSTRAINT]: PORT_SHARE_CONSTRAINT_VALUE },
        handler: async (request, reply) => {
            reply.header("cache-control", "no-store").header("referrer-policy", "no-referrer");
            try {
                const input = redemptionInput(request);
                const accessToken = await portShares.redeemAccess(request.host, input.token);
                return reply
                    .header("set-cookie", portShareCookie(accessToken, options.secureCookies))
                    .redirect(input.returnTo);
            } catch (error) {
                return handled(reply, error);
            }
        },
    });
    await app.register(proxy, {
        upstream: "",
        prefix: "/",
        rewritePrefix: "/",
        constraints: { [PORT_SHARE_CONSTRAINT]: PORT_SHARE_CONSTRAINT_VALUE },
        httpMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
        websocket: true,
        preHandler: async (request, reply) => {
            const bearer = bearerToken(request);
            try {
                const authorized = await portShares.authorize(
                    request.host,
                    bearer ?? authenticationCookie(request),
                );
                upstreams.set(request, authorized.upstream);
                if (authorized.userId) identities.set(request, authorized.userId);
            } catch (error) {
                if (browserAuthorizationRequired(request, error, bearer)) {
                    try {
                        return await redirectToMainAuthorization(
                            reply,
                            request,
                            portShares,
                            options.appPublicUrl,
                        );
                    } catch (redirectError) {
                        return handled(reply, redirectError);
                    }
                }
                return handled(reply, error);
            }
        },
        replyOptions: {
            getUpstream: (request) => requiredUpstream(upstreams, request),
            rewriteRequestHeaders: (request, headers) =>
                upstreamHeaders(headers, request, identities.get(request)),
        },
        wsClientOptions: {
            rewriteRequestHeaders: portShareWebSocketHeaders(identities),
        } as ClientOptions,
    });
}

function bearerToken(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer +([A-Za-z0-9._-]{1,4096})$/i)?.[1];
    return token;
}

function authenticationCookie(request: FastifyRequest): string | undefined {
    const source = request.headers.cookie;
    if (!source) return undefined;
    for (const pair of source.split(";")) {
        const separator = pair.indexOf("=");
        if (separator < 0) continue;
        if (pair.slice(0, separator).trim() !== portShareAuthenticationCookieName) continue;
        const value = pair.slice(separator + 1).trim();
        return /^[A-Za-z0-9._-]{1,4096}$/.test(value) ? value : undefined;
    }
    return undefined;
}

function redemptionInput(request: FastifyRequest): { token: string; returnTo: string } {
    if (!request.query || typeof request.query !== "object" || Array.isArray(request.query))
        throw new PortShareError("invalid", "Port-share redemption parameters are required");
    const query = request.query as Record<string, unknown>;
    if (Object.keys(query).length !== 2)
        throw new PortShareError("invalid", "Port-share redemption parameters are invalid");
    const token = query.token;
    if (typeof token !== "string" || !/^[A-Za-z0-9._-]{1,4096}$/.test(token))
        throw new PortShareError("invalid", "Port-share redemption token is invalid");
    return { token, returnTo: portShareReturnTo(query.returnTo) };
}

function portShareCookie(token: string, secure: boolean): string {
    return [
        `${portShareAuthenticationCookieName}=${token}`,
        "HttpOnly",
        "Path=/",
        "Max-Age=3600",
        "SameSite=Lax",
        ...(secure ? ["Secure"] : []),
    ].join("; ");
}

function sessionCors(reply: FastifyReply, request: FastifyRequest, allowedOrigin: string): void {
    const origin = request.headers.origin;
    if (origin === allowedOrigin)
        reply
            .header("access-control-allow-origin", allowedOrigin)
            .header("access-control-allow-credentials", "true")
            .header("vary", "Origin");
}

function browserAuthorizationRequired(
    request: FastifyRequest,
    error: unknown,
    bearer: string | undefined,
): boolean {
    return (
        error instanceof PortShareError &&
        error.code === "forbidden" &&
        bearer === undefined &&
        (request.method === "GET" || request.method === "HEAD") &&
        request.headers.upgrade?.toLowerCase() !== "websocket"
    );
}

async function redirectToMainAuthorization(
    reply: FastifyReply,
    request: FastifyRequest,
    portShares: PortShareService,
    appPublicUrl: string,
) {
    const portShareId = await portShares.activeShareIdForHost(request.host);
    const url = new URL(portShareWebHandoffPath(portShareId), appPublicUrl);
    url.searchParams.set("returnTo", portShareReturnTo(request.url));
    return reply
        .header("cache-control", "no-store")
        .header("referrer-policy", "no-referrer")
        .redirect(url.toString());
}

function upstreamHeaders(
    source: Record<string, string | string[] | undefined>,
    request: { host: string; ip: string; protocol: string },
    userId: string | undefined,
) {
    const headers = { ...source };
    delete headers.authorization;
    delete headers.cookie;
    delete headers.host;
    delete headers["x-forwarded-host"];
    return {
        ...headers,
        "x-forwarded-for": request.ip,
        "x-forwarded-proto": request.protocol,
        "x-forwarded-host": request.host,
        ...(userId ? { "x-happy2-user-id": userId } : {}),
    };
}

function requiredUpstream(upstreams: WeakMap<object, string>, request: object): string {
    const upstream = upstreams.get(request);
    if (!upstream) throw new Error("Port-share request reached the proxy without authorization");
    return upstream;
}

function portShareWebSocketHeaders(identities: WeakMap<object, string>) {
    return (
        headers: NonNullable<ClientOptions["headers"]>,
        request: FastifyRequest,
    ): NonNullable<ClientOptions["headers"]> =>
        upstreamHeaders(headers, request, identities.get(request));
}

function handled(reply: FastifyReply, error: unknown) {
    const portShareError = normalizePortShareError(error);
    if (!portShareError) throw error;
    return reply
        .code(
            portShareError.code === "not_found"
                ? 404
                : portShareError.code === "invalid"
                  ? 400
                  : portShareError.code === "conflict"
                    ? 409
                    : portShareError.code === "not_ready"
                      ? 503
                      : 401,
        )
        .send({ error: portShareError.code, message: portShareError.message });
}

function normalizePortShareError(error: unknown): PortShareError | undefined {
    if (error instanceof PortShareError) return error;
    if (error instanceof CollaborationError && error.code === "conflict")
        return new PortShareError("not_ready", error.message);
    if (
        error instanceof Error &&
        /loopback mapping|container is not ready|cannot expose agent ports/i.test(error.message)
    )
        return new PortShareError("not_ready", "The shared preview is not ready yet");
    return undefined;
}
