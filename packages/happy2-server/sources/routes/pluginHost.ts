import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { pluginInstallationListForHost } from "../modules/plugin/pluginInstallationListForHost.js";
import type { PluginService } from "../modules/plugin/service.js";
import { PluginError } from "../modules/plugin/types.js";
import { CollaborationError } from "../modules/chat/types.js";

/** Builds the capability-only HTTP surface exposed to local plugin containers. */
export function createPluginHostApi(
    executor: DrizzleExecutor,
    plugins: PluginService,
    logger: boolean,
): FastifyInstance {
    const app = Fastify({ logger });
    app.get("/plugins", async (request, reply) => {
        try {
            const installationId = await plugins.authorizeHost(
                bearerToken(request),
                "plugins:list",
            );
            return {
                installationId,
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
    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (!reply.sent && !handled(reply, error))
            reply.code(500).send({ error: "internal_server_error" });
    });
    return app;
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

function handled(reply: import("fastify").FastifyReply, error: unknown) {
    if (error instanceof PluginError)
        return reply.code(error.code === "not_found" ? 404 : 403).send({
            error: error.code,
            message: error.message,
        });
    if (error instanceof CollaborationError)
        return reply
            .code(error.code === "not_found" ? 404 : error.code === "forbidden" ? 403 : 400)
            .send({ error: error.code, message: error.message });
    if (error instanceof PluginHostRequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    return undefined;
}

class PluginHostRequestError extends Error {}
