import Fastify, { type FastifyInstance } from "fastify";
import multipart from "@fastify/multipart";
import { AuthService } from "./modules/auth/service.js";
import { TokenService } from "./modules/auth/tokens.js";
import type { ServerConfig } from "./modules/config/type.js";
import { Database } from "./modules/database.js";
import { FileStorage } from "./modules/files/storage.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBasicRoutes } from "./routes/basic.js";
import { registerFileRoutes } from "./routes/files.js";

interface Services {
    database: Database;
    tokens: TokenService;
}

export async function buildServer(
    config: ServerConfig,
    supplied?: Services,
): Promise<FastifyInstance> {
    const app = Fastify({ logger: true, trustProxy: config.server.trustedProxyHops });
    const services = supplied ?? {
        database: new Database(
            config.database.url,
            config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
        ),
        tokens: await TokenService.create(config),
    };
    await app.register(multipart, { limits: { files: 1, fileSize: 10 * 1024 * 1024 } });

    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (!reply.sent) reply.code(500).send({ error: "internal_server_error" });
    });

    registerBasicRoutes(app);
    const auth = new AuthService(config, services.database, services.tokens);
    registerAuthRoutes(app, config, auth);
    registerFileRoutes(
        app,
        config,
        auth,
        services.database,
        services.tokens,
        new FileStorage(config, services.database),
    );
    if (!supplied) app.addHook("onClose", () => services.database.close());
    return app;
}
