import { createHash, randomBytes } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient, type Client } from "@libsql/client";
import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { AuthService } from "./modules/auth/service.js";
import { AgentService, RigDaemonClient } from "./modules/agents/index.js";
import { TokenService } from "./modules/auth/tokens.js";
import { automationRunDue } from "./modules/automation/automationRunDue.js";
import { automationRunPendingEvents } from "./modules/automation/automationRunPendingEvents.js";
import type { AutomationRuntime } from "./modules/automation/types.js";
import type { ServerConfig } from "./modules/config/type.js";
import { fileListStored } from "./modules/file/fileListStored.js";
import { CollaborationError } from "./modules/chat/types.js";
import { messageExpireDue } from "./modules/message/messageExpireDue.js";
import { messageSendAutomated } from "./modules/message/messageSendAutomated.js";
import { syncCompact } from "./modules/sync/syncCompact.js";
import { syncGetState } from "./modules/sync/syncGetState.js";
import { syncInitialize } from "./modules/sync/syncInitialize.js";
import { FileStorage } from "./modules/files/storage.js";
import { AesGcmSecretProtector, type SecretProtector } from "./modules/integrations/secrets.js";
import { StrictWebhookUrlPolicy, type WebhookUrlPolicy } from "./modules/integrations/ssrf.js";
import { NodeWebhookTransport } from "./modules/integrations/transport.js";
import type { WebhookTransport } from "./modules/integrations/types.js";
import { dataExportRunDue } from "./modules/data-export/dataExportRunDue.js";
import { OperationsError } from "./modules/operations/types.js";
import { accountBanExpireDue } from "./modules/moderation/accountBanExpireDue.js";
import { moderationActionTake } from "./modules/moderation/moderationActionTake.js";
import { LocalPubSub, realtimeTopics, type PubSub } from "./modules/realtime/index.js";
import { createDatabase } from "./modules/drizzle.js";
import { setupGetCurrentSyncHint } from "./modules/setup/index.js";
import { setupSandboxProviderGetSelected } from "./modules/setup/setupSandboxProviderGetSelected.js";
import { userLastSeenFinalize } from "./modules/user/userLastSeenFinalize.js";
import {
    localSandboxProviders,
    SandboxProviderCatalog,
    type AgentSandboxRuntime,
    type SandboxProvider,
} from "./modules/sandbox/index.js";
import { scheduledMessagePublishDue } from "./modules/scheduled-message/scheduledMessagePublishDue.js";
import { webhookDeliveryDispatchDue } from "./modules/webhook/webhookDeliveryDispatchDue.js";
import { webhookDeliveryEnqueuePendingSyncEvents } from "./modules/webhook/webhookDeliveryEnqueuePendingSyncEvents.js";
import { webhookDeliveryEnqueueSyncSequence } from "./modules/webhook/webhookDeliveryEnqueueSyncSequence.js";
import { WorkspaceService } from "./modules/workspace/index.js";
import { pluginCatalogLoad, type PluginCatalog } from "./modules/plugin/catalog.js";
import { PluginPackageStore } from "./modules/plugin/packageStore.js";
import {
    NodePluginPackageLinkDownloader,
    type PluginPackageLinkDownloader,
} from "./modules/plugin/packageLinkDownloader.js";
import {
    AesGcmPluginSecretProtector,
    type PluginSecretProtector,
} from "./modules/plugin/secrets.js";
import { SandboxPluginMcpRuntime, type PluginMcpRuntime } from "./modules/plugin/runtime.js";
import { PluginService } from "./modules/plugin/service.js";
import { PluginMcpHttpBridge } from "./modules/plugin/httpBridge.js";
import {
    NodePluginArchiveDownloader,
    type PluginArchiveDownloader,
} from "./modules/plugin/source.js";
import {
    createRateLimitHook,
    HttpRateLimiter,
    IdempotencyCoordinator,
    idempotencyLeaseAcquire,
    idempotencyLeaseComplete,
    idempotencyLeaseRelease,
    idempotencyRecordPurgeExpired,
    LocalRateLimitStore,
    registerIdempotencyHooks,
    type StoredHttpResponse,
} from "./modules/request/index.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerAgentRoutes } from "./routes/agents.js";
import { registerAutomationRoutes } from "./routes/automation.js";
import { registerBasicRoutes } from "./routes/basic.js";
import { registerCollaborationRoutes } from "./routes/collaboration.js";
import { registerFileRoutes } from "./routes/files.js";
import { registerIntegrationRoutes } from "./routes/integrations.js";
import { registerOperationsRoutes } from "./routes/operations.js";
import { registerSyncRoutes } from "./routes/sync.js";
import { registerSetupRoutes } from "./routes/setup.js";
import { registerWorkspaceRoutes } from "./routes/workspace.js";
import { registerPluginRoutes } from "./routes/plugins.js";
import { createPluginHostApi } from "./routes/pluginHost.js";
import { registerPermissionRoutes } from "./routes/permissions.js";

const pluginHostApis = new WeakMap<FastifyInstance, FastifyInstance>();

/** Returns the isolated plugin host listener for black-box harness injection without exposing its routes on the product server. */
export function pluginHostApiFor(app: FastifyInstance): FastifyInstance {
    const hostApi = pluginHostApis.get(app);
    if (!hostApi) throw new Error("This server does not run the plugin host API");
    return hostApi;
}

interface Services {
    client: Client;
    tokens: TokenService;
    pubsub?: PubSub;
    fileStorage?: FileStorage;
    integrationSecretProtector?: SecretProtector;
    webhookUrlPolicy?: WebhookUrlPolicy;
    now?: () => Date;
    webhookTransport?: WebhookTransport;
    rateLimiter?: HttpRateLimiter;
    idempotency?: IdempotencyCoordinator<StoredHttpResponse>;
    agents?: AgentService;
    agentSandbox?: AgentSandboxRuntime;
    sandboxProviders?: readonly SandboxProvider[];
    pluginCatalog?: PluginCatalog;
    pluginMcpRuntime?: PluginMcpRuntime;
    pluginSecretProtector?: PluginSecretProtector;
    pluginArchiveDownloader?: PluginArchiveDownloader;
    pluginPackageLinkDownloader?: PluginPackageLinkDownloader;
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
        client: createClient({
            url: config.database.url,
            authToken: config.database.authTokenEnv
                ? process.env[config.database.authTokenEnv]
                : undefined,
        }),
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
    const productServer = config.server.role !== "auth";
    const executor = createDatabase(services.client);
    let pubsub: PubSub | undefined = productServer
        ? (services.pubsub ??
          new LocalPubSub({
              onSubscriberError: (error) => app.log.error(error),
          }))
        : undefined;
    const auth = new AuthService(config, executor, services.tokens);
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
                  {
                      acquire: (input) => idempotencyLeaseAcquire(executor, input),
                      complete: (input) => idempotencyLeaseComplete(executor, input),
                      release: (storageKey, leaseToken) =>
                          idempotencyLeaseRelease(executor, storageKey, leaseToken),
                      purgeExpired: (now, limit) =>
                          idempotencyRecordPurgeExpired(executor, now, limit),
                  },
                  {
                      leaseMs: config.security.idempotency.leaseSeconds * 1_000,
                      retentionMs: config.security.idempotency.retentionSeconds * 1_000,
                  },
              )
            : undefined);
    if (idempotency) registerIdempotencyHooks(app, auth, idempotency);
    registerAuthRoutes(
        app,
        config,
        auth,
        executor,
        pubsub
            ? async (request, user) => {
                  const hint = await setupGetCurrentSyncHint(executor, [
                      "users",
                      "user-onboarding",
                      ...(user.role === "admin" ? ["setup"] : []),
                  ]);
                  try {
                      await pubsub!.publish(realtimeTopics.server, { type: "sync", ...hint });
                  } catch (error) {
                      request.log.warn({ err: error }, "Could not publish profile sync hint");
                  }
              }
            : undefined,
    );
    let webhookTransport: WebhookTransport | undefined;
    let fileStorage: FileStorage | undefined;
    let unsubscribeWebhookEvents: (() => void) | undefined;
    let unsubscribePresenceEvents: (() => void) | undefined;
    let agentService: AgentService | undefined;
    let workspaceService: WorkspaceService | undefined;
    let pluginService: PluginService | undefined;
    let pluginHostApi: FastifyInstance | undefined;
    let pluginBridge: PluginMcpHttpBridge | undefined;
    let expiryTimer: NodeJS.Timeout | undefined;
    let pendingSweep: Promise<void> = Promise.resolve();
    if (productServer) {
        const livePubsub = pubsub!;
        const now = services.now ?? (() => new Date());
        const secretProtector =
            services.integrationSecretProtector ??
            integrationSecretProtector(config, Boolean(supplied));
        const webhookUrlPolicy = services.webhookUrlPolicy ?? new StrictWebhookUrlPolicy();
        const automationRuntime: AutomationRuntime = {
            moderate: async (input) => {
                try {
                    const result = await moderationActionTake(executor, input);
                    return { sync: result.sync };
                } catch (error) {
                    if (error instanceof OperationsError)
                        throw new CollaborationError(error.code, error.message);
                    throw error;
                }
            },
        };
        await syncInitialize(executor);
        const sandboxProviderCatalog = new SandboxProviderCatalog(
            services.sandboxProviders ?? localSandboxProviders(),
        );
        const sandboxRuntime = services.agentSandbox
            ? async () => services.agentSandbox!
            : async () => {
                  const selected = await setupSandboxProviderGetSelected(executor);
                  if (!selected)
                      throw new Error(
                          "A healthy sandbox provider must be selected before agent execution",
                      );
                  const provider = sandboxProviderCatalog.get(selected.id);
                  if (!provider)
                      throw new Error(
                          `Selected sandbox provider ${selected.id} is not registered by this server`,
                      );
                  return provider;
              };
        const pluginProvider = async () => {
            const selected = await setupSandboxProviderGetSelected(executor);
            if (!selected)
                throw new Error(
                    "A healthy local sandbox provider must be selected before stdio plugin execution",
                );
            const provider = sandboxProviderCatalog.get(selected.id);
            if (!provider)
                throw new Error(
                    `Selected sandbox provider ${selected.id} is not registered by this server`,
                );
            return provider;
        };
        webhookTransport = services.webhookTransport ?? new NodeWebhookTransport();
        const pluginCatalog =
            services.pluginCatalog ??
            (await pluginCatalogLoad(join(dirname(fileURLToPath(import.meta.url)), "../plugins")));
        const pluginSecrets =
            services.pluginSecretProtector ?? pluginSecretProtector(config, Boolean(supplied));
        workspaceService = new WorkspaceService(
            executor,
            livePubsub,
            config.agents.defaultCwd,
            (error) => app.log.error(error),
        );
        pluginService = new PluginService(
            executor,
            livePubsub,
            pluginCatalog,
            new PluginPackageStore(config.plugins.directory),
            services.pluginPackageLinkDownloader ??
                new NodePluginPackageLinkDownloader(webhookUrlPolicy),
            pluginSecrets,
            services.pluginMcpRuntime ?? new SandboxPluginMcpRuntime(pluginProvider),
            services.tokens,
            webhookUrlPolicy,
            webhookTransport,
            `http://happy2.host.internal:${config.plugins.hostApiPort}`,
            services.pluginArchiveDownloader ?? new NodePluginArchiveDownloader(webhookUrlPolicy),
            workspaceService,
            (error) => app.log.error(error),
        );
        agentService =
            services.agents ??
            (config.agents.enabled
                ? new AgentService(
                      executor,
                      livePubsub,
                      new RigDaemonClient(config.agents),
                      sandboxRuntime,
                      config.agents.defaultCwd,
                      pluginService,
                      (error) => app.log.error(error),
                  )
                : undefined);
        pluginHostApi = createPluginHostApi(
            executor,
            pluginService,
            supplied?.logger ?? true,
            agentService,
        );
        pluginHostApis.set(app, pluginHostApi);
        app.addHook("onListen", async () => {
            await pluginHostApi!.listen({
                host: config.plugins.hostApiHost,
                port: config.plugins.hostApiPort,
            });
        });
        registerSetupRoutes(app, auth, executor, livePubsub, sandboxProviderCatalog, agentService);
        pluginBridge = new PluginMcpHttpBridge(pluginService, (error) => app.log.error(error));
        fileStorage = services.fileStorage ?? new FileStorage(config, executor);
        registerFileRoutes(app, config, auth, executor, services.tokens, fileStorage);
        registerCollaborationRoutes(app, auth, executor, livePubsub, agentService);
        if (agentService) registerAgentRoutes(app, auth, agentService);
        registerAutomationRoutes(app, auth, executor, automationRuntime, livePubsub);
        registerOperationsRoutes(app, auth, executor);
        registerIntegrationRoutes(app, auth, executor, secretProtector, webhookUrlPolicy, now, {
            incomingWebhook: {
                sendMessage: async (message) => {
                    const sent = await messageSendAutomated(executor, {
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
        registerPluginRoutes(app, auth, executor, pluginCatalog, pluginService, pluginBridge);
        registerPermissionRoutes(app, auth, executor, livePubsub);
        registerSyncRoutes(app, auth, executor, livePubsub);
        registerWorkspaceRoutes(app, auth, workspaceService);
        try {
            await pluginService.start();
            await agentService?.start();
        } catch (error) {
            await Promise.allSettled([pluginService.close(), agentService?.close()]);
            throw error;
        }

        unsubscribePresenceEvents = livePubsub.subscribe(realtimeTopics.presence, async (event) => {
            if (
                event.type !== "presence" ||
                event.change === "activity" ||
                event.snapshot.status !== "offline" ||
                event.snapshot.lastSeenAt === undefined
            )
                return;
            const hint = await userLastSeenFinalize(executor, event.snapshot.userId);
            await livePubsub.publish(realtimeTopics.server, {
                type: "sync",
                ...hint,
            });
        });

        unsubscribeWebhookEvents = livePubsub.subscribe(realtimeTopics.server, async (event) => {
            if (event.type === "sync")
                await webhookDeliveryEnqueueSyncSequence(executor, now, event.sequence);
        });

        let sweepRunning = false;
        let lastCompactionAt = 0;
        let lastFileMaintenanceAt = 0;
        let lastObservedSequence = BigInt((await syncGetState(executor)).sequence);
        expiryTimer = setInterval(() => {
            if (sweepRunning || !pubsub) return;
            sweepRunning = true;
            const compact = Date.now() - lastCompactionAt >= 60_000;
            if (compact) lastCompactionAt = Date.now();
            const maintainFiles = Date.now() - lastFileMaintenanceAt >= 60 * 60_000;
            if (maintainFiles) lastFileMaintenanceAt = Date.now();
            // Every action shares one libSQL client. Run write-capable maintenance in
            // sequence so the local SQLite adapter never opens competing write transactions.
            pendingSweep = (async () => {
                const expiryHint = await messageExpireDue(executor);
                const scheduledHints = await scheduledMessagePublishDue(executor);
                const automationHints = await automationRunDue(executor, automationRuntime);
                const eventAutomationHints = await automationRunPendingEvents(
                    executor,
                    automationRuntime,
                );
                if (compact) await syncCompact(executor);
                await accountBanExpireDue(executor);
                if (fileStorage) await dataExportRunDue(executor, fileStorage);
                await webhookDeliveryEnqueuePendingSyncEvents(executor, now);
                if (webhookTransport)
                    await webhookDeliveryDispatchDue(
                        executor,
                        webhookUrlPolicy,
                        secretProtector,
                        now,
                        webhookTransport,
                    );
                if (maintainFiles && fileStorage) {
                    const referencedFiles = await fileListStored(executor);
                    await fileStorage.runMaintenance({ referencedFiles });
                }
                return { expiryHint, scheduledHints, automationHints, eventAutomationHints };
            })()
                .then(
                    async ({
                        expiryHint,
                        scheduledHints,
                        automationHints,
                        eventAutomationHints,
                    }) => {
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
                        const state = await syncGetState(executor);
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
        await pluginHostApi?.close();
        await pluginBridge?.close();
        await pluginService?.close();
        await workspaceService?.close();
        await agentService?.close();
        if (expiryTimer) clearInterval(expiryTimer);
        await pendingSweep;
        unsubscribePresenceEvents?.();
        unsubscribeWebhookEvents?.();
        if (!services.pubsub) await pubsub?.close();
        if (!services.rateLimiter) await rateLimiter.close();
        if (!services.idempotency) await idempotency?.close();
        if (!supplied) services.client.close();
    });
    return app;
}

function pluginSecretProtector(
    config: ServerConfig,
    allowEphemeral: boolean,
): AesGcmPluginSecretProtector {
    const configured = process.env[config.security.integrationSecretEnv];
    if (configured) return AesGcmPluginSecretProtector.fromBase64(configured);
    if (allowEphemeral) return new AesGcmPluginSecretProtector(randomBytes(32));
    throw new Error(
        `${config.security.integrationSecretEnv} is required; run managed environment initialization before building the product server`,
    );
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
