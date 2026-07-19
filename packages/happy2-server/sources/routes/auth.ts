import type { FastifyInstance, FastifyRequest } from "fastify";
import type { ServerConfig } from "../modules/config/type.js";
import { supportedAuthMethods } from "../modules/auth/methods.js";
import { AuthService } from "../modules/auth/service.js";
import type { User } from "../modules/user/types.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { permissionGetEffective } from "../modules/permission/permissionGetEffective.js";
import { setupGetRegistrationAvailability } from "../modules/setup/index.js";

export function registerAuthRoutes(
    app: FastifyInstance,
    config: ServerConfig,
    auth: AuthService,
    executor: DrizzleExecutor,
    onProfileCreated?: (request: FastifyRequest, user: User) => Promise<void>,
): void {
    app.get("/v0/auth/methods", async () => {
        const methods = supportedAuthMethods(config);
        const registration = await setupGetRegistrationAvailability(executor);
        return {
            ...methods,
            ...(methods.method === "password" ? { signupEnabled: registration !== "closed" } : {}),
            registration,
        };
    });
    app.get("/v0/auth/session", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        if (!current.session)
            return {
                user: current.user,
                authentication: "cloudflare_access",
                expiresAt: current.cloudflareAccess!.expiresAt.toISOString(),
            };
        return {
            user: current.user,
            sessionId: current.session.id,
            expiresAt: current.session.expiresAt.toISOString(),
        };
    });
    /* This intentionally has its own route rather than overloading `/v0/me`:
       the web gateway calls it exactly once while turning a verified bearer into
       its HttpOnly browser cookie. Its response is the initial authenticated
       workspace identity, so a profile-less account remains unauthorized. */
    app.get("/v0/auth/web/session", async (request, reply) => {
        const current = await auth.authenticate(request);
        return current
            ? {
                  user: current.user,
                  permissions: await permissionGetEffective(executor, current.user.id),
              }
            : reply.code(401).send({ error: "unauthorized" });
    });
    if (config.server.role === "api") return;

    if (config.auth.devTokens.enabled) {
        app.post("/v0/me/createDevToken", async (request, reply) => {
            const result = await auth.createDevToken(request);
            if (!result) return reply.code(401).send({ error: "unauthorized" });
            return reply.code(201).send({
                token: result.token,
                sessionId: result.session.id,
                expiresAt: result.session.expiresAt.toISOString(),
            });
        });
    }

    if (config.auth.password.enabled) {
        app.post("/v0/auth/password/register", async (request, reply) => {
            try {
                const result = await auth.registerPassword(request.body, request);
                if (result === "invalid")
                    return reply.code(400).send({ error: "invalid_credentials" });
                if (result === "registration_closed")
                    return reply.code(403).send({ error: "registration_closed" });
                if (result === "account_exists")
                    return reply.code(409).send({ error: "account_exists" });
                return reply.code(201).send(result);
            } catch (error: unknown) {
                if (isUniqueConstraint(error))
                    return reply.code(409).send({ error: "account_exists" });
                throw error;
            }
        });
        app.post("/v0/auth/password/login", async (request, reply) => {
            const result = await auth.loginPassword(request.body, request);
            return result ? result : reply.code(401).send({ error: "invalid_credentials" });
        });
    }

    app.post("/v0/me/createProfile", async (request, reply) => {
        try {
            const result = await auth.createProfile(request.body, request);
            if (result === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
            if (result === "invalid") return reply.code(400).send({ error: "invalid_profile" });
            if (result === "registration_closed")
                return reply.code(403).send({ error: "registration_closed" });
            await onProfileCreated?.(request, result);
            return reply.code(201).send({ user: result });
        } catch (error: unknown) {
            if (isUniqueConstraint(error))
                return reply.code(409).send({ error: "profile_exists_or_username_taken" });
            throw error;
        }
    });
    app.post("/v0/me/updateProfile", async (request, reply) => {
        try {
            const result = await auth.updateProfile(request.body, request);
            if (result === "unauthorized") return reply.code(401).send({ error: "unauthorized" });
            if (result === "invalid") return reply.code(400).send({ error: "invalid_profile" });
            return { user: result };
        } catch (error: unknown) {
            if (isUniqueConstraint(error)) return reply.code(409).send({ error: "username_taken" });
            throw error;
        }
    });

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
            if (result === "registration_closed")
                return reply.code(403).send({ error: "registration_closed" });
            return result;
        });
    }
    app.post("/v0/auth/refresh", async (request, reply) => {
        const result = await auth.refresh(request);
        return result ? result : reply.code(401).send({ error: "unauthorized" });
    });
    app.post("/v0/auth/logout", async (request, reply) => {
        const result = await auth.logout(request);
        if (result === "managed_by_cloudflare_access")
            return reply.code(409).send({ error: "cloudflare_access_manages_session" });
        return result ? reply.code(204).send() : reply.code(401).send({ error: "unauthorized" });
    });
}

/** Drizzle wraps libSQL errors, so inspect the bounded cause chain as well. */
function isUniqueConstraint(error: unknown): boolean {
    const visited = new Set<object>();
    let current = error;
    for (
        let depth = 0;
        depth < 8 && current && typeof current === "object" && !visited.has(current);
        depth += 1
    ) {
        visited.add(current);
        const details = current as {
            code?: unknown;
            extendedCode?: unknown;
            message?: unknown;
            cause?: unknown;
        };
        const code = String(details.code ?? "");
        const extendedCode = String(details.extendedCode ?? "");
        const message = String(details.message ?? "");
        if (
            code === "SQLITE_CONSTRAINT_UNIQUE" ||
            extendedCode === "SQLITE_CONSTRAINT_UNIQUE" ||
            (code === "SQLITE_CONSTRAINT" && /\bUNIQUE constraint failed\b/i.test(message))
        )
            return true;
        current = details.cause;
    }
    return false;
}
