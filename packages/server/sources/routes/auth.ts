import type { FastifyInstance } from "fastify";
import type { ServerConfig } from "../modules/config/type.js";
import { supportedAuthMethods } from "../modules/auth/methods.js";
import { AuthService } from "../modules/auth/service.js";

export function registerAuthRoutes(
    app: FastifyInstance,
    config: ServerConfig,
    auth: AuthService,
): void {
    app.get("/v0/auth/methods", async () => supportedAuthMethods(config));
    app.get("/v0/auth/session", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        return {
            userId: current.userId,
            sessionId: current.session.id,
            expiresAt: current.session.expiresAt.toISOString(),
        };
    });
    if (config.server.role === "api") return;

    if (config.auth.password.enabled) {
        app.post("/v0/auth/password/register", async (request, reply) => {
            if (!config.auth.password.signupEnabled)
                return reply.code(404).send({ error: "not_found" });
            try {
                const result = await auth.registerPassword(request.body, request);
                return result === "invalid"
                    ? reply.code(400).send({ error: "invalid_credentials" })
                    : reply.code(201).send(result);
            } catch (error: unknown) {
                if ((error as { code?: string }).code === "SQLITE_CONSTRAINT_UNIQUE")
                    return reply.code(409).send({ error: "account_exists" });
                throw error;
            }
        });
        app.post("/v0/auth/password/login", async (request, reply) => {
            const result = await auth.loginPassword(request.body, request);
            return result ? result : reply.code(401).send({ error: "invalid_credentials" });
        });
    }

    if (config.auth.magicLink.enabled) {
        app.post("/v0/auth/magic-link/request", async (request, reply) => {
            await auth.requestMagicLink(request.body);
            return reply.code(202).send({ accepted: true });
        });
        app.post("/v0/auth/magic-link/verify", async (request, reply) => {
            const result = await auth.verifyMagicLink(request.body, request);
            return result ? result : reply.code(401).send({ error: "invalid_magic_link" });
        });
    }

    app.get("/v0/auth/oidc/:provider/start", async (request, reply) => {
        const provider = (request.params as { provider?: string }).provider;
        const url = provider ? await auth.startOidc(provider) : undefined;
        return url ? reply.redirect(url) : reply.code(404).send({ error: "not_found" });
    });
    for (const provider of config.auth.oidc.values()) {
        app.get(provider.redirectPath, async (request, reply) => {
            const result = await auth.completeOidc(
                provider.id,
                request.query as { code?: string; state?: string; error?: string },
                request,
            );
            if (result === "authorization_failed")
                return reply.code(401).send({ error: "oidc_authorization_failed" });
            if (result === "invalid_state")
                return reply.code(401).send({ error: "invalid_oidc_state" });
            return result;
        });
    }
    app.post("/v0/auth/refresh", async (request, reply) => {
        const result = await auth.refresh(request);
        return result ? result : reply.code(401).send({ error: "unauthorized" });
    });
    app.post("/v0/auth/logout", async (request, reply) => {
        return (await auth.logout(request))
            ? reply.code(204).send()
            : reply.code(401).send({ error: "unauthorized" });
    });
}
