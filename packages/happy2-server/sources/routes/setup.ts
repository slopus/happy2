import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { Authenticated, AuthService } from "../modules/auth/service.js";
import {
    SetupError,
    setupChooseRegistrationPolicy,
    setupCreateDefaultAgent,
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
import type { AgentService } from "../modules/agents/index.js";
import { CollaborationError } from "../modules/chat/types.js";

const MAX_IMAGE_NAME_LENGTH = 100;
const MAX_DOCKERFILE_BYTES = 256 * 1024;

export function registerSetupRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    pubsub: PubSub,
    sandboxProviders: SandboxProviderCatalog,
    agents: AgentService | undefined,
): void {
    app.get("/v0/setup/status", async () => setupGetPublicStatus(executor));

    app.get("/v0/setup", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (current) return setupGetCombinedStatus(executor, setupIdentity(current));
        const account = await auth.authenticateAccount(request);
        if (!account) return unauthorized(reply);
        return setupGetCombinedStatus(executor, { accountId: account.accountId });
    });

    app.get("/v0/setup/sandboxProviders", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        const onboarding = await setupGetCombinedStatus(executor, setupIdentity(current));
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
            const onboarding = await setupGetCombinedStatus(executor, setupIdentity(current));
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
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/setup/baseImages", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            if (!agents) throw new SetupError("conflict", "Agent image builds are disabled");
            return await agents.getSetupBaseImages(current.user.id);
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/setup/selectBaseImage", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            if (!agents) throw new SetupError("conflict", "Agent image builds are disabled");
            const body = requestBody(request, ["builtinKey", "custom"]);
            const selection = baseImageSelection(body);
            const result = await agents.selectSetupBaseImage({
                actorUserId: current.user.id,
                selection,
            });
            const baseImages = await agents.getSetupBaseImages(current.user.id);
            return reply.code(baseImages.selectedImage?.status === "ready" ? 200 : 202).send({
                baseImages,
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                ...(result.hint ? { sync: result.hint } : {}),
            });
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/setup/retryBaseImageBuild", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            if (!agents) throw new SetupError("conflict", "Agent image builds are disabled");
            requestBody(request, []);
            const result = await agents.retrySetupBaseImage(current.user.id);
            return reply.code(202).send({
                baseImages: await agents.getSetupBaseImages(current.user.id),
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                sync: result.hint,
            });
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
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/setup/createDefaultAgent", async (request, reply) => {
        const current = await auth.authenticate(request);
        if (!current) return unauthorized(reply);
        try {
            const body = requestBody(request, ["name", "username"]);
            if (typeof body.name !== "string")
                throw new SetupError("invalid", "name must be a string");
            if (typeof body.username !== "string")
                throw new SetupError("invalid", "username must be a string");
            const result = await setupCreateDefaultAgent(executor, {
                actorUserId: current.user.id,
                name: body.name,
                username: body.username,
            });
            if (result.hint) await publishServerHint(request, pubsub, result.hint);
            const registrationHint = current.local
                ? await setupChooseRegistrationPolicy(executor, current.user.id, false)
                : undefined;
            if (registrationHint) await publishServerHint(request, pubsub, registrationHint);
            return reply.code(result.hint ? 201 : 200).send({
                agent: result.agent,
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                ...((registrationHint ?? result.hint)
                    ? { sync: registrationHint ?? result.hint }
                    : {}),
            });
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
            if (current.local && body.enabled)
                throw new SetupError(
                    "conflict",
                    "Account-free local access cannot enable registration",
                );
            const hint = await setupChooseRegistrationPolicy(
                executor,
                current.user.id,
                body.enabled,
            );
            if (hint) await publishServerHint(request, pubsub, hint);
            return {
                onboarding: await setupGetCombinedStatus(executor, setupIdentity(current)),
                ...(hint ? { sync: hint } : {}),
            };
        } catch (error) {
            return handledError(reply, error) ?? Promise.reject(error);
        }
    });
}

function setupIdentity(current: Authenticated): { accountId: string } | { userId: string } {
    return current.local ? { userId: current.user.id } : { accountId: current.accountId };
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

function baseImageSelection(
    body: Record<string, unknown>,
):
    | { builtinKey: "daycare-full" | "daycare-minimal"; kind: "builtin" }
    | { dockerfile: string; kind: "custom"; name: string } {
    const hasBuiltin = body.builtinKey !== undefined;
    const hasCustom = body.custom !== undefined;
    if (hasBuiltin === hasCustom)
        throw new SetupError("invalid", "Choose exactly one built-in or custom base image");
    if (hasBuiltin) {
        if (body.builtinKey !== "daycare-minimal" && body.builtinKey !== "daycare-full")
            throw new SetupError("invalid", "Unsupported built-in base image");
        return { kind: "builtin", builtinKey: body.builtinKey };
    }
    if (!body.custom || typeof body.custom !== "object" || Array.isArray(body.custom))
        throw new SetupError("invalid", "custom must be an object");
    const custom = body.custom as Record<string, unknown>;
    const unexpected = Object.keys(custom).find((key) => !["name", "dockerfile"].includes(key));
    if (unexpected) throw new SetupError("invalid", `Unexpected custom field ${unexpected}`);
    if (typeof custom.name !== "string" || !custom.name.trim())
        throw new SetupError("invalid", "custom.name must be a non-empty string");
    const name = custom.name.trim();
    if (name.length > MAX_IMAGE_NAME_LENGTH)
        throw new SetupError("invalid", "custom.name is too long");
    if (typeof custom.dockerfile !== "string" || !custom.dockerfile.trim())
        throw new SetupError("invalid", "custom.dockerfile must be a non-empty string");
    if (Buffer.byteLength(custom.dockerfile, "utf8") > MAX_DOCKERFILE_BYTES)
        throw new SetupError("invalid", "custom.dockerfile exceeds the 256 KiB limit");
    return { kind: "custom", name, dockerfile: custom.dockerfile };
}

function handledError(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (error instanceof SetupError) {
        const status = { invalid: 400, forbidden: 403, not_found: 404, conflict: 409 }[error.code];
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    if (error instanceof CollaborationError) {
        const status = {
            invalid: 400,
            forbidden: 403,
            not_found: 404,
            conflict: 409,
            future_state: 409,
            generation_mismatch: 409,
        }[error.code];
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    return undefined;
}

function unauthorized(reply: FastifyReply): FastifyReply {
    return reply.code(401).send({ error: "unauthorized" });
}
