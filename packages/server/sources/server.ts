import { createHash, randomBytes } from "node:crypto";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { AuthService } from "./modules/auth/service.js";
import { TokenService } from "./modules/auth/tokens.js";
import { AutomationRepository } from "./modules/automation/repository.js";
import type { ServerConfig } from "./modules/config/type.js";
import { Database } from "./modules/database.js";
import { CollaborationRepository } from "./modules/collaboration/repository.js";
import { CollaborationError } from "./modules/collaboration/types.js";
import { FileStorage } from "./modules/files/storage.js";
import { IntegrationRepository } from "./modules/integrations/repository.js";
import { AesGcmSecretProtector } from "./modules/integrations/secrets.js";
import { NodeWebhookTransport } from "./modules/integrations/transport.js";
import type { WebhookTransport } from "./modules/integrations/types.js";
import { OperationsRepository } from "./modules/operations/repository.js";
import { OperationsError } from "./modules/operations/types.js";
import { LocalPubSub, realtimeTopics, type PubSub } from "./modules/realtime/index.js";
import {
    createRateLimitHook,
    DatabaseIdempotencyStore,
    HttpRateLimiter,
    IdempotencyCoordinator,
    LocalRateLimitStore,
    registerIdempotencyHooks,
    type StoredHttpResponse,
} from "./modules/request/index.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAutomationRoutes } from "./routes/automation.js";
import { registerBasicRoutes } from "./routes/basic.js";
import { registerCollaborationRoutes } from "./routes/collaboration.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerOperationsRoutes } from "./routes/operations.js";
import { registerSyncRoutes } from "./routes/sync.js";

interface Services {
    database: Database;
    tokens: TokenService;
    collaboration?: CollaborationRepository;
    pubsub?: PubSub;
    fileStorage?: FileStorage;
    automation?: AutomationRepository;
    integrations?: IntegrationRepository;
    operations?: OperationsRepository;
    webhookTransport?: WebhookTransport;
    rateLimiter?: HttpRateLimiter;
    idempotency?: IdempotencyCoordinator<StoredHttpResponse>;
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
    const rateLimiter =
        services.rateLimiter ??
        new HttpRateLimiter(new LocalRateLimitStore(), {
            onStoreError: (error) => app.log.error(error),
        });
    if (config.security.rateLimit.enabled)
        app.addHook(
            "preHandler",
            createRateLimitHook({
                limiter: rateLimiter,
                policy: (request) => {
                    const authenticationAction =
                        request.method === "POST" && request.url.startsWith("/v0/auth/");
                    const limit = authenticationAction
                        ? config.security.rateLimit.authPerMinute
                        : request.method === "POST"
                          ? config.security.rateLimit.writesPerMinute
                          : config.security.rateLimit.readsPerMinute;
                    return {
                        scope: `${request.method}:${request.routeOptions.url ?? request.url.split("?", 1)[0]}`,
                        ip: { limit, windowMs: 60_000 },
                        actor: authenticationAction ? false : { limit, windowMs: 60_000 },
                    };
                },
                actorId: async (request) => (await auth.authenticate(request))?.user.id,
            }),
        );
    const idempotency =
        services.idempotency ??
        (config.security.idempotency.enabled
            ? new IdempotencyCoordinator<StoredHttpResponse>(
                  new DatabaseIdempotencyStore(services.database.extensionClient()),
                  {
                      leaseMs: config.security.idempotency.leaseSeconds * 1_000,
                      retentionMs: config.security.idempotency.retentionSeconds * 1_000,
                  },
              )
            : undefined);
    if (idempotency) registerIdempotencyHooks(app, auth, idempotency);
    registerAuthRoutes(app, config, auth);
    let collaboration: CollaborationRepository | undefined;
    let pubsub: PubSub | undefined;
    let automation: AutomationRepository | undefined;
    let integrations: IntegrationRepository | undefined;
    let operations: OperationsRepository | undefined;
    let webhookTransport: WebhookTransport | undefined;
    let fileStorage: FileStorage | undefined;
    let unsubscribeWebhookEvents: (() => void) | undefined;
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
        operations =
            services.operations ?? new OperationsRepository(collaboration.extensionClient());
        automation =
            services.automation ??
            new AutomationRepository(collaboration.extensionClient(), collaboration, {
                moderate: async (input) => {
                    try {
                        const result = await operations!.takeModerationAction(input);
                        return { sync: result.sync };
                    } catch (error) {
                        if (error instanceof OperationsError)
                            throw new CollaborationError(error.code, error.message);
                        throw error;
                    }
                },
            });
        integrations =
            services.integrations ??
            new IntegrationRepository(collaboration.extensionClient(), {
                secretProtector: integrationSecretProtector(config, Boolean(supplied)),
            });
        webhookTransport = services.webhookTransport ?? new NodeWebhookTransport();
        fileStorage = services.fileStorage ?? new FileStorage(config, services.database);
        registerFileRoutes(
            app,
            config,
            auth,
            services.database,
            services.tokens,
            fileStorage,
            collaboration,
        );
        registerCollaborationRoutes(app, auth, collaboration, pubsub);
        registerAutomationRoutes(app, auth, automation, pubsub);
        registerOperationsRoutes(app, auth, operations);
        registerIntegrationRoutes(app, auth, integrations, {
            incomingWebhook: {
                sendMessage: async (message) => {
                    const sent = await collaboration!.sendAutomatedMessage({
                        actorUserId: message.actorUserId,
                        chatId: message.chatId,
                        text: message.text,
                        attachmentFileIds: message.attachmentFileIds,
                        botId: message.botId,
                        clientMutationId: message.idempotencyKey
                            ? `incoming:${message.subscriptionId}:${createHash("sha256").update(message.idempotencyKey).digest("hex")}`
                            : `incoming:${message.subscriptionId}:${randomBytes(12).toString("base64url")}`,
                    });
                    const event = { type: "sync" as const, ...sent.hint };
                    await Promise.all([
                        pubsub!.publish(realtimeTopics.server, event),
                        ...sent.hint.chats.map(({ chatId }) =>
                            pubsub!.publish(realtimeTopics.chat(chatId), event),
                        ),
                    ]);
                    return { messageId: sent.message.id, sync: sent.hint };
                },
            },
            onChange: async (change) => {
                await pubsub!.publish(realtimeTopics.server, {
                    type: "sync",
                    sequence: change.sequence,
                    chats: [],
                    areas: [change.kind.startsWith("bot.") ? "bots" : "integrations"],
                });
            },
        });
        registerSyncRoutes(app, auth, collaboration, pubsub);

        unsubscribeWebhookEvents = pubsub.subscribe(realtimeTopics.server, async (event) => {
            if (event.type === "sync") await integrations!.enqueueSyncSequence(event.sequence);
        });

        let sweepRunning = false;
        let lastCompactionAt = 0;
        let lastFileMaintenanceAt = 0;
        let lastObservedSequence = BigInt((await collaboration.getState()).sequence);
        expiryTimer = setInterval(() => {
            if (sweepRunning || !collaboration || !pubsub) return;
            sweepRunning = true;
            const compact = Date.now() - lastCompactionAt >= 60_000;
            if (compact) lastCompactionAt = Date.now();
            const maintainFiles = Date.now() - lastFileMaintenanceAt >= 60 * 60_000;
            if (maintainFiles) lastFileMaintenanceAt = Date.now();
            pendingSweep = Promise.all([
                collaboration.expireDueMessages(),
                automation?.publishDueScheduledMessages() ?? [],
                automation?.runDueAutomations() ?? [],
                automation?.runPendingEventAutomations() ?? [],
                compact ? collaboration.compactSync() : undefined,
                operations?.expireDueBans() ?? 0,
                integrations && webhookTransport
                    ? integrations
                          .enqueuePendingSyncEvents()
                          .then(() => integrations!.dispatchDueWebhooks(webhookTransport!))
                    : undefined,
                maintainFiles && fileStorage
                    ? services.database
                          .listStoredFiles()
                          .then((referencedFiles) =>
                              fileStorage!.runMaintenance({ referencedFiles }),
                          )
                    : undefined,
            ])
                .then(
                    async ([expiryHint, scheduledHints, automationHints, eventAutomationHints]) => {
                        if (!pubsub) return;
                        const hints = [
                            ...(expiryHint ? [expiryHint] : []),
                            ...scheduledHints,
                            ...automationHints,
                            ...eventAutomationHints,
                        ];
                        for (const hint of hints) {
                            const event = { type: "sync" as const, ...hint };
                            await pubsub.publish(realtimeTopics.server, event);
                            await Promise.all(
                                hint.chats.map(({ chatId }) =>
                                    pubsub!.publish(realtimeTopics.chat(chatId), event),
                                ),
                            );
                        }
                        const state = await collaboration!.getState();
                        const currentSequence = BigInt(state.sequence);
                        if (currentSequence > lastObservedSequence) {
                            lastObservedSequence = currentSequence;
                            await pubsub.publish(realtimeTopics.server, {
                                type: "sync",
                                sequence: state.sequence,
                                chats: [],
                                areas: ["all"],
                            });
                        }
                    },
                )
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
        unsubscribeWebhookEvents?.();
        if (!services.pubsub) await pubsub?.close();
        if (!services.integrations) integrations?.close();
        if (!services.operations) operations?.close();
        if (!services.automation) automation?.close();
        if (!services.rateLimiter) await rateLimiter.close();
        if (!services.idempotency) await idempotency?.close();
        if (!services.collaboration) collaboration?.close();
        if (!supplied) services.database.close();
    });
    return app;
}

function integrationSecretProtector(
    config: ServerConfig,
    allowEphemeral: boolean,
): AesGcmSecretProtector {
    const configured = process.env[config.security.integrationSecretEnv];
    if (configured) return AesGcmSecretProtector.fromBase64(configured);
    if (allowEphemeral) return new AesGcmSecretProtector(randomBytes(32));
    throw new Error(
        `${config.security.integrationSecretEnv} is required; run managed environment initialization before building the product server`,
    );
}
