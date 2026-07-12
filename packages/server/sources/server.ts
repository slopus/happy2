import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { AuthService } from "./modules/auth/service.js";
import { TokenService } from "./modules/auth/tokens.js";
import type { ServerConfig } from "./modules/config/type.js";
import { Database } from "./modules/database.js";
import { CollaborationRepository } from "./modules/collaboration/repository.js";
import { FileStorage } from "./modules/files/storage.js";
import { LocalPubSub, realtimeTopics, type PubSub } from "./modules/realtime/index.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerBasicRoutes } from "./routes/basic.js";
import { registerCollaborationRoutes } from "./routes/collaboration.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerSyncRoutes } from "./routes/sync.js";

interface Services {
    database: Database;
    tokens: TokenService;
    collaboration?: CollaborationRepository;
    pubsub?: PubSub;
    fileStorage?: FileStorage;
    logger?: boolean;
}

export async function buildServer(
    config: ServerConfig,
    supplied?: Services,
): Promise<FastifyInstance> {
    const app = Fastify({
        logger: supplied?.logger ?? true,
        trustProxy: config.server.trustedProxyHops,
    });
    const services = supplied ?? {
        database: new Database(
            config.database.url,
            config.database.authTokenEnv ? process.env[config.database.authTokenEnv] : undefined,
        ),
        tokens: await TokenService.create(config),
    };
    await app.register(cors, { origin: true, credentials: false });
    await app.register(multipart, {
        limits: { files: 1, fileSize: config.files.maxUploadBytes },
    });

    app.setErrorHandler((error, request, reply) => {
        request.log.error(error);
        if (!reply.sent) reply.code(500).send({ error: "internal_server_error" });
    });

    registerBasicRoutes(app);
    const auth = new AuthService(config, services.database, services.tokens);
    registerAuthRoutes(app, config, auth);
    let collaboration: CollaborationRepository | undefined;
    let pubsub: PubSub | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    let pendingSweep: Promise<void> = Promise.resolve();
    const productServer = config.server.role !== "auth";
    if (productServer) {
        collaboration =
            services.collaboration ??
            new CollaborationRepository(
                config.database.url,
                config.database.authTokenEnv
                    ? process.env[config.database.authTokenEnv]
                    : undefined,
            );
        await collaboration.initialize();
        pubsub =
            services.pubsub ??
            new LocalPubSub({
                onSubscriberError: (error) => app.log.error(error),
            });
        registerFileRoutes(
            app,
            config,
            auth,
            services.database,
            services.tokens,
            services.fileStorage ?? new FileStorage(config, services.database),
            collaboration,
        );
        registerCollaborationRoutes(app, auth, collaboration, pubsub);
        registerSyncRoutes(app, auth, collaboration, pubsub);

        let sweepRunning = false;
        expiryTimer = setInterval(() => {
            if (sweepRunning || !collaboration || !pubsub) return;
            sweepRunning = true;
            pendingSweep = collaboration
                .expireDueMessages()
                .then(async (hint) => {
                    if (!hint || !pubsub) return;
                    const event = { type: "sync" as const, ...hint };
                    await pubsub.publish(realtimeTopics.server, event);
                    await Promise.all(
                        hint.chats.map(({ chatId }) =>
                            pubsub!.publish(realtimeTopics.chat(chatId), event),
                        ),
                    );
                })
                .catch((error: unknown) => app.log.error(error))
                .finally(() => {
                    sweepRunning = false;
                });
        }, 1_000);
        expiryTimer.unref();
    }
    app.addHook("onClose", async () => {
        if (expiryTimer) clearInterval(expiryTimer);
        await pendingSweep;
        if (!services.pubsub) await pubsub?.close();
        if (!services.collaboration) collaboration?.close();
        if (!supplied) services.database.close();
    });
    return app;
}
