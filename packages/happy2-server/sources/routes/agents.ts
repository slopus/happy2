import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AgentService } from "../modules/agents/index.js";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/collaboration/types.js";

const MAX_ID_LENGTH = 128;
const MAX_IMAGE_NAME_LENGTH = 100;
const MAX_DOCKERFILE_BYTES = 256 * 1024;
const MAX_SECRET_DESCRIPTION_LENGTH = 1_000;
const MAX_SECRET_ENVIRONMENT_BYTES = 512 * 1024;
const MAX_SECRET_ENVIRONMENT_VARIABLES = 128;
const MAX_AGENT_EFFORT_LENGTH = 32;
const SECRET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/u;
const ENVIRONMENT_VARIABLE_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/u;

export function registerAgentRoutes(
    app: FastifyInstance,
    auth: AuthService,
    agents: AgentService,
): void {
    app.get(
        "/v0/agents/:agentUserId/effort",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyQuery(request);
            return agents.getAgentEffort({
                actorUserId,
                agentUserId: pathId(request, "agentUserId"),
            });
        }),
    );

    app.post(
        "/v0/agents/:agentUserId/changeEffort",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["effort"]);
            return agents.changeAgentEffort({
                actorUserId,
                agentUserId: pathId(request, "agentUserId"),
                effort: requiredString(body, "effort", MAX_AGENT_EFFORT_LENGTH),
            });
        }),
    );

    app.get(
        "/v0/admin/agentSecrets",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyQuery(request);
            return agents.listAgentSecrets(actorUserId);
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/createSecret",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["id", "description", "environment"]);
            const result = await agents.createAgentSecret({
                actorUserId,
                id: secretIdField(body, "id"),
                description: requiredString(body, "description", MAX_SECRET_DESCRIPTION_LENGTH),
                environment: secretEnvironment(body),
            });
            return reply.code(201).send(result);
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/:secretId/deleteSecret",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            return agents.deleteAgentSecret({
                actorUserId,
                secretId: secretPathId(request),
            });
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/:secretId/attachToAgent",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["agentUserId"]);
            return agents.attachAgentSecretToAgent({
                actorUserId,
                secretId: secretPathId(request),
                agentUserId: idField(body, "agentUserId"),
            });
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/:secretId/detachFromAgent",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["agentUserId"]);
            return agents.detachAgentSecretFromAgent({
                actorUserId,
                secretId: secretPathId(request),
                agentUserId: idField(body, "agentUserId"),
            });
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/:secretId/attachToChannel",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["channelId"]);
            return agents.attachAgentSecretToChannel({
                actorUserId,
                secretId: secretPathId(request),
                channelId: idField(body, "channelId"),
            });
        }),
    );

    app.post(
        "/v0/admin/agentSecrets/:secretId/detachFromChannel",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["channelId"]);
            return agents.detachAgentSecretFromChannel({
                actorUserId,
                secretId: secretPathId(request),
                channelId: idField(body, "channelId"),
            });
        }),
    );

    app.get(
        "/v0/admin/agentImages",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyQuery(request);
            return agents.listAgentImages(actorUserId);
        }),
    );

    app.get(
        "/v0/admin/agentImages/:imageId",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyQuery(request);
            return {
                image: await agents.getAgentImage(actorUserId, pathId(request, "imageId")),
            };
        }),
    );

    app.post(
        "/v0/admin/agents/:agentUserId/changeImage",
        authenticated(auth, async (request, _reply, actorUserId) => {
            const body = requestBody(request, ["imageId"]);
            return agents.changeAgentImage({
                actorUserId,
                agentUserId: pathId(request, "agentUserId"),
                imageId: idField(body, "imageId"),
            });
        }),
    );

    app.post(
        "/v0/admin/agentImages/createImage",
        authenticated(auth, async (request, reply, actorUserId) => {
            const body = requestBody(request, ["name", "dockerfile"]);
            const image = await agents.createAgentImage({
                actorUserId,
                name: requiredString(body, "name", MAX_IMAGE_NAME_LENGTH),
                dockerfile: dockerfile(body),
            });
            return reply.code(202).send({ image });
        }),
    );

    app.post(
        "/v0/admin/agentImages/:imageId/buildImage",
        authenticated(auth, async (request, reply, actorUserId) => {
            emptyBody(request);
            const image = await agents.requestAgentImageBuild({
                actorUserId,
                imageId: pathId(request, "imageId"),
            });
            return reply.code(202).send({ image });
        }),
    );

    app.post(
        "/v0/admin/agentImages/:imageId/setDefaultImage",
        authenticated(auth, async (request, _reply, actorUserId) => {
            emptyBody(request);
            const image = await agents.setDefaultAgentImage({
                actorUserId,
                imageId: pathId(request, "imageId"),
            });
            return { defaultImageId: image.id, image };
        }),
    );
}

type AuthenticatedHandler = (
    request: FastifyRequest,
    reply: FastifyReply,
    actorUserId: string,
) => Promise<unknown>;

function authenticated(auth: AuthService, handler: AuthenticatedHandler) {
    return async (request: FastifyRequest, reply: FastifyReply): Promise<unknown> => {
        const current = await auth.authenticate(request);
        if (!current) return reply.code(401).send({ error: "unauthorized" });
        try {
            return await handler(request, reply, current.user.id);
        } catch (error) {
            if (error instanceof InvalidRequest)
                return reply.code(400).send({ error: "invalid_request", message: error.message });
            if (error instanceof CollaborationError)
                return reply
                    .code(collaborationStatus(error.code))
                    .send({ error: error.code, message: error.message });
            throw error;
        }
    };
}

function requestBody(request: FastifyRequest, allowed: readonly string[]): Record<string, unknown> {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body))
        throw new InvalidRequest("A JSON object body is required");
    const body = request.body as Record<string, unknown>;
    const unexpected = Object.keys(body).find((key) => !allowed.includes(key));
    if (unexpected) throw new InvalidRequest(`Unexpected field: ${unexpected}`);
    return body;
}

function emptyBody(request: FastifyRequest): void {
    if (request.body === undefined || request.body === null) return;
    if (
        typeof request.body !== "object" ||
        Array.isArray(request.body) ||
        Object.keys(request.body as object).length > 0
    )
        throw new InvalidRequest("Request body must be empty");
}

function emptyQuery(request: FastifyRequest): void {
    if (Object.keys((request.query ?? {}) as object).length > 0)
        throw new InvalidRequest("Query parameters are not supported");
}

function requiredString(body: Record<string, unknown>, key: string, max: number): string {
    const value = body[key];
    if (typeof value !== "string" || !value.trim())
        throw new InvalidRequest(`${key} must be a non-empty string`);
    const trimmed = value.trim();
    if (trimmed.length > max) throw new InvalidRequest(`${key} is too long`);
    return trimmed;
}

function dockerfile(body: Record<string, unknown>): string {
    const value = body.dockerfile;
    if (typeof value !== "string" || !value.trim())
        throw new InvalidRequest("dockerfile must be a non-empty string");
    if (Buffer.byteLength(value, "utf8") > MAX_DOCKERFILE_BYTES)
        throw new InvalidRequest("dockerfile exceeds the 256 KiB limit");
    return value;
}

function secretIdField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== "string" || !SECRET_ID_PATTERN.test(value))
        throw new InvalidRequest(
            `${key} must be 1-128 characters using letters, numbers, periods, underscores, colons, or hyphens`,
        );
    return value;
}

function idField(body: Record<string, unknown>, key: string): string {
    const value = body[key];
    if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH)
        throw new InvalidRequest(`${key} is invalid`);
    return value;
}

function secretEnvironment(body: Record<string, unknown>): Record<string, string> {
    const value = body.environment;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new InvalidRequest("environment must be an object of variable names and values");
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) throw new InvalidRequest("environment must not be empty");
    if (entries.length > MAX_SECRET_ENVIRONMENT_VARIABLES)
        throw new InvalidRequest(
            `environment may contain at most ${MAX_SECRET_ENVIRONMENT_VARIABLES} variables`,
        );
    const normalizedNames = new Set<string>();
    const environment: Record<string, string> = {};
    for (const [name, secret] of entries) {
        if (!ENVIRONMENT_VARIABLE_PATTERN.test(name))
            throw new InvalidRequest(`environment contains an invalid variable name: ${name}`);
        const normalizedName = name.toUpperCase();
        if (normalizedNames.has(normalizedName))
            throw new InvalidRequest("environment variable names must be unique ignoring case");
        normalizedNames.add(normalizedName);
        if (typeof secret !== "string")
            throw new InvalidRequest(`environment variable ${name} must have a text value`);
        if (secret.includes("\0"))
            throw new InvalidRequest(`environment variable ${name} cannot contain a null byte`);
        environment[name] = secret;
    }
    if (Buffer.byteLength(JSON.stringify(environment), "utf8") > MAX_SECRET_ENVIRONMENT_BYTES)
        throw new InvalidRequest("environment exceeds the 512 KiB limit");
    return environment;
}

function secretPathId(request: FastifyRequest): string {
    const value = (request.params as Record<string, unknown>).secretId;
    if (typeof value !== "string" || !SECRET_ID_PATTERN.test(value))
        throw new InvalidRequest("secretId is invalid");
    return value;
}

function pathId(request: FastifyRequest, key: string): string {
    const value = (request.params as Record<string, unknown>)[key];
    if (typeof value !== "string" || !value || value.length > MAX_ID_LENGTH)
        throw new InvalidRequest(`${key} is invalid`);
    return value;
}

function collaborationStatus(code: CollaborationError["code"]): 400 | 403 | 404 | 409 {
    switch (code) {
        case "invalid":
            return 400;
        case "forbidden":
            return 403;
        case "not_found":
            return 404;
        case "conflict":
        case "future_state":
        case "generation_mismatch":
            return 409;
    }
}

class InvalidRequest extends Error {}
