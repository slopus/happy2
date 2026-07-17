import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import {
    SetupError,
    setupChooseRegistrationPolicy,
    setupGetCombinedStatus,
    setupGetPublicStatus,
    setupSandboxProviderGetSelected,
    setupSandboxProviderSelect,
    type SetupSyncHint,
    type UserOnboardingStep,
} from "../modules/setup/index.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { realtimeTopics, type PubSub } from "../modules/realtime/index.js";
import { userOnboardingUpdateStep } from "../modules/user/userOnboardingUpdateStep.js";
import type { SandboxProviderCatalog } from "../modules/sandbox/index.js";

export function registerSetupRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    pubsub: PubSub,
    sandboxProviders: SandboxProviderCatalog,
): void {
    app.get("/v0/setup/status", async () => setupGetPublicStatus(executor));

    app.get("/v0/setup", async (request, reply) => {
        const current = await auth.authenticateAccount(request);
        if (!current) return unauthorized(reply);
        return setupGetCombinedStatus(executor, current.accountId);
    });

    app.get("/v0/setup/sandboxProviders", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        const onboarding = await setupGetCombinedStatus(executor, current.accountId);
        if (!onboarding.server.canManage)
            return reply.code(403).send({
                error: "forbidden",
                message: "Server administrator permission is required",
            });
        const [discovery, selected] = await Promise.all([
            sandboxProviders.discover(),
            setupSandboxProviderGetSelected(executor),
        ]);
        return {
            ...discovery,
            ...(selected ? { selectedProviderId: selected.id } : {}),
        };
    });

    app.post("/v0/setup/selectSandboxProvider", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const onboarding = await setupGetCombinedStatus(executor, current.accountId);
            if (!onboarding.server.canManage)
                throw new SetupError("forbidden", "Server administrator permission is required");
            const body = requestBody(request, ["providerId"]);
            if (typeof body.providerId !== "string")
                throw new SetupError("invalid", "providerId must be a string");
            const provider = sandboxProviders.get(body.providerId);
            if (!provider) throw new SetupError("not_found", "Sandbox provider was not found");
            const status = await provider.probe();
            if (status.health !== "healthy")
                return reply.code(409).send({
                    error: "sandbox_provider_unavailable",
                    message: `${status.displayName} is not ready for agent code execution`,
                    provider: status,
                });
            const hint = await setupSandboxProviderSelect(executor, current.user.id, {
                id: provider.id,
                version: status.version,
            });
            if (hint) await publishServerHint(request, pubsub, hint);
            return {
                provider: status,
                onboarding: await setupGetCombinedStatus(executor, current.accountId),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/me/updateOnboardingStep", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = requestBody(request, ["step", "state"]);
            const step = onboardingStep(body.step);
            const state = onboardingOutcome(body.state);
            const hint = await userOnboardingUpdateStep(executor, {
                userId: current.user.id,
                step,
                state,
            });
            if (hint) await publishUserHint(request, pubsub, current.user.id, hint);
            return {
                onboarding: await setupGetCombinedStatus(executor, current.accountId),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/setup/chooseRegistrationPolicy", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = requestBody(request, ["enabled"]);
            if (typeof body.enabled !== "boolean")
                throw new SetupError("invalid", "enabled must be a boolean");
            const hint = await setupChooseRegistrationPolicy(
                executor,
                current.user.id,
                body.enabled,
            );
            if (hint) await publishServerHint(request, pubsub, hint);
            return {
                onboarding: await setupGetCombinedStatus(executor, current.accountId),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });
}

async function publishServerHint(
    request: FastifyRequest,
    pubsub: PubSub,
    hint: SetupSyncHint,
): Promise<void> {
    try {
        await pubsub.publish(realtimeTopics.server, { type: "sync", ...hint });
    } catch (error) {
        request.log.warn({ err: error }, "Could not publish setup sync hint");
    }
}

async function publishUserHint(
    request: FastifyRequest,
    pubsub: PubSub,
    userId: string,
    hint: SetupSyncHint,
): Promise<void> {
    try {
        await pubsub.publish(realtimeTopics.user(userId), { type: "sync", ...hint });
    } catch (error) {
        request.log.warn({ err: error }, "Could not publish user onboarding sync hint");
    }
}

function requestBody(
    request: FastifyRequest,
    allowedKeys: readonly string[],
): Record<string, unknown> {
    const body = request.body;
    if (!body || typeof body !== "object" || Array.isArray(body))
        throw new SetupError("invalid", "Request body must be an object");
    const record = body as Record<string, unknown>;
    const unexpected = Object.keys(record).find((key) => !allowedKeys.includes(key));
    if (unexpected) throw new SetupError("invalid", `Unexpected field ${unexpected}`);
    return record;
}

function onboardingStep(value: unknown): UserOnboardingStep {
    if (value !== "avatar" && value !== "desktop_notifications")
        throw new SetupError("invalid", "Unsupported onboarding step");
    return value;
}

function onboardingOutcome(value: unknown): "complete" | "skipped" {
    if (value !== "complete" && value !== "skipped")
        throw new SetupError("invalid", "state must be complete or skipped");
    return value;
}

function handledError(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (!(error instanceof SetupError)) return undefined;
    const status = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 }[error.code];
    return reply.code(status).send({ error: error.code, message: error.message });
}

function unauthorized(reply: FastifyReply): FastifyReply {
    return reply.code(401).send({ error: "unauthorized" });
}
