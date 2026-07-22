import proxy from "@fastify/http-proxy";
import { createProxyServer } from "httpxy";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { ClientRequest, IncomingMessage } from "node:http";
import { Socket } from "node:net";
import type { Duplex } from "node:stream";
import { TLSSocket } from "node:tls";
import { CollaborationError } from "../modules/chat/types.js";
import type { PortShareService } from "../modules/port-share/service.js";
import { PortShareError } from "../modules/port-share/types.js";
import {
    type HttpRateLimiter,
    type RateLimitDecision,
    RateLimitUnavailableError,
} from "../modules/request/index.js";
import { portShareWebHandoffPath } from "../portShareWebHandoff.js";
import { portShareErrorPageSend } from "./portShareErrorPage.js";
import { portShareReturnTo } from "./portShareReturnTo.js";

export const portShareAuthenticationCookieName = "happy2_port_share";
const PORT_SHARE_CONSTRAINT = "happy2PortShareHost";
const PORT_SHARE_CONSTRAINT_VALUE = "port-share";
const SESSION_PATH = "/.happy2/auth/session";
const REDEEM_PATH = "/.happy2/auth/redeem";
const claimedPortShareUpgrades = new WeakSet<IncomingMessage>();

interface PortShareProxyOptions {
    appPublicUrl: string;
    rateLimit?: { limiter: HttpRateLimiter; readsPerMinute: number };
    secureCookies: boolean;
    trustedProxyHops: number;
}

/** Registers audience-aware hostname proxying, user-only browser redemption, and host-only user-and-subdomain cookies without exposing preview auth routes on the app hostname. */
export async function registerPortShareProxy(
    app: FastifyInstance,
    portShares: PortShareService,
    options: PortShareProxyOptions,
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
    registerPortShareWebSocketProxy(app, portShares, options);
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
                return handled(reply, error, "page");
            }
        },
    });
    await app.register(proxy, {
        upstream: "",
        prefix: "/",
        rewritePrefix: "/",
        constraints: { [PORT_SHARE_CONSTRAINT]: PORT_SHARE_CONSTRAINT_VALUE },
        httpMethods: ["DELETE", "GET", "HEAD", "OPTIONS", "PATCH", "POST", "PUT"],
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
                        return handled(reply, redirectError, "page");
                    }
                }
                return handled(reply, error, "page");
            }
        },
        replyOptions: {
            getUpstream: (request) => requiredUpstream(upstreams, request),
            rewriteRequestHeaders: (request, headers) =>
                upstreamHeaders(headers, request, identities.get(request)),
            onError: (reply, { error }) =>
                portShareErrorPageSend(reply, upstreamFailureStatus(error)),
        },
    });
}

function registerPortShareWebSocketProxy(
    app: FastifyInstance,
    portShares: PortShareService,
    options: PortShareProxyOptions,
): void {
    const webSocketProxy = createProxyServer({
        changeOrigin: true,
        prependPath: false,
        xfwd: false,
    });
    const sockets = new Set<Duplex>();
    const proxyRequests = new Map<Duplex, ClientRequest>();
    const proxyResponses = new Map<Duplex, IncomingMessage>();
    const establishedUpgrades = new Map<Duplex, Duplex>();
    const closeUpstream = (socket: Duplex) => {
        const proxyRequest = proxyRequests.get(socket);
        const proxyResponse = proxyResponses.get(socket);
        destroyUpstreamSocket(proxyRequest?.socket);
        proxyRequest?.destroy();
        destroyUpstreamSocket(proxyResponse?.socket);
        proxyResponse?.destroy();
        destroyUpstreamSocket(establishedUpgrades.get(socket));
        proxyRequests.delete(socket);
        proxyResponses.delete(socket);
        establishedUpgrades.delete(socket);
    };
    webSocketProxy.on("proxyReqWs", (proxyRequest, _request, socket) => {
        proxyRequests.set(socket, proxyRequest);
        proxyRequest.once("response", (response) => {
            if (socket.destroyed) {
                destroyUpstreamSocket(response.socket);
                response.destroy();
                return;
            }
            proxyResponses.set(socket, response);
            response.once("close", () => proxyResponses.delete(socket));
        });
        proxyRequest.once("upgrade", (_response, upstreamSocket) => {
            if (socket.destroyed) destroyUpstreamSocket(upstreamSocket);
            else establishedUpgrades.set(socket, upstreamSocket);
        });
        proxyRequest.once("close", () => proxyRequests.delete(socket));
    });
    const upgrade = (request: IncomingMessage, socket: Duplex, head: Buffer) => {
        if (!portShares.subdomainForHost(request.headers.host)) return;
        claimedPortShareUpgrades.add(request);
        sockets.add(socket);
        socket.once("end", () => {
            closeUpstream(socket);
            socket.destroy();
        });
        socket.once("close", () => {
            sockets.delete(socket);
            closeUpstream(socket);
        });
        const requestPath = webSocketRequestPath(request.url);
        if (!requestPath) {
            rejectWebSocketUpgrade(socket, 400);
            return;
        }
        void (async () => {
            const clientIp = proxyAwareClientIp(request, options.trustedProxyHops);
            const rateLimitRejection = await portShareWebSocketRateLimit(
                options.rateLimit,
                clientIp,
            );
            if (rateLimitRejection) {
                rejectWebSocketUpgrade(
                    socket,
                    rateLimitRejection.status,
                    rateLimitRejection.headers,
                );
                return;
            }
            let authorized: Awaited<ReturnType<PortShareService["authorize"]>>;
            try {
                authorized = await portShares.authorize(
                    request.headers.host,
                    rawBearerToken(request) ?? rawAuthenticationCookie(request),
                );
            } catch (error) {
                const portShareError = normalizePortShareError(error);
                if (!portShareError) app.log.error(error);
                rejectWebSocketUpgrade(
                    socket,
                    portShareError ? portShareErrorStatus(portShareError) : 500,
                );
                return;
            }
            if (socket.destroyed || socket.readableEnded) return;
            request.url = requestPath;
            request.headers = upstreamHeaders(
                request.headers,
                {
                    host: request.headers.host ?? "",
                    ip: clientIp,
                    protocol: proxyAwareProtocol(request, options.trustedProxyHops),
                },
                authorized.userId,
            );
            await webSocketProxy.ws(
                request,
                socket as Parameters<typeof webSocketProxy.ws>[1],
                { target: authorized.upstream },
                head,
            );
        })().catch((error: unknown) => {
            if (socket.destroyed)
                app.log.debug({ err: error }, "Shared preview WebSocket disconnected");
            else {
                app.log.warn({ err: error }, "Could not connect shared preview WebSocket");
                rejectWebSocketUpgrade(socket, 500);
            }
        });
    };
    app.server.on("upgrade", upgrade);
    app.addHook("preClose", async () => {
        app.server.off("upgrade", upgrade);
        for (const socket of sockets) {
            closeUpstream(socket);
            socket.destroy();
        }
    });
}

function destroyUpstreamSocket(socket: Duplex | null | undefined): void {
    if (!socket || socket.destroyed) return;
    if (socket instanceof Socket) socket.resetAndDestroy();
    else socket.destroy();
}

/** Reports whether the port-share host listener synchronously claimed this upgrade request. */
export function portShareWebSocketUpgradeClaimed(request: IncomingMessage): boolean {
    return claimedPortShareUpgrades.has(request);
}

function webSocketRequestPath(requestTarget: string | undefined): string | undefined {
    if (!requestTarget?.startsWith("/") || requestTarget.startsWith("//")) return undefined;
    const base = new URL("http://happy2.invalid");
    try {
        const parsed = new URL(requestTarget, base);
        if (parsed.origin !== base.origin || parsed.hash) return undefined;
        return `${parsed.pathname}${parsed.search}`;
    } catch {
        return undefined;
    }
}

interface WebSocketRateLimitRejection {
    status: 429 | 503;
    headers: Record<string, string>;
}

async function portShareWebSocketRateLimit(
    rateLimit: PortShareProxyOptions["rateLimit"],
    clientIp: string,
): Promise<WebSocketRateLimitRejection | undefined> {
    if (!rateLimit) return undefined;
    try {
        const evaluation = await rateLimit.limiter.evaluate([
            {
                scope: "GET:/*",
                dimension: "ip",
                identity: clientIp,
                limit: rateLimit.readsPerMinute,
                windowMs: 60_000,
            },
        ]);
        if (evaluation.allowed) return undefined;
        const decision = evaluation.decisions[0];
        if (!decision) throw new Error("Rate limiter denied a WebSocket without a decision");
        const retryAfter = secondsUntil(decision.resetAt, evaluation.evaluatedAt);
        return {
            status: 429,
            headers: {
                ...rateLimitHeaders(decision, evaluation.evaluatedAt),
                "Retry-After": String(retryAfter),
            },
        };
    } catch (error) {
        if (error instanceof RateLimitUnavailableError)
            return { status: 503, headers: { "Retry-After": "1" } };
        throw error;
    }
}

function rateLimitHeaders(decision: RateLimitDecision, now: number): Record<string, string> {
    return {
        "RateLimit-Limit": String(decision.limit),
        "RateLimit-Remaining": String(decision.remaining),
        "RateLimit-Reset": String(secondsUntil(decision.resetAt, now)),
        "X-RateLimit-Reset": String(Math.ceil(decision.resetAt / 1_000)),
    };
}

function secondsUntil(resetAt: number, now: number): number {
    return Math.max(1, Math.ceil((resetAt - now) / 1_000));
}

function bearerToken(request: FastifyRequest): string | undefined {
    const authorization = request.headers.authorization;
    const token = authorization?.match(/^Bearer +([A-Za-z0-9._-]{1,4096})$/i)?.[1];
    return token;
}

function rawBearerToken(request: IncomingMessage): string | undefined {
    const authorization = request.headers.authorization;
    return authorization?.match(/^Bearer +([A-Za-z0-9._-]{1,4096})$/i)?.[1];
}

function authenticationCookie(request: FastifyRequest): string | undefined {
    return authenticationCookieValue(request.headers.cookie);
}

function rawAuthenticationCookie(request: IncomingMessage): string | undefined {
    return authenticationCookieValue(request.headers.cookie);
}

function authenticationCookieValue(source: string | undefined): string | undefined {
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
    delete headers.forwarded;
    delete headers["x-forwarded-for"];
    delete headers["x-forwarded-host"];
    delete headers["x-forwarded-port"];
    delete headers["x-forwarded-proto"];
    delete headers["x-happy2-user-id"];
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

function proxyAwareClientIp(request: IncomingMessage, trustedProxyHops: number): string {
    const remote = request.socket.remoteAddress ?? "127.0.0.1";
    if (trustedProxyHops <= 0) return remote;
    const forwarded = request.headers["x-forwarded-for"];
    const values = (Array.isArray(forwarded) ? forwarded.join(",") : (forwarded ?? ""))
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
    const chain = [...values, remote];
    return chain[Math.max(0, chain.length - 1 - trustedProxyHops)] ?? remote;
}

function proxyAwareProtocol(request: IncomingMessage, trustedProxyHops: number): string {
    if (trustedProxyHops > 0) {
        const forwarded = request.headers["x-forwarded-proto"];
        const protocol = (Array.isArray(forwarded) ? forwarded.at(-1) : forwarded)
            ?.split(",")
            .at(-1)
            ?.trim()
            .toLowerCase();
        if (protocol === "http" || protocol === "https") return protocol;
    }
    return request.socket instanceof TLSSocket && request.socket.encrypted ? "https" : "http";
}

function rejectWebSocketUpgrade(
    socket: Duplex,
    status: number,
    headers: Record<string, string> = {},
): void {
    if (socket.destroyed) return;
    const text =
        status === 400
            ? "Bad Request"
            : status === 401
              ? "Unauthorized"
              : status === 404
                ? "Not Found"
                : status === 429
                  ? "Too Many Requests"
                  : status === 409
                    ? "Conflict"
                    : status === 503
                      ? "Service Unavailable"
                      : "Internal Server Error";
    const responseHeaders = Object.entries(headers)
        .map(([name, value]) => `${name}: ${value}\r\n`)
        .join("");
    socket.end(
        `HTTP/1.1 ${status} ${text}\r\n${responseHeaders}Connection: close\r\nContent-Length: 0\r\n\r\n`,
    );
}

function handled(reply: FastifyReply, error: unknown, response: "json" | "page" = "json") {
    const portShareError = normalizePortShareError(error);
    if (!portShareError) throw error;
    const statusCode = portShareErrorStatus(portShareError);
    if (response === "page") return portShareErrorPageSend(reply, statusCode);
    return reply
        .code(statusCode)
        .send({ error: portShareError.code, message: portShareError.message });
}

function portShareErrorStatus(error: PortShareError): number {
    return error.code === "not_found"
        ? 404
        : error.code === "invalid"
          ? 400
          : error.code === "conflict"
            ? 409
            : error.code === "not_ready"
              ? 503
              : 401;
}

function upstreamFailureStatus(error: Error): number {
    const statusCode =
        "statusCode" in error && typeof error.statusCode === "number"
            ? error.statusCode
            : undefined;
    return statusCode === 503 || statusCode === 504 ? statusCode : 502;
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
