import { createHash, createHmac } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client } from "@libsql/client";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import { createDatabase, type DrizzleExecutor, type DrizzleTransaction } from "../drizzle.js";
import {
    accounts,
    apiCredentials,
    auditLogEntries,
    botIdentities,
    chatMembers,
    chats,
    files,
    integrations,
    serverSyncState,
    slashCommands,
    syncEvents,
    users,
    webhookDeliveries,
    webhookSubscriptions,
} from "../schema.js";
import {
    generateApiToken,
    generateIncomingWebhookToken,
    generateSigningSecret,
    hashesEqual,
    secretHash,
    tokenPrefix,
    type SecretProtector,
} from "./secrets.js";
import { StrictWebhookUrlPolicy, type WebhookUrlPolicy } from "./ssrf.js";
import {
    IntegrationError,
    integrationKinds,
    integrationScopes,
    type ApiCredentialSummary,
    type AuthenticatedIntegration,
    type BotSummary,
    type IncomingWebhookSink,
    type IncomingWebhookSinkResult,
    type IntegrationChange,
    type IntegrationKind,
    type IntegrationMutation,
    type IntegrationScope,
    type IntegrationSummary,
    type IssuedApiCredential,
    type IssuedIncomingWebhook,
    type IssuedOutgoingWebhook,
    type IssuedSlashCommand,
    type QueuedWebhookDelivery,
    type SlashCommandSummary,
    type WebhookSubscriptionSummary,
    type WebhookTransport,
} from "./types.js";

export interface IntegrationRepositoryOptions {
    secretProtector: SecretProtector;
    urlPolicy?: WebhookUrlPolicy;
    authToken?: string;
    now?: () => Date;
}

interface ClaimedDelivery extends QueuedWebhookDelivery {
    url: string;
    signingSecretCiphertext: string;
    payloadJson: string;
}

const MAX_DELIVERY_RESPONSE = 16_000;
const MAX_EVENT_PAYLOAD = 1_000_000;
const MAX_DELIVERY_ATTEMPTS = 8;

export class IntegrationRepository {
    private readonly client: Client;
    private readonly db;
    private readonly ownsClient: boolean;
    private readonly protector: SecretProtector;
    private readonly urlPolicy: WebhookUrlPolicy;
    private readonly now: () => Date;

    constructor(source: string | Client, options: IntegrationRepositoryOptions) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string"
                ? createClient({ url: source, authToken: options.authToken })
                : source;
        this.protector = options.secretProtector;
        this.urlPolicy = options.urlPolicy ?? new StrictWebhookUrlPolicy();
        this.now = options.now ?? (() => new Date());
        this.db = createDatabase(this.client);
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    async listBots(actorUserId: string): Promise<BotSummary[]> {
        await this.requireAdminDb(this.db, actorUserId);
        const rows = await this.db
            .select({
                id: botIdentities.id,
                name: botIdentities.name,
                username: botIdentities.username,
                description: botIdentities.description,
                photo_file_id: botIdentities.photoFileId,
                owner_user_id: botIdentities.ownerUserId,
                active: botIdentities.active,
                created_at: botIdentities.createdAt,
                updated_at: botIdentities.updatedAt,
            })
            .from(botIdentities)
            .orderBy(desc(botIdentities.createdAt), desc(botIdentities.id));
        return rows.map(asBot);
    }

    async createBot(input: {
        actorUserId: string;
        name: string;
        username: string;
        description?: string;
        photoFileId?: string;
        ownerUserId?: string;
    }): Promise<IntegrationMutation<BotSummary>> {
        const name = requiredTrimmed(input.name, "Bot name", 200);
        const username = normalizedUsername(input.username);
        const description = optionalTrimmed(input.description, "Bot description", 2_000);
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.ownerUserId) await this.requireActiveUserDb(tx, input.ownerUserId);
            if (input.photoFileId) await this.requireFileDb(tx, input.photoFileId);
            const id = createId();
            try {
                await tx.insert(botIdentities).values({
                    id,
                    name,
                    username,
                    description: description ?? null,
                    photoFileId: input.photoFileId ?? null,
                    ownerUserId: input.ownerUserId ?? null,
                    createdByUserId: input.actorUserId,
                });
            } catch (error: unknown) {
                throw constraintConflict(error, "Bot username is already in use");
            }
            const change = await this.recordChangeDb(tx, input.actorUserId, "bot.created", id);
            await this.appendAuditDb(tx, input.actorUserId, "bot.created", "bot", id);
            await tx
                .update(botIdentities)
                .set({ syncSequence: Number(change.sequence) })
                .where(eq(botIdentities.id, id));
            return { value: await this.getBotDb(tx, id), change };
        });
    }

    async updateBot(input: {
        actorUserId: string;
        botId: string;
        name?: string;
        username?: string;
        description?: string | null;
        photoFileId?: string | null;
        ownerUserId?: string | null;
    }): Promise<IntegrationMutation<BotSummary>> {
        if (
            input.name === undefined &&
            input.username === undefined &&
            input.description === undefined &&
            input.photoFileId === undefined &&
            input.ownerUserId === undefined
        )
            throw new IntegrationError("invalid", "At least one bot field is required");
        const name =
            input.name === undefined ? undefined : requiredTrimmed(input.name, "Bot name", 200);
        const username =
            input.username === undefined ? undefined : normalizedUsername(input.username);
        const description =
            input.description === undefined || input.description === null
                ? input.description
                : optionalTrimmed(input.description, "Bot description", 2_000);
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            await this.getBotDb(tx, input.botId, true);
            if (input.ownerUserId) await this.requireActiveUserDb(tx, input.ownerUserId);
            if (input.photoFileId) await this.requireFileDb(tx, input.photoFileId);
            try {
                await tx
                    .update(botIdentities)
                    .set({
                        ...(name === undefined ? {} : { name }),
                        ...(username === undefined ? {} : { username }),
                        ...(input.description === undefined
                            ? {}
                            : { description: description ?? null }),
                        ...(input.photoFileId === undefined
                            ? {}
                            : { photoFileId: input.photoFileId }),
                        ...(input.ownerUserId === undefined
                            ? {}
                            : { ownerUserId: input.ownerUserId }),
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(and(eq(botIdentities.id, input.botId), isNull(botIdentities.deletedAt)));
            } catch (error: unknown) {
                throw constraintConflict(error, "Bot username is already in use");
            }
            const change = await this.recordChangeDb(
                tx,
                input.actorUserId,
                "bot.updated",
                input.botId,
            );
            await this.appendAuditDb(tx, input.actorUserId, "bot.updated", "bot", input.botId);
            await tx
                .update(botIdentities)
                .set({ syncSequence: Number(change.sequence) })
                .where(eq(botIdentities.id, input.botId));
            return { value: await this.getBotDb(tx, input.botId), change };
        });
    }

    async revokeBot(actorUserId: string, botId: string): Promise<IntegrationChange> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, actorUserId);
            const changed = await tx
                .update(botIdentities)
                .set({
                    active: 0,
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(botIdentities.id, botId), isNull(botIdentities.deletedAt)))
                .returning({ id: botIdentities.id });
            if (changed.length === 0) throw new IntegrationError("not_found", "Bot was not found");
            const integrationIds = tx
                .select({ id: integrations.id })
                .from(integrations)
                .where(eq(integrations.botId, botId));
            await tx
                .update(apiCredentials)
                .set({ revokedAt: sql`coalesce(${apiCredentials.revokedAt}, CURRENT_TIMESTAMP)` })
                .where(
                    or(
                        eq(apiCredentials.botId, botId),
                        sql`${apiCredentials.integrationId} in (${integrationIds})`,
                    ),
                );
            await tx
                .update(integrations)
                .set({
                    active: 0,
                    deletedAt: sql`coalesce(${integrations.deletedAt}, CURRENT_TIMESTAMP)`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(integrations.botId, botId));
            const change = await this.recordChangeDb(tx, actorUserId, "bot.revoked", botId);
            await this.appendAuditDb(tx, actorUserId, "bot.revoked", "bot", botId);
            return change;
        });
    }

    async listIntegrations(actorUserId: string): Promise<IntegrationSummary[]> {
        await this.requireAdminDb(this.db, actorUserId);
        const rows = await this.db
            .select(integrationSelection)
            .from(integrations)
            .orderBy(desc(integrations.createdAt), desc(integrations.id));
        return rows.map(asIntegration);
    }

    async createIntegration(input: {
        actorUserId: string;
        kind: "app" | "service_account";
        name: string;
        description?: string;
        botId?: string;
        scopes: readonly IntegrationScope[];
    }): Promise<IntegrationMutation<IntegrationSummary>> {
        return this.createIntegrationRecord(input);
    }

    async revokeIntegration(
        actorUserId: string,
        integrationId: string,
    ): Promise<IntegrationChange> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, actorUserId);
            const changed = await tx
                .update(integrations)
                .set({
                    active: 0,
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(integrations.id, integrationId), isNull(integrations.deletedAt)))
                .returning({ id: integrations.id });
            if (changed.length === 0)
                throw new IntegrationError("not_found", "Integration was not found");
            await tx
                .update(apiCredentials)
                .set({ revokedAt: sql`coalesce(${apiCredentials.revokedAt}, CURRENT_TIMESTAMP)` })
                .where(eq(apiCredentials.integrationId, integrationId));
            await tx
                .update(webhookSubscriptions)
                .set({ active: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(webhookSubscriptions.integrationId, integrationId));
            await tx
                .update(slashCommands)
                .set({ active: 0, updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(eq(slashCommands.integrationId, integrationId));
            const change = await this.recordChangeDb(
                tx,
                actorUserId,
                "integration.revoked",
                integrationId,
            );
            await this.appendAuditDb(
                tx,
                actorUserId,
                "integration.revoked",
                "integration",
                integrationId,
            );
            return change;
        });
    }

    async listApiCredentials(
        actorUserId: string,
        integrationId: string,
    ): Promise<ApiCredentialSummary[]> {
        await this.requireAdminDb(this.db, actorUserId);
        await this.requireIntegrationDb(this.db, integrationId, false);
        const rows = await this.db
            .select(credentialSelection)
            .from(apiCredentials)
            .where(eq(apiCredentials.integrationId, integrationId))
            .orderBy(desc(apiCredentials.createdAt), desc(apiCredentials.id));
        return rows.map(asCredential);
    }

    async createApiCredential(input: {
        actorUserId: string;
        integrationId: string;
        name: string;
        scopes?: readonly IntegrationScope[];
        expiresAt?: string;
    }): Promise<IssuedApiCredential> {
        const name = requiredTrimmed(input.name, "Credential name", 200);
        const expiresAt = input.expiresAt ? futureDate(input.expiresAt, this.now()) : undefined;
        const token = generateApiToken();
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            const integration = await this.requireIntegrationDb(tx, input.integrationId, true);
            const scopes = input.scopes ? normalizeScopes(input.scopes) : integration.scopes;
            requireScopeSubset(scopes, integration.scopes);
            const id = createId();
            await tx.insert(apiCredentials).values({
                id,
                integrationId: input.integrationId,
                name,
                tokenPrefix: tokenPrefix(token),
                tokenHash: secretHash(token),
                scopesJson: JSON.stringify(scopes),
                createdByUserId: input.actorUserId,
                expiresAt: expiresAt ?? null,
            });
            await this.appendAuditDb(
                tx,
                input.actorUserId,
                "integration.credential_created",
                "api_credential",
                id,
                { integrationId: input.integrationId, scopes },
            );
            const [row] = await tx
                .select(credentialSelection)
                .from(apiCredentials)
                .where(eq(apiCredentials.id, id));
            if (!row) throw new Error("API credential was not created");
            return { credential: asCredential(row), token };
        });
    }

    async revokeApiCredential(actorUserId: string, credentialId: string): Promise<void> {
        await this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, actorUserId);
            const changed = await tx
                .update(apiCredentials)
                .set({ revokedAt: sql`CURRENT_TIMESTAMP` })
                .where(and(eq(apiCredentials.id, credentialId), isNull(apiCredentials.revokedAt)))
                .returning({ id: apiCredentials.id });
            if (changed.length === 0)
                throw new IntegrationError("not_found", "API credential was not found");
            await this.appendAuditDb(
                tx,
                actorUserId,
                "integration.credential_revoked",
                "api_credential",
                credentialId,
            );
        });
    }

    async authenticateApiCredential(
        token: string,
        requiredScopes: readonly IntegrationScope[] = [],
    ): Promise<AuthenticatedIntegration | undefined> {
        if (!token.startsWith("rgd_api_") || token.length > 256) return undefined;
        const requested = normalizeScopes(requiredScopes);
        const candidates = await this.db
            .select({
                id: apiCredentials.id,
                integrationId: apiCredentials.integrationId,
                tokenHash: apiCredentials.tokenHash,
                credentialScopesJson: apiCredentials.scopesJson,
                integrationScopesJson: integrations.scopesJson,
                botId: integrations.botId,
                createdByUserId: integrations.createdByUserId,
            })
            .from(apiCredentials)
            .innerJoin(integrations, eq(integrations.id, apiCredentials.integrationId))
            .innerJoin(users, eq(users.id, integrations.createdByUserId))
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(apiCredentials.tokenPrefix, tokenPrefix(token)),
                    isNull(apiCredentials.revokedAt),
                    or(
                        isNull(apiCredentials.expiresAt),
                        gt(sql`datetime(${apiCredentials.expiresAt})`, sql`CURRENT_TIMESTAMP`),
                    ),
                    eq(integrations.active, 1),
                    isNull(integrations.deletedAt),
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        const digest = secretHash(token);
        const row = candidates.find((candidate) => hashesEqual(candidate.tokenHash, digest));
        if (!row) return undefined;
        const credentialScopes = parseScopes(row.credentialScopesJson);
        const integrationScopeValues = parseScopes(row.integrationScopesJson);
        const effective = credentialScopes.filter((scope) =>
            integrationScopeValues.includes(scope),
        );
        if (requested.some((scope) => !effective.includes(scope))) return undefined;
        await this.db
            .update(apiCredentials)
            .set({ lastUsedAt: sql`CURRENT_TIMESTAMP` })
            .where(and(eq(apiCredentials.id, row.id), isNull(apiCredentials.revokedAt)));
        return {
            credentialId: row.id,
            integrationId: row.integrationId!,
            actorUserId: row.createdByUserId!,
            botId: row.botId ?? undefined,
            scopes: effective,
        };
    }

    async createIncomingWebhook(input: {
        actorUserId: string;
        name: string;
        description?: string;
        botId: string;
        chatId: string;
    }): Promise<IntegrationMutation<IssuedIncomingWebhook>> {
        const token = generateIncomingWebhookToken();
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            await this.requireBotDb(tx, input.botId);
            await this.requireChatDb(tx, input.chatId);
            const integration = await this.insertIntegrationDb(tx, {
                actorUserId: input.actorUserId,
                kind: "incoming_webhook",
                name: input.name,
                description: input.description,
                botId: input.botId,
                scopes: ["messages:write"],
            });
            const subscriptionId = createId();
            await tx.insert(webhookSubscriptions).values({
                id: subscriptionId,
                integrationId: integration.id,
                direction: "incoming",
                chatId: input.chatId,
                tokenHash: secretHash(token),
                eventTypesJson: "[]",
            });
            const change = await this.finishIntegrationChangeDb(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegrationDb(tx, integration.id),
                    subscription: await this.getSubscriptionDb(tx, subscriptionId),
                    token,
                },
                change,
            };
        });
    }

    async invokeIncomingWebhook(
        token: string,
        textValue: string,
        sink: IncomingWebhookSink,
        idempotencyKey?: string,
    ): Promise<IncomingWebhookSinkResult> {
        if (!token.startsWith("rgd_hook_") || token.length > 256)
            throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
        const textBody = requiredText(textValue, "Webhook message", 40_000);
        if (
            idempotencyKey !== undefined &&
            (idempotencyKey.length === 0 ||
                idempotencyKey.length > 200 ||
                !/^[\x21-\x7e]+$/.test(idempotencyKey))
        )
            throw new IntegrationError("invalid", "Idempotency key is invalid");
        const [row] = await this.db
            .select({
                id: webhookSubscriptions.id,
                chatId: webhookSubscriptions.chatId,
                integrationId: integrations.id,
                botId: integrations.botId,
                scopesJson: integrations.scopesJson,
                createdByUserId: integrations.createdByUserId,
            })
            .from(webhookSubscriptions)
            .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
            .innerJoin(users, eq(users.id, integrations.createdByUserId))
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(webhookSubscriptions.direction, "incoming"),
                    eq(webhookSubscriptions.tokenHash, secretHash(token)),
                    eq(webhookSubscriptions.active, 1),
                    eq(integrations.kind, "incoming_webhook"),
                    eq(integrations.active, 1),
                    isNull(integrations.deletedAt),
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!row || !parseScopes(row.scopesJson).includes("messages:write"))
            throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
        const chatId = row.chatId ?? undefined;
        const botId = row.botId ?? undefined;
        const actorUserId = row.createdByUserId ?? undefined;
        if (!chatId || !botId || !actorUserId)
            throw new IntegrationError("forbidden", "Incoming webhook is no longer configured");
        return sink.sendMessage({
            actorUserId,
            integrationId: row.integrationId,
            subscriptionId: row.id,
            botId,
            chatId,
            text: textBody,
            ...(idempotencyKey ? { idempotencyKey } : {}),
        });
    }

    async createOutgoingWebhook(input: {
        actorUserId: string;
        name: string;
        description?: string;
        url: string;
        eventTypes: readonly string[];
        chatId?: string;
    }): Promise<IntegrationMutation<IssuedOutgoingWebhook>> {
        const url = this.urlPolicy.validateForStorage(input.url);
        const eventTypes = normalizeEventTypes(input.eventTypes);
        const signingSecret = generateSigningSecret();
        const ciphertext = await this.protector.protect(signingSecret);
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.chatId) await this.requireChatDb(tx, input.chatId);
            const integration = await this.insertIntegrationDb(tx, {
                actorUserId: input.actorUserId,
                kind: "outgoing_webhook",
                name: input.name,
                description: input.description,
                scopes: ["events:read"],
            });
            const subscriptionId = createId();
            await tx.insert(webhookSubscriptions).values({
                id: subscriptionId,
                integrationId: integration.id,
                direction: "outgoing",
                chatId: input.chatId ?? null,
                url,
                signingSecretCiphertext: ciphertext,
                eventTypesJson: JSON.stringify(eventTypes),
            });
            const change = await this.finishIntegrationChangeDb(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegrationDb(tx, integration.id),
                    subscription: await this.getSubscriptionDb(tx, subscriptionId),
                    signingSecret,
                },
                change,
            };
        });
    }

    async listWebhookSubscriptions(
        actorUserId: string,
        integrationId: string,
    ): Promise<WebhookSubscriptionSummary[]> {
        await this.requireAdminDb(this.db, actorUserId);
        await this.requireIntegrationDb(this.db, integrationId, false);
        const rows = await this.db
            .select(subscriptionSelection)
            .from(webhookSubscriptions)
            .where(eq(webhookSubscriptions.integrationId, integrationId))
            .orderBy(desc(webhookSubscriptions.createdAt), desc(webhookSubscriptions.id));
        return rows.map(asSubscription);
    }

    async enqueueOutgoingEvent(input: {
        eventId: string;
        eventType: string;
        chatId?: string;
        payload: Record<string, unknown>;
    }): Promise<QueuedWebhookDelivery[]> {
        boundedIdentifier(input.eventId, "Event id");
        const eventType = normalizedEventType(input.eventType);
        const payloadJson = serializedPayload({
            eventId: input.eventId,
            eventType,
            occurredAt: this.now().toISOString(),
            payload: input.payload,
        });
        return this.writeDb(async (tx) => {
            const subscriptions = await tx
                .select({ id: webhookSubscriptions.id })
                .from(webhookSubscriptions)
                .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
                .where(
                    and(
                        eq(webhookSubscriptions.direction, "outgoing"),
                        eq(webhookSubscriptions.active, 1),
                        eq(integrations.active, 1),
                        isNull(integrations.deletedAt),
                        or(
                            isNull(webhookSubscriptions.chatId),
                            eq(webhookSubscriptions.chatId, input.chatId ?? ""),
                        ),
                        sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = ${eventType})`,
                        sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'events:read')`,
                    ),
                )
                .orderBy(asc(webhookSubscriptions.id));
            const deliveries: QueuedWebhookDelivery[] = [];
            for (const row of subscriptions) {
                const subscriptionId = row.id;
                const id = createId();
                await tx
                    .insert(webhookDeliveries)
                    .values({
                        id,
                        subscriptionId,
                        eventId: input.eventId,
                        eventType,
                        payloadJson,
                        nextAttemptAt: this.now().toISOString(),
                    })
                    .onConflictDoNothing();
                const [delivery] = await tx
                    .select(deliverySelection)
                    .from(webhookDeliveries)
                    .where(
                        and(
                            eq(webhookDeliveries.subscriptionId, subscriptionId),
                            eq(webhookDeliveries.eventId, input.eventId),
                        ),
                    );
                if (delivery) deliveries.push(asDelivery(delivery));
            }
            return deliveries;
        });
    }

    /**
     * Converts durable sync rows into idempotently queued outgoing events. Calling
     * this again after a crash is safe because each delivery uses the sync row id.
     */
    async enqueueSyncSequence(sequence: string): Promise<QueuedWebhookDelivery[]> {
        if (!/^\d+$/.test(sequence))
            throw new IntegrationError("invalid", "Sync sequence is invalid");
        const events = await this.db
            .select()
            .from(syncEvents)
            .where(eq(syncEvents.sequence, Number(sequence)))
            .orderBy(asc(syncEvents.id));
        const deliveries: QueuedWebhookDelivery[] = [];
        for (const event of events) {
            deliveries.push(
                ...(await this.enqueueOutgoingEvent({
                    eventId: `sync:${event.id}`,
                    eventType: event.kind,
                    chatId: event.chatId ?? undefined,
                    payload: {
                        syncEventId: String(event.id),
                        sequence: String(event.sequence),
                        chatId: event.chatId ?? undefined,
                        chatPts: event.chatPts === null ? undefined : String(event.chatPts),
                        entityId: event.entityId ?? undefined,
                        actorUserId: event.actorUserId ?? undefined,
                        targetUserId: event.targetUserId ?? undefined,
                        createdAt: event.createdAt,
                    },
                })),
            );
        }
        return deliveries;
    }

    /** Recovers sync rows missed by ephemeral pubsub delivery, without a local cursor. */
    async enqueuePendingSyncEvents(limit = 100): Promise<QueuedWebhookDelivery[]> {
        positiveLimit(limit, 1_000);
        const alreadyQueued = this.db
            .select({ id: webhookDeliveries.id })
            .from(webhookDeliveries)
            .where(
                and(
                    eq(webhookDeliveries.subscriptionId, webhookSubscriptions.id),
                    eq(webhookDeliveries.eventId, sql`'sync:' || ${syncEvents.id}`),
                ),
            );
        const eligibleSubscription = this.db
            .select({ id: webhookSubscriptions.id })
            .from(webhookSubscriptions)
            .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
            .where(
                and(
                    eq(webhookSubscriptions.direction, "outgoing"),
                    eq(webhookSubscriptions.active, 1),
                    eq(integrations.active, 1),
                    isNull(integrations.deletedAt),
                    sql`julianday(${syncEvents.createdAt}) >= julianday(${webhookSubscriptions.createdAt})`,
                    or(
                        isNull(webhookSubscriptions.chatId),
                        eq(webhookSubscriptions.chatId, syncEvents.chatId),
                    ),
                    sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = ${syncEvents.kind})`,
                    sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'events:read')`,
                    sql`not exists ${alreadyQueued}`,
                ),
            );
        const firstEventId = sql<number>`min(${syncEvents.id})`;
        const sequences = await this.db
            .select({ sequence: syncEvents.sequence, firstEventId })
            .from(syncEvents)
            .where(sql`exists ${eligibleSubscription}`)
            .groupBy(syncEvents.sequence)
            .orderBy(firstEventId)
            .limit(limit);
        const deliveries: QueuedWebhookDelivery[] = [];
        for (const row of sequences)
            deliveries.push(...(await this.enqueueSyncSequence(String(row.sequence))));
        return deliveries;
    }

    async listWebhookDeliveries(
        actorUserId: string,
        integrationId: string,
        limit = 100,
    ): Promise<QueuedWebhookDelivery[]> {
        await this.requireAdminDb(this.db, actorUserId);
        positiveLimit(limit, 200);
        await this.requireIntegrationDb(this.db, integrationId, false);
        const rows = await this.db
            .select(deliverySelection)
            .from(webhookDeliveries)
            .innerJoin(
                webhookSubscriptions,
                eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
            )
            .where(eq(webhookSubscriptions.integrationId, integrationId))
            .orderBy(desc(webhookDeliveries.createdAt), desc(webhookDeliveries.id))
            .limit(limit);
        return rows.map(asDelivery);
    }

    async createSlashCommand(input: {
        actorUserId: string;
        name: string;
        description?: string;
        command: string;
        usageHint?: string;
        handlerUrl: string;
        botId?: string;
    }): Promise<IntegrationMutation<IssuedSlashCommand>> {
        const command = normalizedCommand(input.command);
        const handlerUrl = this.urlPolicy.validateForStorage(input.handlerUrl);
        const signingSecret = generateSigningSecret();
        const ciphertext = await this.protector.protect(signingSecret);
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.botId) await this.requireBotDb(tx, input.botId);
            const integration = await this.insertIntegrationDb(tx, {
                actorUserId: input.actorUserId,
                kind: "slash_command",
                name: input.name,
                description: input.description,
                botId: input.botId,
                scopes: ["commands:receive"],
            });
            const commandId = createId();
            try {
                await tx.insert(slashCommands).values({
                    id: commandId,
                    integrationId: integration.id,
                    command,
                    description:
                        optionalTrimmed(input.description, "Command description", 500) ?? null,
                    usageHint: optionalTrimmed(input.usageHint, "Usage hint", 500) ?? null,
                    handlerUrl,
                });
            } catch (error: unknown) {
                throw constraintConflict(error, "Slash command is already registered");
            }
            await tx.insert(webhookSubscriptions).values({
                id: createId(),
                integrationId: integration.id,
                direction: "outgoing",
                url: handlerUrl,
                signingSecretCiphertext: ciphertext,
                eventTypesJson: JSON.stringify([slashEventType(commandId)]),
            });
            const change = await this.finishIntegrationChangeDb(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegrationDb(tx, integration.id),
                    command: await this.getSlashCommandDb(tx, commandId),
                    signingSecret,
                },
                change,
            };
        });
    }

    async listSlashCommands(actorUserId: string): Promise<SlashCommandSummary[]> {
        await this.requireActiveUserDb(this.db, actorUserId);
        const rows = await this.db
            .select(slashCommandSelection)
            .from(slashCommands)
            .innerJoin(integrations, eq(integrations.id, slashCommands.integrationId))
            .where(
                and(
                    eq(slashCommands.active, 1),
                    eq(integrations.active, 1),
                    isNull(integrations.deletedAt),
                ),
            )
            .orderBy(asc(slashCommands.command));
        return rows.map(asSlashCommand);
    }

    async invokeSlashCommand(input: {
        actorUserId: string;
        chatId: string;
        command: string;
        text?: string;
    }): Promise<QueuedWebhookDelivery> {
        const command = normalizedCommand(input.command);
        const commandText = optionalTextBody(input.text, "Command text", 20_000) ?? "";
        return this.writeDb(async (tx) => {
            await this.requireChatMemberDb(tx, input.actorUserId, input.chatId);
            const commandRow = await this.findSlashSubscriptionDb(tx, command);
            if (!commandRow) throw new IntegrationError("not_found", "Slash command was not found");
            const eventId = `slash:${createId()}`;
            const eventType = slashEventType(commandRow.id);
            const payload = serializedPayload({
                eventId,
                eventType,
                occurredAt: this.now().toISOString(),
                payload: {
                    command,
                    text: commandText,
                    chatId: input.chatId,
                    actorUserId: input.actorUserId,
                    integrationId: commandRow.integrationId,
                },
            });
            const deliveryId = createId();
            await tx.insert(webhookDeliveries).values({
                id: deliveryId,
                subscriptionId: commandRow.subscriptionId,
                eventId,
                eventType,
                payloadJson: payload,
                nextAttemptAt: this.now().toISOString(),
            });
            const [delivery] = await tx
                .select(deliverySelection)
                .from(webhookDeliveries)
                .where(eq(webhookDeliveries.id, deliveryId));
            if (!delivery) throw new Error("Slash command invocation was not queued");
            return asDelivery(delivery);
        });
    }

    async dispatchDueWebhooks(
        transport: WebhookTransport,
        options: { limit?: number; leaseMs?: number; maxAttempts?: number } = {},
    ): Promise<{ delivered: number; failed: number }> {
        const limit = positiveLimit(options.limit ?? 25, 100);
        const leaseMs = positiveLimit(options.leaseMs ?? 30_000, 300_000);
        const maxAttempts = positiveLimit(options.maxAttempts ?? MAX_DELIVERY_ATTEMPTS, 20);
        const claimed = await this.claimDueDeliveries(limit, leaseMs, maxAttempts);
        let delivered = 0;
        let failed = 0;
        for (const delivery of claimed) {
            try {
                const target = await this.urlPolicy.resolveForDelivery(delivery.url);
                const secret = await this.protector.reveal(delivery.signingSecretCiphertext);
                const timestamp = Math.floor(this.now().getTime() / 1_000).toString();
                const signature = `v1=${createHmac("sha256", secret)
                    .update(`${timestamp}.${delivery.payloadJson}`, "utf8")
                    .digest("hex")}`;
                const response = await transport.deliver({
                    deliveryId: delivery.id,
                    eventId: delivery.eventId,
                    eventType: delivery.eventType,
                    url: target.url,
                    allowedAddresses: target.addresses,
                    body: delivery.payloadJson,
                    headers: {
                        "content-type": "application/json",
                        "x-rigged-event-id": delivery.eventId,
                        "x-rigged-signature": signature,
                        "x-rigged-timestamp": timestamp,
                    },
                });
                if (response.statusCode < 200 || response.statusCode >= 300)
                    throw new DeliveryHttpError(response.statusCode, response.body);
                await this.completeDelivery(delivery, response.statusCode, response.body);
                delivered += 1;
            } catch (error: unknown) {
                await this.failDelivery(delivery, error, maxAttempts);
                failed += 1;
            }
        }
        return { delivered, failed };
    }

    private async createIntegrationRecord(input: {
        actorUserId: string;
        kind: IntegrationKind;
        name: string;
        description?: string;
        botId?: string;
        scopes: readonly IntegrationScope[];
    }): Promise<IntegrationMutation<IntegrationSummary>> {
        return this.writeDb(async (tx) => {
            await this.requireAdminDb(tx, input.actorUserId);
            if (input.botId) await this.requireBotDb(tx, input.botId);
            const integration = await this.insertIntegrationDb(tx, input);
            const change = await this.finishIntegrationChangeDb(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return { value: await this.getIntegrationDb(tx, integration.id), change };
        });
    }

    private async claimDueDeliveries(
        limit: number,
        leaseMs: number,
        maxAttempts: number,
    ): Promise<ClaimedDelivery[]> {
        const now = this.now();
        const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
        return this.writeDb(async (tx) => {
            const due = await tx
                .select({ id: webhookDeliveries.id })
                .from(webhookDeliveries)
                .innerJoin(
                    webhookSubscriptions,
                    eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
                )
                .innerJoin(integrations, eq(integrations.id, webhookSubscriptions.integrationId))
                .where(
                    and(
                        sql`${webhookDeliveries.attempts} < ${maxAttempts}`,
                        or(
                            sql`${webhookDeliveries.status} in ('pending', 'failed')`,
                            and(
                                eq(webhookDeliveries.status, "delivering"),
                                lte(
                                    sql`julianday(${webhookDeliveries.nextAttemptAt})`,
                                    sql`julianday(${now.toISOString()})`,
                                ),
                            ),
                        ),
                        lte(
                            sql`julianday(${webhookDeliveries.nextAttemptAt})`,
                            sql`julianday(${now.toISOString()})`,
                        ),
                        eq(webhookSubscriptions.active, 1),
                        eq(webhookSubscriptions.direction, "outgoing"),
                        eq(integrations.active, 1),
                        isNull(integrations.deletedAt),
                    ),
                )
                .orderBy(asc(webhookDeliveries.nextAttemptAt), asc(webhookDeliveries.id))
                .limit(limit);
            const claimed: ClaimedDelivery[] = [];
            for (const candidate of due) {
                const id = candidate.id;
                const changed = await tx
                    .update(webhookDeliveries)
                    .set({
                        status: "delivering",
                        attempts: sql`${webhookDeliveries.attempts} + 1`,
                        nextAttemptAt: leaseUntil,
                    })
                    .where(
                        and(
                            eq(webhookDeliveries.id, id),
                            sql`${webhookDeliveries.attempts} < ${maxAttempts}`,
                            or(
                                sql`${webhookDeliveries.status} in ('pending', 'failed')`,
                                and(
                                    eq(webhookDeliveries.status, "delivering"),
                                    lte(
                                        sql`julianday(${webhookDeliveries.nextAttemptAt})`,
                                        sql`julianday(${now.toISOString()})`,
                                    ),
                                ),
                            ),
                        ),
                    )
                    .returning({ id: webhookDeliveries.id });
                if (changed.length === 0) continue;
                const [row] = await tx
                    .select({
                        ...deliverySelection,
                        payload_json: webhookDeliveries.payloadJson,
                        url: webhookSubscriptions.url,
                        signing_secret_ciphertext: webhookSubscriptions.signingSecretCiphertext,
                    })
                    .from(webhookDeliveries)
                    .innerJoin(
                        webhookSubscriptions,
                        eq(webhookSubscriptions.id, webhookDeliveries.subscriptionId),
                    )
                    .where(eq(webhookDeliveries.id, id));
                if (row) claimed.push(asClaimedDelivery(row));
            }
            return claimed;
        });
    }

    private async completeDelivery(
        delivery: ClaimedDelivery,
        responseStatus: number,
        responseBody?: string,
    ): Promise<void> {
        await this.db
            .update(webhookDeliveries)
            .set({
                status: "delivered",
                responseStatus,
                responseBody: truncate(responseBody, MAX_DELIVERY_RESPONSE) ?? null,
                lastError: null,
                deliveredAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(webhookDeliveries.id, delivery.id),
                    eq(webhookDeliveries.status, "delivering"),
                    eq(webhookDeliveries.nextAttemptAt, delivery.nextAttemptAt),
                ),
            );
    }

    private async failDelivery(
        delivery: ClaimedDelivery,
        error: unknown,
        maxAttempts: number,
    ): Promise<void> {
        const response = error instanceof DeliveryHttpError ? error : undefined;
        const exhausted = delivery.attempts >= maxAttempts;
        const nextAttemptAt = exhausted
            ? this.now().toISOString()
            : new Date(
                  this.now().getTime() + retryDelay(delivery.id, delivery.attempts),
              ).toISOString();
        await this.db
            .update(webhookDeliveries)
            .set({
                status: "failed",
                nextAttemptAt,
                responseStatus: response?.statusCode ?? null,
                responseBody: truncate(response?.responseBody, MAX_DELIVERY_RESPONSE) ?? null,
                lastError: truncate(errorMessage(error), 2_000)!,
            })
            .where(
                and(
                    eq(webhookDeliveries.id, delivery.id),
                    eq(webhookDeliveries.status, "delivering"),
                    eq(webhookDeliveries.nextAttemptAt, delivery.nextAttemptAt),
                ),
            );
    }

    private async requireAdminDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const [row] = await executor
            .select({ id: users.id })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    eq(users.role, "admin"),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!row) throw new IntegrationError("forbidden", "Server admin permission is required");
    }

    private async requireActiveUserDb(executor: DrizzleExecutor, userId: string): Promise<void> {
        const [row] = await executor
            .select({ id: users.id })
            .from(users)
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(users.id, userId),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!row) throw new IntegrationError("not_found", "User was not found");
    }

    private async requireChatMemberDb(
        executor: DrizzleExecutor,
        userId: string,
        chatId: string,
    ): Promise<void> {
        const [row] = await executor
            .select({ id: chatMembers.chatId })
            .from(chatMembers)
            .innerJoin(chats, eq(chats.id, chatMembers.chatId))
            .innerJoin(users, eq(users.id, chatMembers.userId))
            .innerJoin(accounts, eq(accounts.id, users.accountId))
            .where(
                and(
                    eq(chatMembers.chatId, chatId),
                    eq(chatMembers.userId, userId),
                    isNull(chatMembers.leftAt),
                    isNull(chats.deletedAt),
                    isNull(chats.archivedAt),
                    isNull(users.deletedAt),
                    eq(accounts.active, 1),
                    isNull(accounts.bannedAt),
                    isNull(accounts.deletedAt),
                ),
            );
        if (!row) throw new IntegrationError("not_found", "Chat was not found");
    }

    private async requireChatDb(executor: DrizzleExecutor, chatId: string): Promise<void> {
        const [row] = await executor
            .select({ id: chats.id })
            .from(chats)
            .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)));
        if (!row) throw new IntegrationError("not_found", "Chat was not found");
    }

    private async requireFileDb(executor: DrizzleExecutor, fileId: string): Promise<void> {
        const [row] = await executor
            .select({ id: files.id })
            .from(files)
            .where(
                and(
                    eq(files.id, fileId),
                    isNull(files.deletedAt),
                    eq(files.uploadStatus, "complete"),
                    sql`${files.scanStatus} != 'infected'`,
                ),
            );
        if (!row) throw new IntegrationError("not_found", "File was not found");
    }

    private async requireBotDb(executor: DrizzleExecutor, botId: string): Promise<void> {
        await this.getBotDb(executor, botId, true);
    }

    private async requireIntegrationDb(
        executor: DrizzleExecutor,
        integrationId: string,
        active: boolean,
    ): Promise<IntegrationSummary> {
        const row = await this.getIntegrationDb(executor, integrationId);
        if (active && !row.active)
            throw new IntegrationError("not_found", "Integration was not found");
        return row;
    }

    private async getBotDb(
        executor: DrizzleExecutor,
        botId: string,
        active = false,
    ): Promise<BotSummary> {
        const [row] = await executor
            .select(botSelection)
            .from(botIdentities)
            .where(eq(botIdentities.id, botId));
        if (!row || (active && (row.active !== 1 || row.deleted_at !== null)))
            throw new IntegrationError("not_found", "Bot was not found");
        return asBot(row);
    }

    private async getIntegrationDb(
        executor: DrizzleExecutor,
        integrationId: string,
    ): Promise<IntegrationSummary> {
        const [row] = await executor
            .select(integrationSelection)
            .from(integrations)
            .where(eq(integrations.id, integrationId));
        if (!row) throw new IntegrationError("not_found", "Integration was not found");
        return asIntegration(row);
    }

    private async getSubscriptionDb(
        executor: DrizzleExecutor,
        subscriptionId: string,
    ): Promise<WebhookSubscriptionSummary> {
        const [row] = await executor
            .select(subscriptionSelection)
            .from(webhookSubscriptions)
            .where(eq(webhookSubscriptions.id, subscriptionId));
        if (!row) throw new Error("Webhook subscription was not created");
        return asSubscription(row);
    }

    private async getSlashCommandDb(
        executor: DrizzleExecutor,
        commandId: string,
    ): Promise<SlashCommandSummary> {
        const [row] = await executor
            .select(slashCommandSelection)
            .from(slashCommands)
            .where(eq(slashCommands.id, commandId));
        if (!row) throw new Error("Slash command was not created");
        return asSlashCommand(row);
    }

    private async findSlashSubscriptionDb(executor: DrizzleExecutor, command: string) {
        const [row] = await executor
            .select({
                id: slashCommands.id,
                integrationId: slashCommands.integrationId,
                subscriptionId: webhookSubscriptions.id,
            })
            .from(slashCommands)
            .innerJoin(integrations, eq(integrations.id, slashCommands.integrationId))
            .innerJoin(
                webhookSubscriptions,
                eq(webhookSubscriptions.integrationId, integrations.id),
            )
            .where(
                and(
                    sql`${slashCommands.command} = ${command} collate nocase`,
                    eq(slashCommands.active, 1),
                    eq(integrations.active, 1),
                    isNull(integrations.deletedAt),
                    sql`exists (select 1 from json_each(${integrations.scopesJson}) where value = 'commands:receive')`,
                    eq(webhookSubscriptions.direction, "outgoing"),
                    eq(webhookSubscriptions.active, 1),
                    sql`exists (select 1 from json_each(${webhookSubscriptions.eventTypesJson}) where value = 'slash_command:' || ${slashCommands.id})`,
                ),
            )
            .limit(1);
        return row;
    }

    private async insertIntegrationDb(
        tx: DrizzleTransaction,
        input: {
            actorUserId: string;
            kind: IntegrationKind;
            name: string;
            description?: string;
            botId?: string;
            scopes: readonly IntegrationScope[];
        },
    ): Promise<{ id: string }> {
        if (!integrationKinds.includes(input.kind))
            throw new IntegrationError("invalid", "Integration kind is invalid");
        const id = createId();
        await tx.insert(integrations).values({
            id,
            kind: input.kind,
            name: requiredTrimmed(input.name, "Integration name", 200),
            description:
                optionalTrimmed(input.description, "Integration description", 2_000) ?? null,
            botId: input.botId ?? null,
            createdByUserId: input.actorUserId,
            scopesJson: JSON.stringify(normalizeScopes(input.scopes)),
        });
        return { id };
    }

    private async finishIntegrationChangeDb(
        tx: DrizzleTransaction,
        actorUserId: string,
        kind: string,
        integrationId: string,
    ): Promise<IntegrationChange> {
        const change = await this.recordChangeDb(tx, actorUserId, kind, integrationId);
        await this.appendAuditDb(tx, actorUserId, kind, "integration", integrationId);
        await tx
            .update(integrations)
            .set({ syncSequence: Number(change.sequence) })
            .where(eq(integrations.id, integrationId));
        return change;
    }

    private async recordChangeDb(
        tx: DrizzleTransaction,
        actorUserId: string,
        kind: string,
        entityId: string,
    ): Promise<IntegrationChange> {
        const [state] = await tx
            .update(serverSyncState)
            .set({ sequence: sql`${serverSyncState.sequence} + 1` })
            .where(eq(serverSyncState.id, 1))
            .returning({ sequence: serverSyncState.sequence });
        if (!state) throw new Error("Server sync state is not initialized");
        await tx.insert(syncEvents).values({
            sequence: state.sequence,
            kind,
            entityId,
            actorUserId,
        });
        return { sequence: String(state.sequence), kind, entityId };
    }

    private async appendAuditDb(
        tx: DrizzleTransaction,
        actorUserId: string,
        action: string,
        targetType: string,
        targetId: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        await tx.insert(auditLogEntries).values({
            id: createId(),
            actorUserId,
            action,
            targetType,
            targetId,
            metadataJson: metadata ? JSON.stringify(metadata) : null,
        });
    }

    private writeDb<T>(operation: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
        return this.db.transaction(operation);
    }
}

const botSelection = {
    id: botIdentities.id,
    name: botIdentities.name,
    username: botIdentities.username,
    description: botIdentities.description,
    photo_file_id: botIdentities.photoFileId,
    owner_user_id: botIdentities.ownerUserId,
    active: botIdentities.active,
    created_at: botIdentities.createdAt,
    updated_at: botIdentities.updatedAt,
    deleted_at: botIdentities.deletedAt,
};

const integrationSelection = {
    id: integrations.id,
    kind: integrations.kind,
    name: integrations.name,
    description: integrations.description,
    bot_id: integrations.botId,
    scopes_json: integrations.scopesJson,
    active: integrations.active,
    created_at: integrations.createdAt,
    updated_at: integrations.updatedAt,
};

const credentialSelection = {
    id: apiCredentials.id,
    integration_id: apiCredentials.integrationId,
    name: apiCredentials.name,
    token_prefix: apiCredentials.tokenPrefix,
    scopes_json: apiCredentials.scopesJson,
    expires_at: apiCredentials.expiresAt,
    last_used_at: apiCredentials.lastUsedAt,
    revoked_at: apiCredentials.revokedAt,
    created_at: apiCredentials.createdAt,
};

const subscriptionSelection = {
    id: webhookSubscriptions.id,
    integration_id: webhookSubscriptions.integrationId,
    direction: webhookSubscriptions.direction,
    chat_id: webhookSubscriptions.chatId,
    url: webhookSubscriptions.url,
    event_types_json: webhookSubscriptions.eventTypesJson,
    active: webhookSubscriptions.active,
    created_at: webhookSubscriptions.createdAt,
    updated_at: webhookSubscriptions.updatedAt,
};

const slashCommandSelection = {
    id: slashCommands.id,
    integration_id: slashCommands.integrationId,
    command: slashCommands.command,
    description: slashCommands.description,
    usage_hint: slashCommands.usageHint,
    active: slashCommands.active,
    created_at: slashCommands.createdAt,
    updated_at: slashCommands.updatedAt,
};

const deliverySelection = {
    id: webhookDeliveries.id,
    subscription_id: webhookDeliveries.subscriptionId,
    event_id: webhookDeliveries.eventId,
    event_type: webhookDeliveries.eventType,
    status: webhookDeliveries.status,
    attempts: webhookDeliveries.attempts,
    next_attempt_at: webhookDeliveries.nextAttemptAt,
    created_at: webhookDeliveries.createdAt,
};

function asBot(row: Record<string, unknown>): BotSummary {
    return {
        id: text(row.id),
        name: text(row.name),
        username: text(row.username),
        description: optionalText(row.description),
        photoFileId: optionalText(row.photo_file_id),
        ownerUserId: optionalText(row.owner_user_id),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asIntegration(row: Record<string, unknown>): IntegrationSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as IntegrationKind,
        name: text(row.name),
        description: optionalText(row.description),
        botId: optionalText(row.bot_id),
        scopes: parseScopes(row.scopes_json),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asCredential(row: Record<string, unknown>): ApiCredentialSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        name: text(row.name),
        tokenPrefix: text(row.token_prefix),
        scopes: parseScopes(row.scopes_json),
        expiresAt: optionalText(row.expires_at),
        lastUsedAt: optionalText(row.last_used_at),
        revokedAt: optionalText(row.revoked_at),
        createdAt: text(row.created_at),
    };
}

function asSubscription(row: Record<string, unknown>): WebhookSubscriptionSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        direction: text(row.direction) as WebhookSubscriptionSummary["direction"],
        chatId: optionalText(row.chat_id),
        url: optionalText(row.url),
        eventTypes: stringArray(row.event_types_json),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asSlashCommand(row: Record<string, unknown>): SlashCommandSummary {
    return {
        id: text(row.id),
        integrationId: text(row.integration_id),
        command: text(row.command),
        description: optionalText(row.description),
        usageHint: optionalText(row.usage_hint),
        active: number(row.active) === 1,
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function asDelivery(row: Record<string, unknown>): QueuedWebhookDelivery {
    return {
        id: text(row.id),
        subscriptionId: text(row.subscription_id),
        eventId: text(row.event_id),
        eventType: text(row.event_type),
        status: text(row.status) as QueuedWebhookDelivery["status"],
        attempts: number(row.attempts),
        nextAttemptAt: text(row.next_attempt_at),
        createdAt: text(row.created_at),
    };
}

function asClaimedDelivery(row: Record<string, unknown>): ClaimedDelivery {
    return {
        ...asDelivery(row),
        url: text(row.url),
        signingSecretCiphertext: text(row.signing_secret_ciphertext),
        payloadJson: text(row.payload_json),
    };
}

function normalizeScopes(values: readonly IntegrationScope[]): IntegrationScope[] {
    const unique = [...new Set(values)];
    if (unique.some((scope) => !integrationScopes.includes(scope)))
        throw new IntegrationError("invalid", "Integration scope is invalid");
    return unique.sort();
}

function parseScopes(value: unknown): IntegrationScope[] {
    const parsed = stringArray(value);
    if (parsed.some((scope) => !integrationScopes.includes(scope as IntegrationScope)))
        throw new Error("Database contains an invalid integration scope");
    return parsed as IntegrationScope[];
}

function requireScopeSubset(requested: IntegrationScope[], allowed: IntegrationScope[]): void {
    if (requested.some((scope) => !allowed.includes(scope)))
        throw new IntegrationError("forbidden", "Credential scope exceeds its integration");
}

function normalizeEventTypes(values: readonly string[]): string[] {
    if (values.length === 0 || values.length > 50)
        throw new IntegrationError("invalid", "Outgoing webhook requires 1-50 event types");
    return [...new Set(values.map(normalizedEventType))].sort();
}

function normalizedEventType(value: string): string {
    const normalized = value.trim();
    if (!/^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/.test(normalized))
        throw new IntegrationError("invalid", "Webhook event type is invalid");
    return normalized;
}

function normalizedCommand(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^\/[a-z0-9][a-z0-9_-]{0,63}$/.test(normalized))
        throw new IntegrationError("invalid", "Slash command is invalid");
    return normalized;
}

function slashEventType(commandId: string): string {
    return `slash_command:${commandId}`;
}

function normalizedUsername(value: string): string {
    const normalized = value.trim().toLowerCase();
    if (!/^[a-z0-9][a-z0-9_.-]{1,31}$/.test(normalized))
        throw new IntegrationError("invalid", "Bot username must contain 2-32 safe characters");
    return normalized;
}

function requiredTrimmed(value: string, name: string, maximum: number): string {
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return normalized;
}

function optionalTrimmed(
    value: string | undefined,
    name: string,
    maximum: number,
): string | undefined {
    if (value === undefined) return undefined;
    const normalized = value.trim();
    if (!normalized || normalized.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return normalized;
}

function requiredText(value: string, name: string, maximum: number): string {
    if (!value.trim() || value.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain 1-${maximum} characters`);
    return value;
}

function optionalTextBody(
    value: string | undefined,
    name: string,
    maximum: number,
): string | undefined {
    if (value === undefined) return undefined;
    if (value.length > maximum)
        throw new IntegrationError("invalid", `${name} must contain at most ${maximum} characters`);
    return value;
}

function futureDate(value: string, now: Date): string {
    const timestamp = Date.parse(value);
    if (!Number.isFinite(timestamp) || timestamp <= now.getTime())
        throw new IntegrationError("invalid", "Credential expiry must be in the future");
    return new Date(timestamp).toISOString();
}

function serializedPayload(value: Record<string, unknown>): string {
    let serialized: string;
    try {
        serialized = JSON.stringify(value);
    } catch {
        throw new IntegrationError("invalid", "Webhook payload must be JSON serializable");
    }
    if (Buffer.byteLength(serialized, "utf8") > MAX_EVENT_PAYLOAD)
        throw new IntegrationError("invalid", "Webhook payload is too large");
    return serialized;
}

function boundedIdentifier(value: string, name: string): void {
    if (!value || value.length > 256 || value.trim() !== value)
        throw new IntegrationError("invalid", `${name} is invalid`);
}

function positiveLimit(value: number, maximum: number): number {
    if (!Number.isSafeInteger(value) || value <= 0 || value > maximum)
        throw new IntegrationError("invalid", `Value must be between 1 and ${maximum}`);
    return value;
}

function retryDelay(deliveryId: string, attempts: number): number {
    const base = Math.min(60 * 60_000, 1_000 * 2 ** Math.max(0, attempts - 1));
    const digest = createHash("sha256").update(`${deliveryId}:${attempts}`).digest();
    const jitter = 0.8 + (digest.readUInt16BE(0) / 65_535) * 0.4;
    return Math.round(base * jitter);
}

function constraintConflict(error: unknown, message: string): unknown {
    const code = (error as { code?: string }).code;
    return code?.includes("CONSTRAINT") ? new IntegrationError("conflict", message) : error;
}

function truncate(value: string | undefined, maximum: number): string | undefined {
    return value === undefined ? undefined : value.slice(0, maximum);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function stringArray(value: unknown): string[] {
    const parsed = JSON.parse(text(value)) as unknown;
    if (!Array.isArray(parsed) || parsed.some((entry) => typeof entry !== "string"))
        throw new Error("Expected JSON string array");
    return parsed;
}

function text(value: unknown): string {
    if (typeof value === "string") return value;
    if (typeof value === "number" || typeof value === "bigint") return String(value);
    throw new Error("Expected database text value");
}

function optionalText(value: unknown): string | undefined {
    return value === null || value === undefined ? undefined : text(value);
}

function number(value: unknown): number {
    if (typeof value === "number") return value;
    if (typeof value === "bigint") return Number(value);
    if (typeof value === "string" && /^-?\d+$/.test(value)) return Number(value);
    throw new Error("Expected database integer value");
}

class DeliveryHttpError extends Error {
    constructor(
        readonly statusCode: number,
        readonly responseBody?: string,
    ) {
        super(`Webhook returned HTTP ${statusCode}`);
    }
}
