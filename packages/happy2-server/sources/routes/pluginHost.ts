import Fastify, {
    type FastifyBaseLogger,
    type FastifyInstance,
    type FastifyReply,
    type FastifyRequest,
} from "fastify";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { MAX_DOCUMENT_TITLE_LENGTH } from "../modules/document/types.js";
import { pluginInstallationListForHost } from "../modules/plugin/pluginInstallationListForHost.js";
import type { PluginService } from "../modules/plugin/service.js";
import { CollaborationError } from "../modules/chat/types.js";
import type { AgentService } from "../modules/agents/index.js";
import { MAX_WORKSPACE_TEXT_FILE_BYTES, WorkspaceError } from "../modules/workspace/index.js";
import type { PortShareService } from "../modules/port-share/service.js";
import { PortShareError, portShareContainerPorts } from "../modules/port-share/types.js";
import {
    PluginError,
    pluginHostPermissions,
    type PluginHostPermission,
    type PluginUserCapability,
} from "../modules/plugin/types.js";

const MAX_ENVIRONMENT_NAME_LENGTH = 100;
const MAX_DOCKERFILE_BYTES = 256 * 1024;
const PLUGIN_HOST_BODY_BYTES = MAX_WORKSPACE_TEXT_FILE_BYTES * 3 + 64 * 1024;

type PluginHostAgentService = Pick<
    AgentService,
    | "createAgentImage"
    | "deactivateAgentImage"
    | "getAgentImageDockerfileForHost"
    | "listAgentImagesForHost"
    | "modelRequireAvailable"
    | "prepareTurns"
    | "setDefaultAgentImage"
    | "startTurn"
>;

/** Builds the capability-only HTTP surface exposed to local plugin containers. */
export function createPluginHostApi(
    executor: DrizzleExecutor,
    plugins: PluginService,
    logger: boolean | FastifyBaseLogger,
    agents?: PluginHostAgentService,
    portShares?: PortShareService,
): FastifyInstance {
    const app = Fastify({
        ...(typeof logger === "boolean" ? { logger } : { loggerInstance: logger }),
        bodyLimit: PLUGIN_HOST_BODY_BYTES,
    });
    app.post("/apps/putInstance", async (request, reply) => {
        try {
            return await plugins.hostAppInstancePut({
                runtimeToken: bearerToken(request),
                viewerToken: optionalHeader(request, "x-happy2-viewer-token"),
                chatToken: optionalHeader(request, "x-happy2-chat-token"),
                definition: request.body,
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/apps/updateInstanceContext", async (request, reply) => {
        try {
            const body = object(request.body, "Request body");
            only(body, ["instanceKey", "context"]);
            return await plugins.hostAppInstanceContextUpdate({
                runtimeToken: bearerToken(request),
                viewerToken: optionalHeader(request, "x-happy2-viewer-token"),
                chatToken: optionalHeader(request, "x-happy2-chat-token"),
                instanceKey: body.instanceKey,
                context: body.context,
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/apps/deleteInstance", async (request, reply) => {
        try {
            const body = object(request.body, "Request body");
            only(body, ["instanceKey"]);
            return await plugins.hostAppInstanceDelete({
                runtimeToken: bearerToken(request),
                viewerToken: optionalHeader(request, "x-happy2-viewer-token"),
                chatToken: optionalHeader(request, "x-happy2-chat-token"),
                instanceKey: body.instanceKey,
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/contributions/putContribution", async (request, reply) => {
        try {
            return await plugins.hostContributionPut({
                runtimeToken: bearerToken(request),
                viewerToken: optionalHeader(request, "x-happy2-viewer-token"),
                chatToken: optionalHeader(request, "x-happy2-chat-token"),
                definition: request.body,
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/contributions/deleteContribution", async (request, reply) => {
        try {
            const body = object(request.body, "Request body");
            only(body, ["externalKey"]);
            return await plugins.hostContributionDelete({
                runtimeToken: bearerToken(request),
                viewerToken: optionalHeader(request, "x-happy2-viewer-token"),
                chatToken: optionalHeader(request, "x-happy2-chat-token"),
                externalKey: body.externalKey,
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
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
    app.post("/chats/archiveChat", async (request, reply) => {
        try {
            emptyBody(request.body);
            return await plugins.chatArchive(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/messages/send", async (request, reply) => {
        try {
            const result = await plugins.messageSend(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                messageSendInput(request.body),
                agents,
            );
            return reply.code(201).send(result);
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/messages/history", async (request, reply) => {
        try {
            return await plugins.messageHistory(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                messageHistoryInput(request.query),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/messages/:messageId", async (request, reply) => {
        try {
            return await plugins.messageRead(
                bearerToken(request),
                pathCuid2(request, "messageId"),
                requiredHeader(
                    request,
                    "x-happy2-message-token",
                    "Plugin message token is required",
                ),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/messages/:messageId/deleteMessage", async (request, reply) => {
        try {
            emptyBody(request.body);
            return await plugins.messageDelete(
                bearerToken(request),
                pathCuid2(request, "messageId"),
                requiredHeader(
                    request,
                    "x-happy2-message-token",
                    "Plugin message token is required",
                ),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    for (const [path, active] of [
        ["/messages/:messageId/addReaction", true],
        ["/messages/:messageId/removeReaction", false],
    ] as const)
        app.post(path, async (request, reply) => {
            try {
                return await plugins.messageReactionSet(
                    bearerToken(request),
                    pathCuid2(request, "messageId"),
                    requiredHeader(
                        request,
                        "x-happy2-message-token",
                        "Plugin message token is required",
                    ),
                    { ...reactionInput(request.body), active },
                );
            } catch (error) {
                const response = handled(reply, error);
                if (response) return response;
                throw error;
            }
        });
    app.post("/search", async (request, reply) => {
        try {
            return await plugins.search(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                searchInput(request.body),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/workspace/file", async (request, reply) => {
        try {
            const query = queryRecord(request.query);
            only(query, ["path"]);
            return await plugins.workspaceFileRead(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                workspacePath(query.path),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/documents", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "documents:read",
            );
            return {
                documents: await plugins.listDocumentsForHost(claims.actorUserId, claims.chatId),
            };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/documents/create", async (request, reply) => {
        try {
            const runtimeToken = bearerToken(request);
            const runtime = await plugins.authorizeHost(runtimeToken, "documents:write");
            if (!runtime.agentCall)
                throw new PluginError(
                    "forbidden",
                    "Plugin document creation requires an active Happy agent call",
                );
            const chat = await plugins.authorizeChatHost(
                runtimeToken,
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "documents:write",
            );
            if (
                chat.chatId !== runtime.agentCall.chatId ||
                chat.actorUserId !== runtime.agentCall.actorUserId ||
                chat.agentUserId !== runtime.agentCall.agentUserId
            )
                throw new PluginError(
                    "forbidden",
                    "Plugin chat token belongs to another active agent call",
                );
            const body = documentCreateInput(request.body);
            const document = await plugins.documentCreateForHost({
                actorUserId: runtime.agentCall.actorUserId,
                agentUserId: runtime.agentCall.agentUserId,
                chatId: runtime.agentCall.chatId,
                title: body.title,
                ...(body.initialUpdate ? { initialUpdate: body.initialUpdate } : {}),
            });
            return reply.code(201).send({ document });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/documents/:documentId", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "documents:read",
            );
            return await plugins.getDocumentForHost(
                claims.actorUserId,
                claims.chatId,
                pathIdentifier(request, "documentId"),
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/documents/:documentId/applyUpdates", async (request, reply) => {
        const controller = new AbortController();
        const aborted = () => controller.abort(new Error("Plugin document write disconnected"));
        request.raw.once("aborted", aborted);
        try {
            const runtimeToken = bearerToken(request);
            const runtime = await plugins.authorizeHost(runtimeToken, "documents:write");
            if (!runtime.agentCall)
                throw new PluginError(
                    "forbidden",
                    "Plugin document writes require an active Happy agent call",
                );
            const chat = await plugins.authorizeChatHost(
                runtimeToken,
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "documents:write",
            );
            if (
                chat.chatId !== runtime.agentCall.chatId ||
                chat.actorUserId !== runtime.agentCall.actorUserId ||
                chat.agentUserId !== runtime.agentCall.agentUserId
            )
                throw new PluginError(
                    "forbidden",
                    "Plugin chat token belongs to another active agent call",
                );
            const body = documentWriteInput(request.body);
            return await plugins.requestDocumentWriteForHost(
                {
                    actorUserId: runtime.agentCall.actorUserId,
                    agentUserId: runtime.agentCall.agentUserId,
                    requesterInstallationId: runtime.installationId,
                    sessionId: runtime.agentCall.sessionId,
                    callId: runtime.agentCall.callId,
                    chatId: chat.chatId,
                    documentId: pathIdentifier(request, "documentId"),
                    clientUpdateId: body.clientUpdateId,
                    baseSequence: body.baseSequence,
                    updates: body.updates,
                },
                controller.signal,
            );
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        } finally {
            request.raw.removeListener("aborted", aborted);
        }
    });
    app.post("/workspace/writeFile", async (request, reply) => {
        try {
            const result = await plugins.workspaceFileWrite(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                workspaceWriteInput(request.body),
            );
            return reply.code(result.file.created ? 201 : 200).send(result);
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/commands/run", async (request, reply) => {
        try {
            return await plugins.workspaceCommandRun(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                commandInput(request.body),
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
    app.post("/channels/createChildChannel", async (request, reply) => {
        try {
            const result = await plugins.channelCreateChild(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                childChannelCreateInput(request.body),
                agents,
            );
            return reply.code(201).send(result);
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.get("/port-shares", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "port-sharing:read",
            );
            return {
                portShares: await requirePortShares(portShares).list(
                    claims.actorUserId,
                    claims.chatId,
                ),
            };
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/port-shares/exposePort", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "port-sharing:expose",
            );
            const body = bodyRecord(request.body);
            onlyBodyKeys(body, ["name", "port"]);
            const result = await requirePortShares(portShares).create({
                actorUserId: claims.actorUserId,
                agentUserId: claims.agentUserId,
                chatId: claims.chatId,
                name: requiredTrimmedString(body.name, "name", 80),
                containerPort: portSharePort(body.port),
            });
            return reply.code(201).send(result);
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/port-shares/:portShareId/disablePortShare", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "port-sharing:disable",
            );
            emptyBody(request.body);
            return await requirePortShares(portShares).disable({
                actorUserId: claims.actorUserId,
                chatId: claims.chatId,
                portShareId: pathIdentifier(request, "portShareId"),
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.post("/port-shares/:portShareId/createAccessToken", async (request, reply) => {
        try {
            const claims = await plugins.authorizeChatHost(
                bearerToken(request),
                requiredHeader(request, "x-happy2-chat-token", "Plugin chat token is required"),
                "port-sharing:access",
            );
            emptyBody(request.body);
            return await requirePortShares(portShares).issueAccessToken({
                actorUserId: claims.actorUserId,
                chatId: claims.chatId,
                portShareId: pathIdentifier(request, "portShareId"),
            });
        } catch (error) {
            const response = handled(reply, error);
            if (response) return response;
            throw error;
        }
    });
    app.setErrorHandler((error, request, reply) => {
        request.log.error(
            { err: error },
            `plugin-host:error requestId=${request.id} method=${request.method} path=${request.url.split("?", 1)[0]} message=${error instanceof Error ? error.message : String(error)}`,
        );
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

function requirePortShares(portShares: PortShareService | undefined): PortShareService {
    if (!portShares)
        throw new PluginError("not_ready", "Port sharing is not configured on this server");
    return portShares;
}

function portSharePort(value: unknown) {
    if (
        typeof value !== "number" ||
        !Number.isInteger(value) ||
        !portShareContainerPorts.includes(value as never)
    )
        throw new PluginHostRequestError("port must be an integer from 3000 through 3010");
    return value as (typeof portShareContainerPorts)[number];
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

function pathCuid2(request: FastifyRequest, name: string): string {
    const value = (request.params as Record<string, unknown>)[name];
    if (typeof value !== "string" || !/^[a-z][a-z0-9]{23}$/.test(value))
        throw new PluginHostRequestError(`${name} must be a CUID2 identifier`);
    return value;
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

function optionalHeader(request: FastifyRequest, name: string): string | undefined {
    const raw = request.headers[name];
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (value === undefined) return undefined;
    if (!value || value.length > 4_096)
        throw new PluginError("forbidden", `Plugin ${name} is invalid`);
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

function messageSendInput(value: unknown): {
    text: string;
    audience: "people" | "agents";
    idempotencyKey?: string;
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["text", "audience", "idempotencyKey"]);
    const audience = body.audience ?? "people";
    if (audience !== "people" && audience !== "agents")
        throw new PluginHostRequestError("audience must be people or agents");
    const idempotencyKey =
        body.idempotencyKey === undefined
            ? undefined
            : requiredToken(body.idempotencyKey, "idempotencyKey", 128);
    return {
        text: requiredMessageText(body.text, "text"),
        audience,
        ...(idempotencyKey ? { idempotencyKey } : {}),
    };
}

function messageHistoryInput(value: unknown): {
    beforeSequence?: number;
    afterSequence?: number;
    limit: number;
} {
    const query = queryRecord(value);
    only(query, ["beforeSequence", "afterSequence", "limit"]);
    const beforeSequence = optionalPositiveInteger(query.beforeSequence, "beforeSequence");
    const afterSequence = optionalPositiveInteger(query.afterSequence, "afterSequence");
    if (beforeSequence !== undefined && afterSequence !== undefined)
        throw new PluginHostRequestError("beforeSequence and afterSequence are mutually exclusive");
    const limit = optionalPositiveInteger(query.limit, "limit") ?? 50;
    if (limit > 100) throw new PluginHostRequestError("limit must be at most 100");
    return {
        ...(beforeSequence === undefined ? {} : { beforeSequence }),
        ...(afterSequence === undefined ? {} : { afterSequence }),
        limit,
    };
}

function reactionInput(value: unknown): { emoji?: string; customEmojiId?: string } {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["emoji", "customEmojiId"]);
    const emoji =
        body.emoji === undefined ? undefined : requiredTrimmedString(body.emoji, "emoji", 32);
    const customEmojiId =
        body.customEmojiId === undefined
            ? undefined
            : identifier(body.customEmojiId, "customEmojiId");
    if (Boolean(emoji) === Boolean(customEmojiId))
        throw new PluginHostRequestError("Provide exactly one of emoji or customEmojiId");
    return {
        ...(emoji ? { emoji } : {}),
        ...(customEmojiId ? { customEmojiId } : {}),
    };
}

function searchInput(value: unknown): {
    query: string;
    types: ("user" | "message" | "chat")[];
    cursor?: string;
    limit: number;
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["query", "filters", "cursor", "limit"]);
    const query = requiredTrimmedString(body.query, "query", 200);
    const filters = body.filters ?? "all";
    let types: ("user" | "message" | "chat")[];
    if (filters === "all") types = ["user", "message", "chat"];
    else {
        if (!Array.isArray(filters) || filters.length === 0 || filters.length > 3)
            throw new PluginHostRequestError(
                "filters must be all or a non-empty array of users, messages, and chats",
            );
        const mapping = { users: "user", messages: "message", chats: "chat" } as const;
        types = filters.map((filter) => {
            if (typeof filter !== "string" || !(filter in mapping))
                throw new PluginHostRequestError("filters contains an unknown entity type");
            return mapping[filter as keyof typeof mapping];
        });
        if (new Set(types).size !== types.length)
            throw new PluginHostRequestError("filters contains a duplicate entity type");
    }
    const limit = optionalPositiveInteger(body.limit, "limit") ?? 20;
    if (limit > 50) throw new PluginHostRequestError("limit must be at most 50");
    const cursor =
        body.cursor === undefined ? undefined : requiredToken(body.cursor, "cursor", 1_024);
    return { query, types, limit, ...(cursor ? { cursor } : {}) };
}

function workspaceWriteInput(value: unknown): {
    path: string;
    expectedHash: string | null;
    content: string;
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["path", "expectedHash", "content"]);
    const expectedHash = body.expectedHash;
    if (
        expectedHash !== null &&
        (typeof expectedHash !== "string" || !/^[a-f0-9]{64}$/.test(expectedHash))
    )
        throw new PluginHostRequestError("expectedHash must be a SHA-256 hash or null");
    if (typeof body.content !== "string")
        throw new PluginHostRequestError("content must be a string");
    if (Buffer.byteLength(body.content, "utf8") > MAX_WORKSPACE_TEXT_FILE_BYTES)
        throw new PluginHostRequestError("content exceeds the 4 MiB workspace file limit");
    return { path: workspacePath(body.path), expectedHash, content: body.content };
}

function documentWriteInput(value: unknown): {
    clientUpdateId: string;
    baseSequence: string;
    updates: unknown[];
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["clientUpdateId", "baseSequence", "updates"]);
    if (!Array.isArray(body.updates)) throw new PluginHostRequestError("updates must be an array");
    return {
        clientUpdateId: documentClientUpdateId(body.clientUpdateId),
        baseSequence: documentSequence(body.baseSequence, "baseSequence"),
        updates: body.updates,
    };
}

function documentCreateInput(value: unknown): { title: string; initialUpdate?: string } {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["title", "initialUpdate"]);
    const title = requiredTrimmedString(body.title, "title", MAX_DOCUMENT_TITLE_LENGTH);
    const initialUpdate =
        body.initialUpdate === undefined
            ? undefined
            : requiredToken(body.initialUpdate, "initialUpdate", 1_000_000);
    return { title, ...(initialUpdate ? { initialUpdate } : {}) };
}

function documentSequence(value: unknown, name: string): string {
    if (typeof value !== "string" || !/^\d+$/.test(value))
        throw new PluginHostRequestError(`${name} must be a document sequence`);
    return value;
}

function documentClientUpdateId(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 128 || value.trim() !== value)
        throw new PluginHostRequestError("clientUpdateId must be a valid identifier");
    return value;
}

function commandInput(value: unknown): {
    command: string;
    environment: Record<string, string>;
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["command", "environment"]);
    const command = requiredCommand(body.command);
    const raw = body.environment === undefined ? {} : bodyRecord(body.environment, "environment");
    if (Object.keys(raw).length > 64)
        throw new PluginHostRequestError("environment has too many entries");
    const environment: Record<string, string> = {};
    for (const [key, item] of Object.entries(raw)) {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key))
            throw new PluginHostRequestError(`environment key ${key} is invalid`);
        if (typeof item !== "string" || item.length > 64 * 1024 || item.includes("\0"))
            throw new PluginHostRequestError(`environment value ${key} is invalid`);
        environment[key] = item;
    }
    return { command, environment };
}

function requiredCommand(value: unknown): string {
    if (typeof value !== "string" || !value.trim() || value.length > 40_000)
        throw new PluginHostRequestError("command must contain 1-40000 characters");
    if (value.includes("\0") || hasControlCharacters(value, true))
        throw new PluginHostRequestError("command contains unsupported characters");
    return value;
}

function workspacePath(value: unknown): string {
    if (typeof value !== "string" || !value || value.length > 16_384)
        throw new PluginHostRequestError("path is invalid");
    return value;
}

function queryRecord(value: unknown): Record<string, unknown> {
    if (value === undefined) return {};
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new PluginHostRequestError("Query parameters are invalid");
    return value as Record<string, unknown>;
}

function optionalPositiveInteger(value: unknown, name: string): number | undefined {
    if (value === undefined) return undefined;
    const parsed = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value;
    if (!Number.isSafeInteger(parsed) || Number(parsed) < 1)
        throw new PluginHostRequestError(`${name} must be a positive integer`);
    return Number(parsed);
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
    visibility: "public" | "private";
    name: string;
    description?: string;
    idempotencyKey?: string;
    members: PluginUserCapability[];
    initialMessage?: { audience: "agents" | "people"; text: string };
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, [
        "visibility",
        "name",
        "description",
        "idempotencyKey",
        "members",
        "initialMessage",
    ]);
    const visibility = body.visibility ?? "public";
    if (visibility !== "public" && visibility !== "private")
        throw new PluginHostRequestError("visibility must be public or private");
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
        visibility,
        name,
        ...(description ? { description } : {}),
        ...(idempotencyKey ? { idempotencyKey } : {}),
        members,
        ...(initialMessage ? { initialMessage } : {}),
    };
}

function childChannelCreateInput(value: unknown): {
    name: string;
    description?: string;
    agentModelId?: string;
} {
    const body = bodyRecord(value);
    onlyBodyKeys(body, ["name", "description", "agentModelId"]);
    const name = requiredTrimmedString(body.name, "name", 100);
    const description =
        body.description === undefined
            ? undefined
            : requiredTrimmedString(body.description, "description", 500);
    const agentModelId =
        body.agentModelId === undefined ? undefined : identifier(body.agentModelId, "agentModelId");
    return {
        name,
        ...(description ? { description } : {}),
        ...(agentModelId ? { agentModelId } : {}),
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

function requiredMessageText(value: unknown, name = "initialMessage.text"): string {
    if (typeof value !== "string") throw new PluginHostRequestError(`${name} must be a string`);
    if (value.length > 40_000)
        throw new PluginHostRequestError(`${name} must contain at most 40000 characters`);
    if (!value.trim() || hasControlCharacters(value, true))
        throw new PluginHostRequestError(`${name} is empty or contains unsupported characters`);
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
    if (error instanceof PortShareError)
        return reply
            .code(
                error.code === "not_found"
                    ? 404
                    : error.code === "forbidden"
                      ? 403
                      : error.code === "conflict"
                        ? 409
                        : error.code === "not_ready"
                          ? 503
                          : 400,
            )
            .send({ error: error.code, message: error.message });
    if (error instanceof PluginHostRequestError)
        return reply.code(400).send({ error: "invalid_request", message: error.message });
    if (error instanceof WorkspaceError)
        return reply
            .code(error.code === "conflict" ? 409 : error.code === "not_found" ? 404 : 400)
            .send({
                error: `workspace_${error.code}`,
                message: error.message,
                ...(error.code === "conflict" ? { currentHash: error.currentVersion ?? null } : {}),
            });
    return undefined;
}

class PluginHostRequestError extends Error {}
