import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from "fastify";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { pluginInstallationListForHost } from "../modules/plugin/pluginInstallationListForHost.js";
import type { PluginService } from "../modules/plugin/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import {
    PluginError,
    pluginHostPermissions,
    type PluginHostPermission,
} from "../modules/plugin/types.js";

/** Builds the capability-only HTTP surface exposed to local plugin containers. */
export function createPluginHostApi(
    executor: DrizzleExecutor,
    plugins: PluginService,
    logger: boolean,
): FastifyInstance {
    const app = Fastify({ logger });
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

function only(value: Record<string, unknown>, allowed: readonly string[]): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new PluginHostRequestError(`Unexpected request field ${unexpected}`);
}

function handled(reply: FastifyReply, error: unknown) {
    if (error instanceof PluginError)
        return reply
            .code(error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400)
            .send({ error: error.code, message: error.message });
    if (error instanceof CollaborationError)
        return reply
            .code(error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400)
            .send({ error: error.code, message: error.message });
    if (error instanceof PluginHostRequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    return undefined;
}

class PluginHostRequestError extends Error {}
