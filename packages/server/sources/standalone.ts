import { access } from "node:fs/promises";
import { join } from "node:path";
import Fastify, { type FastifyInstance } from "fastify";
import proxy from "@fastify/http-proxy";
import staticFiles from "@fastify/static";
import { TokenService } from "./modules/auth/tokens.js";
import type { ServerConfig } from "./modules/config/type.js";
import { Database } from "./modules/database.js";
import { buildServer } from "./server.js";

export interface StandaloneHappy2 extends AsyncDisposable {
    /** Actual bound public URL. This differs from config.server.publicUrl when port 0 is used. */
    url: string;
    close(): Promise<void>;
}

export interface StandaloneOptions {
    logger?: boolean;
    webRoot?: string;
}

/** Starts the private API server and the public web/static reverse proxy. */
export async function startStandaloneHappy2(
    config: ServerConfig,
    options: StandaloneOptions = {},
): Promise<StandaloneHappy2> {
    const webRoot = options.webRoot ?? join(import.meta.dirname, "web");
    await access(join(webRoot, "index.html"));

    const database = new Database(
        config.database.url,
        config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
    );
    let backend: FastifyInstance | undefined;
    let gateway: FastifyInstance | undefined;
    try {
        await database.migrate();
        const backendConfig: ServerConfig = {
            ...config,
            server: {
                ...config.server,
                host: "127.0.0.1",
                port: 0,
                // Only the gateway can reach this loopback listener. It supplies one
                // sanitized forwarding hop after applying the configured outer boundary.
                trustedProxyHops: 1,
            },
        };
        backend = await buildServer(backendConfig, {
            database,
            tokens: await TokenService.create(backendConfig),
            logger: options.logger,
        });
        const backendUrl = await backend.listen({ host: "127.0.0.1", port: 0 });

        gateway = Fastify({
            logger: options.logger ?? true,
            trustProxy: config.server.trustedProxyHops,
        });
        await gateway.register(proxy, {
            upstream: backendUrl,
            prefix: "/v0",
            rewritePrefix: "/v0",
            httpMethods: ["GET", "POST"],
            replyOptions: {
                rewriteRequestHeaders: (request, headers) => ({
                    ...headers,
                    "x-forwarded-for": request.ip,
                    "x-forwarded-host": request.host ?? "",
                    "x-forwarded-proto": request.protocol,
                }),
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
        const url = await gateway.listen({ host: config.server.host, port: config.server.port });

        let closed = false;
        const close = async () => {
            if (closed) return;
            closed = true;
            try {
                await gateway?.close();
            } finally {
                try {
                    await backend?.close();
                } finally {
                    database.close();
                }
            }
        };
        return {
            url,
            close,
            async [Symbol.asyncDispose]() {
                await close();
            },
        };
    } catch (error) {
        await gateway?.close().catch(() => undefined);
        await backend?.close().catch(() => undefined);
        database.close();
        throw error;
    }
}
