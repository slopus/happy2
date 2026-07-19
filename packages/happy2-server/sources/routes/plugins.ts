import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import type { PluginCatalog } from "../modules/plugin/catalog.js";
import { PluginMcpHttpBridge } from "../modules/plugin/httpBridge.js";
import { pluginCatalogList } from "../modules/plugin/pluginCatalogList.js";
import { pluginInstallationGetStatus } from "../modules/plugin/pluginInstallationGetStatus.js";
import { pluginInstallationList } from "../modules/plugin/pluginInstallationList.js";
import { pluginList } from "../modules/plugin/pluginList.js";
import { pluginMcpToolsList } from "../modules/plugin/pluginMcpToolsList.js";
import { pluginAuthorizeManagement } from "../modules/plugin/pluginAuthorizeManagement.js";
import type { PluginService } from "../modules/plugin/service.js";
import { PluginError } from "../modules/plugin/types.js";
import { CollaborationError } from "../modules/chat/types.js";

const SHORT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function registerPluginRoutes(
    app: FastifyInstance,
    auth: AuthService,
    executor: DrizzleExecutor,
    catalog: PluginCatalog,
    plugins: PluginService,
    bridge: PluginMcpHttpBridge,
): void {
    app.get("/v0/admin/plugins", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            return { plugins: await pluginCatalogList(executor, catalog, actorUserId) };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/systemPlugins", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const [systemPlugins, installations] = await Promise.all([
                pluginList(executor, actorUserId),
                pluginInstallationList(executor, actorUserId),
            ]);
            return {
                plugins: systemPlugins.map((plugin) => ({
                    ...plugin,
                    installations: installations.filter(({ pluginId }) => pluginId === plugin.id),
                })),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/plugins/:shortName/icon", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const shortName = pathShortName(request);
            const visible = (await pluginCatalogList(executor, catalog, actorUserId)).some(
                (plugin) => plugin.shortName === shortName,
            );
            const plugin = visible ? catalog.get(shortName) : undefined;
            if (!plugin) throw new PluginError("not_found", "Built-in plugin was not found");
            return reply.type("image/png").send(await readFile(plugin.iconPath));
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/systemPlugins/:pluginId/image", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const image = await plugins.image(actorUserId, pathIdentifier(request, "pluginId"));
            return reply
                .header("etag", `"${image.checksumSha256}"`)
                .type(image.contentType)
                .send(image.body);
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/plugins/:shortName/installPlugin", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const body = request.body === undefined ? {} : object(request.body, "Request body");
            only(body, ["variables", "containerImageId"]);
            const installation = await plugins.install({
                actorUserId,
                shortName: pathShortName(request),
                variables: variables(body.variables),
                ...(body.containerImageId === undefined
                    ? {}
                    : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
            });
            return reply.code(202).send({ installation });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/admin/pluginInstallations/:installationId/mcpTools", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            return await pluginMcpToolsList(
                executor,
                actorUserId,
                pathIdentifier(request, "installationId"),
            );
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/pluginPackages/preparePlugin", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        let operation:
            | { kind: "upload"; archive: Buffer }
            | { kind: "remote"; source: { kind: "github" | "zip_url"; url: string } };
        try {
            await pluginAuthorizeManagement(executor, actorUserId);
            if (request.isMultipart()) {
                const upload = await request.file({
                    limits: { files: 1, fileSize: 50 * 1024 * 1024 },
                });
                if (!upload) throw new RequestError("A plugin ZIP file is required");
                if (upload.fieldname !== "plugin")
                    throw new RequestError("Plugin ZIP must use the plugin multipart field");
                const archive = await upload.toBuffer();
                if (upload.file.truncated) throw new RequestError("Plugin ZIP exceeds 50 MiB");
                operation = { kind: "upload", archive };
            } else {
                const body = object(request.body, "Request body");
                only(body, ["source"]);
                const source = object(body.source, "source");
                only(source, ["kind", "url"]);
                if (source.kind !== "github" && source.kind !== "zip_url")
                    throw new RequestError("source.kind must be github or zip_url");
                if (typeof source.url !== "string" || !source.url || source.url.length > 8_192)
                    throw new RequestError("source.url must be a valid URL");
                operation = { kind: "remote", source: { kind: source.kind, url: source.url } };
            }
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
        return eventStream(request, reply, async (send, signal) => {
            const progress = (
                stage: string,
                detail: string,
                bytes?: { receivedBytes: number; totalBytes?: number },
            ) => send("progress", { stage, detail, ...bytes });
            const result =
                operation.kind === "upload"
                    ? await plugins.prepareUpload(actorUserId, operation.archive, progress)
                    : await plugins.prepareRemote(actorUserId, operation.source, progress, signal);
            send(result.selectionRequired ? "selection_required" : "prepared", result);
        });
    });

    app.post("/v0/admin/pluginPackages/installPlugin", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["preparedToken", "variables", "containerImageId"]);
            if (typeof body.preparedToken !== "string" || body.preparedToken.length > 256)
                throw new RequestError("preparedToken is invalid");
            const installation = await plugins.installPrepared({
                actorUserId,
                preparedToken: body.preparedToken,
                variables: variables(body.variables),
                ...(body.containerImageId === undefined
                    ? {}
                    : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
            });
            return reply.code(202).send({ installation });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/admin/systemPlugins/:pluginId/checkForUpdate", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        let pluginId: string;
        try {
            await pluginAuthorizeManagement(executor, actorUserId);
            pluginId = pathIdentifier(request, "pluginId");
            const body = request.body === undefined ? {} : object(request.body, "Request body");
            only(body, []);
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
        return eventStream(request, reply, async (send, signal) => {
            const update = await plugins.checkForUpdate(
                actorUserId,
                pluginId,
                (stage, detail, bytes) => send("progress", { stage, detail, ...bytes }),
                signal,
            );
            send("checked", { update });
        });
    });

    app.post("/v0/admin/systemPlugins/:pluginId/uninstallPlugin", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const body = request.body === undefined ? {} : object(request.body, "Request body");
            only(body, []);
            const uninstalled = await plugins.uninstall(
                actorUserId,
                pathIdentifier(request, "pluginId"),
            );
            await bridge.closeInstallations(uninstalled.installationIds);
            return { uninstalled };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    const mcp = async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        const current = await auth.authenticate(request);
        if (!current) {
            reply.code(401).send({ error: "unauthorized" });
            return;
        }
        try {
            const installation = await pluginInstallationGetStatus(
                executor,
                pathIdentifier(request, "installationId"),
            );
            if (installation.status !== "ready")
                throw new PluginError("not_ready", "Plugin MCP server is not ready");
            await bridge.handle(request, reply, installation.id, current.user.id);
        } catch (error) {
            if (!reply.sent) {
                const response = handled(reply, error);
                if (!response) throw error;
            }
        }
    };
    app.get("/v0/pluginInstallations/:installationId/mcp", mcp);
    app.post("/v0/pluginInstallations/:installationId/mcp", mcp);
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

function pathShortName(request: FastifyRequest): string {
    const params = object(request.params, "Path parameters");
    const value = params.shortName;
    if (typeof value !== "string" || !SHORT_NAME.test(value))
        throw new RequestError("shortName is invalid");
    return value;
}

function pathIdentifier(request: FastifyRequest, name: string): string {
    const value = object(request.params, "Path parameters")[name];
    if (typeof value !== "string" || !/^[a-z0-9]+$/.test(value) || value.length > 128)
        throw new RequestError(`${name} is invalid`);
    return value;
}

function variables(value: unknown): Record<string, string> {
    const record = value === undefined ? {} : object(value, "variables");
    if (Object.keys(record).length > 64) throw new RequestError("variables has too many entries");
    const result: Record<string, string> = {};
    for (const [key, item] of Object.entries(record)) {
        if (!/^[A-Z_][A-Z0-9_]*$/.test(key) || typeof item !== "string")
            throw new RequestError("variables must map environment keys to string values");
        result[key] = item;
    }
    return result;
}

function identifier(value: unknown, name: string): string {
    if (typeof value !== "string" || !value || value.length > 128 || /\s/.test(value))
        throw new RequestError(`${name} must be a valid identifier`);
    return value;
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

async function eventStream(
    request: FastifyRequest,
    reply: FastifyReply,
    operation: (
        send: (event: string, data: Record<string, unknown>) => void,
        signal: AbortSignal,
    ) => Promise<void>,
): Promise<void> {
    const controller = new AbortController();
    const abort = () => controller.abort(new Error("Plugin operation stream disconnected"));
    request.raw.once("aborted", abort);
    reply.raw.once("close", abort);
    reply.hijack();
    for (const [name, value] of Object.entries(reply.getHeaders()))
        if (value !== undefined) reply.raw.setHeader(name, value);
    reply.raw.statusCode = 200;
    reply.raw.setHeader("content-type", "text/event-stream; charset=utf-8");
    reply.raw.setHeader("cache-control", "no-cache, no-transform");
    reply.raw.setHeader("x-accel-buffering", "no");
    reply.raw.flushHeaders();
    const send = (event: string, data: Record<string, unknown>): void => {
        if (!reply.raw.destroyed && !reply.raw.writableEnded)
            reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    try {
        await operation(send, controller.signal);
    } catch (error) {
        if (!controller.signal.aborted) {
            const pluginError = error instanceof PluginError ? error : undefined;
            if (!pluginError) request.log.error(error, "Plugin SSE operation failed");
            send("failed", {
                error: pluginError?.code ?? "plugin_preparation_failed",
                message: pluginError?.message ?? "Plugin operation failed",
            });
        }
    } finally {
        request.raw.removeListener("aborted", abort);
        reply.raw.removeListener("close", abort);
        if (!reply.raw.destroyed && !reply.raw.writableEnded) reply.raw.end();
    }
}
