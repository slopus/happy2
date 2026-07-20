import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import type { PluginService } from "../modules/plugin/service.js";
import { PluginError } from "../modules/plugin/types.js";

const MAX_IDENTIFIER_LENGTH = 128;
const MAX_TOOL_NAME_LENGTH = 256;
const MAX_RESOURCE_URI_LENGTH = 2_048;

/** Registers authenticated persistent MCP App and native plugin-contribution product routes. */
export function registerAppSurfaceRoutes(
    app: FastifyInstance,
    auth: AuthService,
    plugins: PluginService,
): void {
    app.get("/v0/apps", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            return { apps: await plugins.listAppInstances(viewerUserId) };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/apps/:instanceId", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            return await plugins.getAppInstance(
                viewerUserId,
                pathIdentifier(request, "instanceId"),
            );
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/apps/:instanceId/callTool", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["name", "arguments"]);
            return {
                result: await plugins.callAppInstanceTool({
                    viewerUserId,
                    instanceId: pathIdentifier(request, "instanceId"),
                    toolName: string(body.name, "name", MAX_TOOL_NAME_LENGTH),
                    arguments: object(body.arguments, "arguments"),
                }),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/apps/:instanceId/readResource", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["uri"]);
            return {
                result: await plugins.readAppInstanceResource({
                    viewerUserId,
                    instanceId: pathIdentifier(request, "instanceId"),
                    uri: string(body.uri, "uri", MAX_RESOURCE_URI_LENGTH),
                }),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/contributions", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const query = queryRecord(request.query);
            only(query, ["chatId"]);
            return {
                contributions: await plugins.listContributions({
                    viewerUserId,
                    ...(query.chatId === undefined
                        ? {}
                        : { chatId: identifier(query.chatId, "chatId") }),
                }),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/contributions/:contributionId/invoke", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["actionId", "value", "chatId", "messageId"]);
            return await plugins.invokeContribution({
                viewerUserId,
                contributionId: pathIdentifier(request, "contributionId"),
                actionId: identifier(body.actionId, "actionId"),
                ...(body.value === undefined ? {} : { value: body.value }),
                ...(body.chatId === undefined ? {} : { chatId: identifier(body.chatId, "chatId") }),
                ...(body.messageId === undefined
                    ? {}
                    : { messageId: identifier(body.messageId, "messageId") }),
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/contributions/:contributionId/resolveMenu", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const body = request.body === undefined ? {} : object(request.body, "Request body");
            only(body, ["chatId", "messageId"]);
            return await plugins.resolveContributionMenu({
                viewerUserId,
                contributionId: pathIdentifier(request, "contributionId"),
                ...(body.chatId === undefined ? {} : { chatId: identifier(body.chatId, "chatId") }),
                ...(body.messageId === undefined
                    ? {}
                    : { messageId: identifier(body.messageId, "messageId") }),
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/me/updateAppPresentation", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["instanceId", "hidden", "position"]);
            return await plugins.updateAppPresentation(viewerUserId, {
                instanceId: identifier(body.instanceId, "instanceId"),
                hidden: body.hidden,
                ...(body.position === undefined ? {} : { position: body.position }),
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/plugins/:pluginId/uiAssets/:assetId", async (request, reply) => {
        const viewerUserId = await actor(auth, request, reply);
        if (!viewerUserId) return;
        try {
            const asset = await plugins.getUiAsset(
                viewerUserId,
                pathIdentifier(request, "pluginId"),
                pathIdentifier(request, "assetId"),
            );
            return reply
                .header("etag", `"${asset.checksumSha256}"`)
                .header("cache-control", "private, max-age=31536000, immutable")
                .type(asset.contentType)
                .send(asset.body);
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });
}

async function actor(
    auth: AuthService,
    request: FastifyRequest,
    reply: FastifyReply,
): Promise<string | undefined> {
    const current = await auth.authenticate(request);
    if (!current) {
        reply.code(401).send({ error: "unauthorized" });
        return undefined;
    }
    return current.user.id;
}

function handled(reply: FastifyReply, error: unknown): FastifyReply | undefined {
    if (error instanceof PluginError) {
        const status =
            error.code === "not_found"
                ? 404
                : error.code === "conflict"
                  ? 409
                  : error.code === "forbidden"
                    ? 403
                    : error.code === "not_ready"
                      ? 503
                      : 400;
        return reply.code(status).send({ error: error.code, message: error.message });
    }
    if (error instanceof CollaborationError)
        return reply
            .code(error.code === "forbidden" ? 403 : error.code === "not_found" ? 404 : 400)
            .send({ error: error.code, message: error.message });
    if (error instanceof RequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    return undefined;
}

function pathIdentifier(request: FastifyRequest, name: string): string {
    return identifier(object(request.params, "Path parameters")[name], name);
}

function identifier(value: unknown, name: string): string {
    if (
        typeof value !== "string" ||
        !value ||
        value.length > MAX_IDENTIFIER_LENGTH ||
        !/^[A-Za-z0-9._-]+$/.test(value)
    )
        throw new RequestError(`${name} is invalid`);
    return value;
}

function string(value: unknown, name: string, maximum: number): string {
    if (typeof value !== "string" || !value || value.length > maximum || value.includes("\0"))
        throw new RequestError(
            `${name} must be a nonempty string of at most ${maximum} characters`,
        );
    return value;
}

function queryRecord(value: unknown): Record<string, unknown> {
    if (value === undefined || value === null) return {};
    return object(value, "Query parameters");
}

function object(value: unknown, name: string): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new RequestError(`${name} must be an object`);
    return value as Record<string, unknown>;
}

function only(value: Record<string, unknown>, allowed: readonly string[]): void {
    const unexpected = Object.keys(value).find((key) => !allowed.includes(key));
    if (unexpected) throw new RequestError(`Unexpected request field ${unexpected}`);
}

class RequestError extends Error {}
