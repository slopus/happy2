import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { pluginInstallationListForHost } from "../modules/plugin/pluginInstallationListForHost.js";
import type { PluginService } from "../modules/plugin/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import type { AgentService } from "../modules/agents/index.js";
import {
    PluginError,
    pluginHostPermissions,
    type PluginHostPermission,
    type PluginUserCapability,
} from "../modules/plugin/types.js";

const MAX_ENVIRONMENT_NAME_LENGTH = 100;
const MAX_DOCKERFILE_BYTES = 256 * 1024;

type PluginHostAgentService = Pick<
    AgentService,
    | "createAgentImage"
    | "deactivateAgentImage"
    | "getAgentImageDockerfileForHost"
    | "listAgentImagesForHost"
    | "prepareTurns"
    | "setDefaultAgentImage"
    | "startTurn"
>;

/** Builds the capability-only HTTP surface exposed to local plugin containers. */
export function createPluginHostApi(
    executor: DrizzleExecutor,
    plugins: PluginService,
    logger: boolean,
    agents?: PluginHostAgentService,
): FastifyInstance {
    const app = Fastify({ logger });
    app.get("/environments", async (request, reply) => {
        try {
            await plugins.authorizeHost(bearerToken(request), "environments:read");
            return requireAgents(agents).listAgentImagesForHost();
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/environments/:environmentId/dockerfile", async (request, reply) => {
        try {
            await plugins.authorizeHost(bearerToken(request), "environments:read");
            const environment = await requireAgents(agents).getAgentImageDockerfileForHost(
                pathIdentifier(request, "environmentId"),
            );
            return { environment };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/environments/createEnvironment", async (request, reply) => {
        try {
            const { installationId: actorInstallationId } = await plugins.authorizeHost(
                bearerToken(request),
                "environments:manage",
            );
            const body = object(request.body, "Request body");
            only(body, ["name", "dockerfile"]);
            const image = await requireAgents(agents).createAgentImage({
                actorInstallationId,
                name: requiredTrimmedString(body.name, "name", MAX_ENVIRONMENT_NAME_LENGTH),
                dockerfile: environmentDockerfile(body.dockerfile),
            });
            return reply.code(202).send({ environment: hostEnvironment(image) });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/environments/:environmentId/setDefaultEnvironment", async (request, reply) => {
        try {
            const { installationId: actorInstallationId } = await plugins.authorizeHost(
                bearerToken(request),
                "environments:manage",
            );
            emptyBody(request.body);
            const image = await requireAgents(agents).setDefaultAgentImage({
                actorInstallationId,
                imageId: pathIdentifier(request, "environmentId"),
            });
            return {
                defaultEnvironmentId: image.id,
                environment: hostEnvironment(image),
            };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/environments/:environmentId/deactivateEnvironment", async (request, reply) => {
        try {
            const { installationId: actorInstallationId } = await plugins.authorizeHost(
                bearerToken(request),
                "environments:deactivate",
            );
            emptyBody(request.body);
            const { imageId } = await requireAgents(agents).deactivateAgentImage({
                actorInstallationId,
                imageId: pathIdentifier(request, "environmentId"),
            });
            return { deactivated: true, environmentId: imageId };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/plugins", async (request, reply) => {
        try {
            const claims = await plugins.authorizeHost(bearerToken(request), "plugins:list");
            return {
                installationId: claims.installationId,
                plugins: await pluginInstallationListForHost(executor),
            };
        } catch (error) {
            if (error instanceof PluginError)
                return reply.code(403).send({ error: "forbidden", message: error.message });
            throw error;
        }
    });
    app.post("/chats/updateChat", async (request, reply) => {
        try {
            return await plugins.chatUpdate(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                chatUpdateInput(request.body),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/plugins/install", async (request, reply) => {
        try {
            const { installationId: actorInstallationId } = await plugins.authorizeHost(
                bearerToken(request),
                "plugins:install",
            );
            const body = object(request.body, "Request body");
            only(body, ["shortName", "variables", "containerImageId", "permissions"]);
            const installation = await plugins.install({
                actorInstallationId,
                shortName: shortName(body.shortName),
                variables: variables(body.variables),
                permissions: permissions(body.permissions),
                ...(body.containerImageId === undefined
                    ? {}
                    : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
            });
            return reply.code(202).send({ installation });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/channels/updateMembers", async (request, reply) => {
        try {
            return await plugins.channelMembersUpdate(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                channelMembersUpdateInput(request.body),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/plugins/uninstall", async (request, reply) => {
        try {
            const { installationId: actorInstallationId } = await plugins.authorizeHost(
                bearerToken(request),
                "plugins:uninstall",
            );
            const body = object(request.body, "Request body");
            only(body, ["installationId"]);
            await plugins.uninstallInstallation({
                actorInstallationId,
                installationId: identifier(body.installationId, "installationId"),
            });
            return { uninstalled: true };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/plugin-install-requests", async (request, reply) => {
        try {
            const claims = await plugins.authorizeHost(
                bearerToken(request),
                "plugins:request-install",
            );
            if (!claims.agentCall)
                throw new PluginError(
                    "forbidden",
                    "Plugin install requests require an active Happy agent call",
                );
            const body = object(request.body, "Request body");
            only(body, ["sourceUrl", "reason"]);
            if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 4_096)
                throw new PluginError("broken_configuration", "sourceUrl must be a plugin ZIP URL");
            const reason = optionalString(body.reason, "reason", 1_000);
            const approval = await plugins.requestInstallLink({
                requesterInstallationId: claims.installationId,
                agentCall: claims.agentCall,
                url: body.sourceUrl,
                ...(reason ? { reason } : {}),
            });
            return reply.code(202).send({ approval });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/plugin-uninstall-requests", async (request, reply) => {
        try {
            const claims = await plugins.authorizeHost(
                bearerToken(request),
                "plugins:request-uninstall",
            );
            if (!claims.agentCall)
                throw new PluginError(
                    "forbidden",
                    "Plugin uninstall requests require an active Happy agent call",
                );
            const body = object(request.body, "Request body");
            only(body, ["installationId", "reason"]);
            const installationId = identifier(body.installationId, "installationId");
            const reason = optionalString(body.reason, "reason", 1_000);
            const approval = await plugins.requestUninstall({
                requesterInstallationId: claims.installationId,
                agentCall: claims.agentCall,
                targetInstallationId: installationId,
                ...(reason ? { reason } : {}),
            });
            return reply.code(202).send({ approval });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/channels/createChannel", async (request, reply) => {
        try {
            const result = await plugins.channelCreate(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                channelCreateInput(request.body),
                agents,
            );
            return reply.code(201).send(result);
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (!reply.sent && !handled(reply, error))
            reply.code(500).send({ error: "internal_server_error" });
    });
    return app;
}

function optionalString(value: unknown, name: string, maximum: number): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string" || !value.trim() || value.length > maximum)
        throw new PluginHostRequestError(
            `${name} must contain between 1 and ${maximum} characters`,
        );
    return value.trim();
}

function requireAgents(agents: PluginHostAgentService | undefined): PluginHostAgentService {
    if (!agents)
        throw new PluginError(
            "broken_configuration",
            "Agent environments are unavailable on this server",
        );
    return agents;
}

function hostEnvironment(image: { builtinKey?: string; id: string; name: string; status: string }) {
    return {
        id: image.id,
        name: image.name,
        status: image.status,
        builtin: image.builtinKey !== undefined,
        active: true,
    };
}

function environmentDockerfile(value: unknown): string {
    if (typeof value !== "string" || !value.trim())
        throw new PluginHostRequestError("dockerfile must be a non-empty string");
    if (Buffer.byteLength(value, "utf8") > MAX_DOCKERFILE_BYTES)
        throw new PluginHostRequestError("dockerfile exceeds the 256 KiB limit");
    return value;
}

function pathIdentifier(request: FastifyRequest, name: string): string {
    return identifier((request.params as Record<string, unknown>)[name], name);
}

function emptyBody(value: unknown): void {
    if (value === undefined || value === null) return;
    if (typeof value !== "object" || Array.isArray(value) || Object.keys(value).length > 0)
        throw new PluginHostRequestError("Request body must be empty");
}

function bearerToken(request: FastifyRequest): string {
    const authorization = request.headers.authorization;
    if (!authorization?.startsWith("Bearer ") || authorization.length > 4_096)
        throw new PluginError("forbidden", "Plugin runtime token is required");
    const token = authorization.slice("Bearer ".length);
    if (!token) throw new PluginError("forbidden", "Plugin runtime token is required");
    return token;
}

function requiredHeader(request: FastifyRequest, name: string, message: string): string {
    const raw = request.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value || value.length > 4_096) throw new PluginError("forbidden", message);
    return value;
}

function chatUpdateInput(value: unknown): { title?: string; description?: string | null } {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new PluginHostRequestError("Request body must be an object");
    const body = value as Record<string, unknown>;
    if (Object.keys(body).some((key) => key !== "title" && key !== "description"))
        throw new PluginHostRequestError("Request body contains an unknown field");
    if (!("title" in body) && !("description" in body))
        throw new PluginHostRequestError("At least one chat field is required");
    let title: string | undefined;
    if ("title" in body) {
        if (typeof body.title !== "string")
            throw new PluginHostRequestError("title must be a string");
        title = body.title.trim();
        if (!title || title.length > 100)
            throw new PluginHostRequestError("title must contain 1-100 characters");
    }
    let description: string | null | undefined;
    if ("description" in body) {
        if (body.description === null) description = null;
        else {
            if (typeof body.description !== "string")
                throw new PluginHostRequestError("description must be a string or null");
            const normalized = body.description.trim();
            if (normalized.length > 500)
                throw new PluginHostRequestError("description must contain at most 500 characters");
            description = normalized || null;
        }
    }
    return {
        ...(title === undefined ? {} : { title }),
        ...(description === undefined ? {} : { description }),
    };
}

function shortName(value: unknown): string {
    if (typeof value !== "string" || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value))
        throw new PluginHostRequestError("shortName is invalid");
    return value;
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== "string" || !value || value.length > 128 || /\s/.test(value))
        throw new PluginHostRequestError(`${name} must be a valid identifier`);
    return value;
}

function variables(value: unknown): Record<string, string> {
    const record = value === undefined ? {} : object(value, "variables");
    if (Object.keys(record).length > 64)
        throw new PluginHostRequestError("variables has too many entries");
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof item !== "string")
            throw new PluginHostRequestError(
                "variables must map environment keys to string values",
            );
        result[key] = item;
    }
    return result;
}

function permissions(value: unknown): PluginHostPermission[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > pluginHostPermissions.length)
        throw new PluginHostRequestError("permissions must be an array");
    const result: PluginHostPermission[] = [];
    for (const permission of value) {
        if (
            typeof permission !== "string" ||
            !pluginHostPermissions.includes(permission as PluginHostPermission)
        )
            throw new PluginHostRequestError("permissions contains an unknown plugin permission");
        if (result.includes(permission as PluginHostPermission))
            throw new PluginHostRequestError(`permissions contains duplicate ${permission}`);
        result.push(permission as PluginHostPermission);
    }
    return result;
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new PluginHostRequestError(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function channelMembersUpdateInput(value: unknown): {
    add: PluginUserCapability[];
    remove: PluginUserCapability[];
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["add", "remove"]);
    const add = userCapabilities(body.add, "add");
    const remove = userCapabilities(body.remove, "remove");
    if (!add.length && !remove.length)
        throw new PluginHostRequestError("At least one user must be added or removed");
    const addIds = new Set(add.map(({ id }) => id));
    if (remove.some(({ id }) => addIds.has(id)))
        throw new PluginHostRequestError("A user cannot be both added and removed");
    return { add, remove };
}

function channelCreateInput(value: unknown): {
    name: string;
    description?: string;
    idempotencyKey?: string;
    members: PluginUserCapability[];
    initialMessage?: { audience: "agents" | "people"; text: string };
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["name", "description", "idempotencyKey", "members", "initialMessage"]);
    const name = requiredTrimmedString(body.name, "name", 100);
    let description: string | undefined;
    if (body.description !== undefined)
        description = requiredTrimmedString(body.description, "description", 500);
    const members = userCapabilities(body.members, "members");
    const idempotencyKey =
        body.idempotencyKey === undefined
            ? undefined
            : requiredToken(body.idempotencyKey, "idempotencyKey", 128);
    let initialMessage: { audience: "agents" | "people"; text: string } | undefined;
    if (body.initialMessage !== undefined) {
        const message = bodyRecord(body.initialMessage, "initialMessage");
        onlyBodyKeys(message, ["audience", "text"], "initialMessage");
        if (message.audience !== "agents" && message.audience !== "people")
            throw new PluginHostRequestError("initialMessage.audience must be agents or people");
        initialMessage = {
            audience: message.audience,
            text: requiredMessageText(message.text),
        };
    }
    return {
        name,
        ...(description ? { description } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        members,
        ...(initialMessage ? { initialMessage } : {}),
    };
}

function userCapabilities(value: unknown, name: string): PluginUserCapability[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 100)
        throw new PluginHostRequestError(`${name} must be an array of at most 100 users`);
    const result = value.map((entry, index) => {
        const capability = bodyRecord(entry, `${name}[${index}]`);
        onlyBodyKeys(capability, ["id", "token"], `${name}[${index}]`);
        return {
            id: requiredToken(capability.id, `${name}[${index}].id`, 128),
            token: requiredToken(capability.token, `${name}[${index}].token`, 4_096),
        };
    });
    if (new Set(result.map(({ id }) => id)).size !== result.length)
        throw new PluginHostRequestError(`${name} contains a duplicate user`);
    return result;
}

function bodyRecord(value: unknown, name = "Request body"): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new PluginHostRequestError(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, allowed: readonly string[]): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new PluginHostRequestError(`Unexpected request field ${unexpected}`);
}

function onlyBodyKeys(
    body: Record<string, unknown>,
    allowed: readonly string[],
    name = "Request body",
): void {
    if (Object.keys(body).some((key) => !allowed.includes(key)))
        throw new PluginHostRequestError(`${name} contains an unknown field`);
}

function requiredTrimmedString(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string") throw new PluginHostRequestError(`${name} must be a string`);
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum || hasControlCharacters(normalized))
        throw new PluginHostRequestError(`${name} must contain 1-${maximum} characters`);
    return normalized;
}

function requiredMessageText(value: unknown): string {
    if (typeof value !== "string")
        throw new PluginHostRequestError("initialMessage.text must be a string");
    if (value.length > 40_000)
        throw new PluginHostRequestError(
            "initialMessage.text must contain at most 40000 characters",
        );
    if (!value.trim() || hasControlCharacters(value, true))
        throw new PluginHostRequestError(
            "initialMessage.text is empty or contains unsupported characters",
        );
    return value;
}

function hasControlCharacters(value: string, allowLineBreaks = false): boolean {
    for (const character of value) {
        const code = character.charCodeAt(0);
        if (code === 127 || (code < 32 && !(allowLineBreaks && (code === 9 || code === 10))))
            return true;
    }
    return false;
}

function requiredToken(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string" || !value || value.length > maximum)
        throw new PluginHostRequestError(`${name} must contain 1-${maximum} characters`);
    return value;
}

function handled(reply: FastifyReply, error: unknown) {
    if (error instanceof PluginError)
        return reply
            .code(
                error.code === "not_found"
                    ? 404
                    : error.code === "forbidden"
                      ? 403
                      : error.code === "not_ready"
                        ? 503
                        : error.code === "conflict"
                          ? 409
                          : 400,
            )
            .send({
                error: error.code,
                message: error.message,
            });
    if (error instanceof CollaborationError)
        return reply
            .code(
                error.code === "not_found"
                    ? 404
                    : error.code === "forbidden"
                      ? 403
                      : error.code === "conflict"
                        ? 409
                        : 400,
            )
            .send({ error: error.code, message: error.message });
    if (error instanceof PluginHostRequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    return undefined;
}

class PluginHostRequestError extends Error {}
