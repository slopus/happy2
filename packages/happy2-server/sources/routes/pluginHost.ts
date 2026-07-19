import Fastify, { type FastifyInstance, type FastifyRequest } from "fastify";
import type { DrizzleExecutor } from "../modules/drizzle.js";
import { pluginInstallationListForHost } from "../modules/plugin/pluginInstallationListForHost.js";
import type { PluginService } from "../modules/plugin/service.js";
import { PluginError } from "../modules/plugin/types.js";

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
    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (!reply.sent) reply.code(500).send({ error: "internal_server_error" });
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
