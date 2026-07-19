import { access } from "node:fs/promises";
import { join } from "node:path";
import Fastify from "fastify";
import proxy from "@fastify/http-proxy";
import staticFiles from "@fastify/static";
import type { RunningHappy2 } from "./backend.js";
import { authenticationCookieName } from "./modules/auth/metadata.js";

export interface WebOptions {
    backendUrl: string;
    host?: string;
    logger?: boolean;
    port?: number;
    trustedProxyHops?: number;
    webRoot?: string;
}

/** Serves the Happy (2) SPA and proxies its versioned API to a separate backend origin. */
export async function startWebHappy2(options: WebOptions): Promise<RunningHappy2> {
    const backendUrl = normalizedBackendUrl(options.backendUrl);
    const webRoot = options.webRoot ?? join(import.meta.dirname, "web");
    await access(join(webRoot, "index.html"));

    const gateway = Fastify({
        logger: options.logger ?? true,
        trustProxy: options.trustedProxyHops ?? 0,
    });
    try {
        gateway.get("/v0/auth/web/session", async (request, reply) => {
            const response = await fetch(`${backendUrl}/v0/me`, {
                headers: backendRequestHeaders(request),
            });
            const token = webAuthorizationToken(request.headers.authorization);
            if (response.ok && token)
                reply.header(
                    "set-cookie",
                    authenticationCookie(token, request.protocol === "https"),
                );
            const contentType = response.headers.get("content-type");
            if (contentType) reply.type(contentType);
            return reply.code(response.status).send(Buffer.from(await response.arrayBuffer()));
        });
        await gateway.register(proxy, {
            upstream: backendUrl,
            prefix: "/v0",
            rewritePrefix: "/v0",
            httpMethods: ["GET", "POST"],
            replyOptions: {
                rewriteRequestHeaders: (request, headers) => {
                    const forwarded = { ...headers };
                    delete forwarded["x-forwarded-host"];
                    return {
                        ...forwarded,
                        "x-forwarded-for": request.ip,
                        "x-forwarded-proto": request.protocol,
                        ...(request.host ? { "x-forwarded-host": request.host } : {}),
                    };
                },
            },
        });
        await gateway.register(staticFiles, {
            root: webRoot,
            wildcard: false,
            index: "index.html",
        });
        gateway.setNotFoundHandler((request, reply) => {
            if (
                (request.method === "GET" || request.method === "HEAD") &&
                !request.url.startsWith("/v0") &&
                request.headers.accept?.includes("text/html")
            ) {
                return reply.type("text/html; charset=utf-8").sendFile("index.html");
            }
            return reply.code(404).send({ error: "not_found" });
        });
        const url = await gateway.listen({
            host: options.host ?? "127.0.0.1",
            port: options.port ?? 3000,
        });
        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            await gateway.close();
        };
        return {
            url,
            close,
            async [Symbol.asyncDispose]() {
                await close();
            },
        };
    } catch (error) {
        await gateway.close().catch(() => undefined);
        throw error;
    }
}

function backendRequestHeaders(request: {
    headers: Record<string, string | string[] | undefined>;
    host?: string;
    ip: string;
    protocol: string;
}): Headers {
    const headers = new Headers();
    for (const [name, value] of Object.entries(request.headers)) {
        if (value === undefined) continue;
        headers.set(name, Array.isArray(value) ? value.join(", ") : value);
    }
    headers.delete("host");
    headers.delete("x-forwarded-host");
    headers.set("x-forwarded-for", request.ip);
    headers.set("x-forwarded-proto", request.protocol);
    if (request.host) headers.set("x-forwarded-host", request.host);
    return headers;
}

function webAuthorizationToken(value: string | undefined): string | undefined {
    const token = value?.match(/^Bearer +(.+)$/i)?.[1];
    return token?.match(/^[A-Za-z0-9._-]{1,4096}$/) ? token : undefined;
}

function authenticationCookie(token: string, secure: boolean): string {
    return [
        `${authenticationCookieName}=${token}`,
        "HttpOnly",
        "Path=/",
        "SameSite=Strict",
        "Max-Age=34560000",
        ...(secure ? ["Secure"] : []),
    ].join("; ");
}

function normalizedBackendUrl(value: string): string {
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        throw new Error("Happy (2) web backend URL must be an absolute HTTP(S) URL.");
    }
    if (
        (url.protocol !== "http:" && url.protocol !== "https:") ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
    ) {
        throw new Error(
            "Happy (2) web backend URL must be an HTTP(S) origin without credentials, path, query, or fragment.",
        );
    }
    return url.origin;
}
