import { readFile } from "node:fs/promises";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { AuthService } from "../modules/auth/service.js";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import type { PluginCatalog } from "../modules/plugin/catalog.js";
import { PluginMcpHttpBridge } from "../modules/plugin/httpBridge.js";
import { pluginCatalogList } from "../modules/plugin/pluginCatalogList.js";
import { pluginInstallationGetStatus } from "../modules/plugin/pluginInstallationGetStatus.js";
import { pluginInstallationDiagnosticsGet } from "../modules/plugin/pluginInstallationDiagnosticsGet.js";
import { pluginInstallationList } from "../modules/plugin/pluginInstallationList.js";
import { pluginList } from "../modules/plugin/pluginList.js";
import { pluginMcpToolsList } from "../modules/plugin/pluginMcpToolsList.js";
import { pluginAuthorizeManagement } from "../modules/plugin/pluginAuthorizeManagement.js";
import type { PluginService } from "../modules/plugin/service.js";
import {
    PluginError,
    pluginHostPermissions,
    type PluginHostPermission,
} from "../modules/plugin/types.js";
import { CollaborationError } from "../modules/chat/types.js";

const SHORT_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_PLUGIN_ARCHIVE_BYTES = 20 * 1024 * 1024;

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
            only(body, ["variables", "containerImageId", "permissions"]);
            const installation = await plugins.install({
                actorUserId,
                shortName: pathShortName(request),
                variables: variables(body.variables),
                permissions: permissions(body.permissions),
                ...(body.containerImageId === undefined
                    ? {}
                    : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
            });
            return reply.code(202).send({ installation });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post(
        "/v0/admin/pluginInstallations/:installationId/updatePermissions",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                const body = object(request.body, "Request body");
                only(body, ["permissions"]);
                const installation = await plugins.updatePermissions({
                    actorUserId,
                    installationId: pathIdentifier(request, "installationId"),
                    permissions: permissions(body.permissions),
                });
                return reply.code(202).send({ installation });
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/admin/pluginInstallations/:installationId/uninstallPlugin",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                const body = request.body === undefined ? {} : object(request.body, "Request body");
                only(body, []);
                await plugins.uninstallInstallation({
                    actorUserId,
                    installationId: pathIdentifier(request, "installationId"),
                });
                return { uninstalled: true };
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/admin/pluginInstallations/:installationId/retryPlugin",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
                const installation = await plugins.retryInstallation({
                    actorUserId,
                    installationId: pathIdentifier(request, "installationId"),
                });
                return reply.code(202).send({ installation });
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post("/v0/admin/plugins/installPlugin", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const installation = request.isMultipart()
                ? await installUploadedPlugin(request, plugins, actorUserId)
                : await installLinkedPlugin(request.body, plugins, actorUserId);
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

    app.get("/v0/admin/pluginInstallations/:installationId/diagnostics", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            return {
                diagnostics: await pluginInstallationDiagnosticsGet(
                    executor,
                    actorUserId,
                    pathIdentifier(request, "installationId"),
                ),
            };
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
            only(body, ["preparedToken", "variables", "permissions", "containerImageId"]);
            if (typeof body.preparedToken !== "string" || body.preparedToken.length > 256)
                throw new RequestError("preparedToken is invalid");
            const installation = await plugins.installPrepared({
                actorUserId,
                preparedToken: body.preparedToken,
                variables: variables(body.variables),
                permissions: permissions(body.permissions),
                ...(body.containerImageId === undefined
                    ? {}
                    : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
            });
            return reply.code(202).send({ installation });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.get("/v0/chats/:chatId/pluginManagementRequests", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            return {
                requests: await plugins.listManagementRequests(
                    actorUserId,
                    pathIdentifier(request, "chatId"),
                ),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post(
        "/v0/admin/pluginInstallations/:installationId/checkForUpdate",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            let installationId: string;
            try {
                await pluginAuthorizeManagement(executor, actorUserId);
                installationId = pathIdentifier(request, "installationId");
                const body = request.body === undefined ? {} : object(request.body, "Request body");
                only(body, []);
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
            return eventStream(request, reply, async (send, signal) => {
                const update = await plugins.checkForUpdate(
                    actorUserId,
                    installationId,
                    (stage, detail, bytes) => send("progress", { stage, detail, ...bytes }),
                    signal,
                );
                send("checked", { update });
            });
        },
    );

    app.post(
        "/v0/admin/pluginInstallations/:installationId/updatePlugin",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            let installationId: string;
            try {
                await pluginAuthorizeManagement(executor, actorUserId);
                installationId = pathIdentifier(request, "installationId");
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
            return eventStream(request, reply, async (send, signal) => {
                const update = await plugins.updatePlugin(
                    actorUserId,
                    installationId,
                    (stage, detail, bytes) => send("progress", { stage, detail, ...bytes }),
                    signal,
                );
                send("updated", { update });
            });
        },
    );

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

    app.get(
        "/v0/chats/:chatId/pluginManagementRequests/:requestId/image",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                const image = await plugins.managementRequestImage({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    requestId: pathIdentifier(request, "requestId"),
                });
                return reply.type("image/png").send(image);
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/chats/:chatId/pluginManagementRequests/:requestId/approvePluginInstall",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
                const approval = await plugins.approveManagementRequest({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    requestId: pathIdentifier(request, "requestId"),
                });
                return { approval };
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/chats/:chatId/pluginManagementRequests/:requestId/denyPluginInstall",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
                const approval = await plugins.denyManagementRequest({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    requestId: pathIdentifier(request, "requestId"),
                    action: "install",
                });
                return { approval };
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/chats/:chatId/pluginManagementRequests/:requestId/approvePluginUninstall",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
                const approval = await plugins.approveUninstallManagementRequest({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    requestId: pathIdentifier(request, "requestId"),
                });
                return { approval };
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.post(
        "/v0/chats/:chatId/pluginManagementRequests/:requestId/denyPluginUninstall",
        async (request, reply) => {
            const actorUserId = await actor(auth, request, reply);
            if (!actorUserId) return;
            try {
                only(request.body === undefined ? {} : object(request.body, "Request body"), []);
                const approval = await plugins.denyManagementRequest({
                    actorUserId,
                    chatId: pathIdentifier(request, "chatId"),
                    requestId: pathIdentifier(request, "requestId"),
                    action: "uninstall",
                });
                return { approval };
            } catch (error) {
                return handled(reply, error) ?? Promise.reject(error);
            }
        },
    );

    app.get("/v0/messages/:messageId/mcpApps/:callId", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            return await plugins.getMcpApp({
                actorUserId,
                assistantMessageId: pathIdentifier(request, "messageId"),
                callId: pathOpaqueIdentifier(request, "callId"),
            });
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/messages/:messageId/mcpApps/:callId/callTool", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["name", "arguments"]);
            const name = body.name;
            if (typeof name !== "string" || !name || name.length > 256)
                throw new RequestError("name must be a valid MCP tool name");
            const argumentsValue = object(body.arguments, "arguments");
            return {
                result: await plugins.callMcpAppTool({
                    actorUserId,
                    assistantMessageId: pathIdentifier(request, "messageId"),
                    callId: pathOpaqueIdentifier(request, "callId"),
                    name,
                    arguments: argumentsValue,
                }),
            };
        } catch (error) {
            return handled(reply, error) ?? Promise.reject(error);
        }
    });

    app.post("/v0/messages/:messageId/mcpApps/:callId/readResource", async (request, reply) => {
        const actorUserId = await actor(auth, request, reply);
        if (!actorUserId) return;
        try {
            const body = object(request.body, "Request body");
            only(body, ["uri"]);
            if (typeof body.uri !== "string" || !body.uri || body.uri.length > 2_048)
                throw new RequestError("uri must be a valid MCP resource URI");
            return {
                result: await plugins.readMcpAppResource({
                    actorUserId,
                    assistantMessageId: pathIdentifier(request, "messageId"),
                    callId: pathOpaqueIdentifier(request, "callId"),
                    uri: body.uri,
                }),
            };
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

function pathOpaqueIdentifier(request: FastifyRequest, name: string): string {
    const value = object(request.params, "Path parameters")[name];
    if (typeof value !== "string" || !/^[A-Za-z0-9._-]+$/.test(value) || value.length > 128)
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

function permissions(value: unknown): PluginHostPermission[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > pluginHostPermissions.length)
        throw new RequestError("permissions must be an array");
    const result: PluginHostPermission[] = [];
    for (const permission of value) {
        if (
            typeof permission !== "string" ||
            !pluginHostPermissions.includes(permission as PluginHostPermission)
        )
            throw new RequestError("permissions contains an unknown plugin permission");
        if (result.includes(permission as PluginHostPermission))
            throw new RequestError(`permissions contains duplicate ${permission}`);
        result.push(permission as PluginHostPermission);
    }
    return result;
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

async function installLinkedPlugin(value: unknown, plugins: PluginService, actorUserId: string) {
    const body = object(value, "Request body");
    only(body, ["sourceUrl", "variables", "containerImageId"]);
    if (typeof body.sourceUrl !== "string" || body.sourceUrl.length > 4_096)
        throw new RequestError("sourceUrl must be an absolute plugin ZIP URL");
    return plugins.installLink({
        actorUserId,
        url: body.sourceUrl,
        variables: variables(body.variables),
        ...(body.containerImageId === undefined
            ? {}
            : { containerImageId: identifier(body.containerImageId, "containerImageId") }),
    });
}

async function installUploadedPlugin(
    request: FastifyRequest,
    plugins: PluginService,
    actorUserId: string,
) {
    let archive: Buffer | undefined;
    let variablesValue: unknown;
    let containerImageId: string | undefined;
    const seen = new Set<string>();
    for await (const part of request.parts({
        limits: { files: 1, fileSize: MAX_PLUGIN_ARCHIVE_BYTES, fields: 2, parts: 3 },
    })) {
        if (seen.has(part.fieldname))
            throw new RequestError(`Duplicate multipart field ${part.fieldname}`);
        seen.add(part.fieldname);
        if (part.type === "file") {
            if (part.fieldname !== "archive")
                throw new RequestError("Plugin ZIP field must be named archive");
            archive = await part.toBuffer();
            if (part.file.truncated) throw new RequestError("Plugin ZIP exceeds 20 MiB");
            continue;
        }
        if (part.fieldname === "variables") {
            if (typeof part.value !== "string")
                throw new RequestError("variables must contain JSON");
            try {
                variablesValue = JSON.parse(part.value);
            } catch {
                throw new RequestError("variables must contain a JSON object");
            }
            continue;
        }
        if (part.fieldname === "containerImageId") {
            containerImageId = identifier(part.value, "containerImageId");
            continue;
        }
        throw new RequestError(`Unexpected multipart field ${part.fieldname}`);
    }
    if (!archive?.length) throw new RequestError("archive plugin ZIP is required");
    return plugins.installArchive({
        actorUserId,
        archive,
        variables: variables(variablesValue),
        ...(containerImageId ? { containerImageId } : {}),
    });
}
