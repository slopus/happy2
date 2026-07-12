import { createHash, createHmac } from "node:crypto";
import { createId } from "@paralleldrive/cuid2";
import { createClient, type Client, type InArgs, type Row, type Transaction } from "@libsql/client";
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

type Executor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

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
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    async listBots(actorUserId: string): Promise<BotSummary[]> {
        await this.requireAdmin(this.client, actorUserId);
        const result = await this.client.execute(
            `SELECT id, name, username, description, photo_file_id, owner_user_id,
                    active, created_at, updated_at
               FROM bot_identities ORDER BY created_at DESC, id DESC`,
        );
        return result.rows.map(asBot);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.ownerUserId) await this.requireActiveUser(tx, input.ownerUserId);
            if (input.photoFileId) await this.requireFile(tx, input.photoFileId);
            const id = createId();
            try {
                await tx.execute({
                    sql: `INSERT INTO bot_identities
                            (id, name, username, description, photo_file_id, owner_user_id,
                             created_by_user_id)
                          VALUES (?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        name,
                        username,
                        description ?? null,
                        input.photoFileId ?? null,
                        input.ownerUserId ?? null,
                        input.actorUserId,
                    ],
                });
            } catch (error: unknown) {
                throw constraintConflict(error, "Bot username is already in use");
            }
            const change = await this.recordChange(tx, input.actorUserId, "bot.created", id);
            await this.appendAudit(tx, input.actorUserId, "bot.created", "bot", id);
            await tx.execute({
                sql: `UPDATE bot_identities SET sync_sequence = ? WHERE id = ?`,
                args: [change.sequence, id],
            });
            return { value: await this.getBot(tx, id), change };
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            await this.getBot(tx, input.botId, true);
            if (input.ownerUserId) await this.requireActiveUser(tx, input.ownerUserId);
            if (input.photoFileId) await this.requireFile(tx, input.photoFileId);
            try {
                await tx.execute({
                    sql: `UPDATE bot_identities
                             SET name = CASE WHEN ? = 1 THEN ? ELSE name END,
                                 username = CASE WHEN ? = 1 THEN ? ELSE username END,
                                 description = CASE WHEN ? = 1 THEN ? ELSE description END,
                                 photo_file_id = CASE WHEN ? = 1 THEN ? ELSE photo_file_id END,
                                 owner_user_id = CASE WHEN ? = 1 THEN ? ELSE owner_user_id END,
                                 updated_at = CURRENT_TIMESTAMP
                           WHERE id = ? AND deleted_at IS NULL`,
                    args: [
                        name === undefined ? 0 : 1,
                        name ?? null,
                        username === undefined ? 0 : 1,
                        username ?? null,
                        input.description === undefined ? 0 : 1,
                        description ?? null,
                        input.photoFileId === undefined ? 0 : 1,
                        input.photoFileId ?? null,
                        input.ownerUserId === undefined ? 0 : 1,
                        input.ownerUserId ?? null,
                        input.botId,
                    ],
                });
            } catch (error: unknown) {
                throw constraintConflict(error, "Bot username is already in use");
            }
            const change = await this.recordChange(
                tx,
                input.actorUserId,
                "bot.updated",
                input.botId,
            );
            await this.appendAudit(tx, input.actorUserId, "bot.updated", "bot", input.botId);
            await tx.execute({
                sql: `UPDATE bot_identities SET sync_sequence = ? WHERE id = ?`,
                args: [change.sequence, input.botId],
            });
            return { value: await this.getBot(tx, input.botId), change };
        });
    }

    async revokeBot(actorUserId: string, botId: string): Promise<IntegrationChange> {
        return this.write(async (tx) => {
            await this.requireAdmin(tx, actorUserId);
            const result = await tx.execute({
                sql: `UPDATE bot_identities
                         SET active = 0, deleted_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [botId],
            });
            if (!result.rowsAffected) throw new IntegrationError("not_found", "Bot was not found");
            await tx.execute({
                sql: `UPDATE api_credentials SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
                       WHERE bot_id = ? OR integration_id IN
                           (SELECT id FROM integrations WHERE bot_id = ?)`,
                args: [botId, botId],
            });
            await tx.execute({
                sql: `UPDATE integrations SET active = 0, deleted_at = COALESCE(deleted_at, CURRENT_TIMESTAMP),
                             updated_at = CURRENT_TIMESTAMP WHERE bot_id = ?`,
                args: [botId],
            });
            const change = await this.recordChange(tx, actorUserId, "bot.revoked", botId);
            await this.appendAudit(tx, actorUserId, "bot.revoked", "bot", botId);
            return change;
        });
    }

    async listIntegrations(actorUserId: string): Promise<IntegrationSummary[]> {
        await this.requireAdmin(this.client, actorUserId);
        const result = await this.client.execute(
            `${integrationSelect()} ORDER BY created_at DESC, id DESC`,
        );
        return result.rows.map(asIntegration);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, actorUserId);
            const result = await tx.execute({
                sql: `UPDATE integrations
                         SET active = 0, deleted_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [integrationId],
            });
            if (!result.rowsAffected)
                throw new IntegrationError("not_found", "Integration was not found");
            await tx.execute({
                sql: `UPDATE api_credentials SET revoked_at = COALESCE(revoked_at, CURRENT_TIMESTAMP)
                       WHERE integration_id = ?`,
                args: [integrationId],
            });
            await tx.execute({
                sql: `UPDATE webhook_subscriptions SET active = 0, updated_at = CURRENT_TIMESTAMP
                       WHERE integration_id = ?`,
                args: [integrationId],
            });
            await tx.execute({
                sql: `UPDATE slash_commands SET active = 0, updated_at = CURRENT_TIMESTAMP
                       WHERE integration_id = ?`,
                args: [integrationId],
            });
            const change = await this.recordChange(
                tx,
                actorUserId,
                "integration.revoked",
                integrationId,
            );
            await this.appendAudit(
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
        await this.requireAdmin(this.client, actorUserId);
        await this.requireIntegration(this.client, integrationId, false);
        const rows = await this.client.execute({
            sql: `${credentialSelect()} WHERE integration_id = ? ORDER BY created_at DESC, id DESC`,
            args: [integrationId],
        });
        return rows.rows.map(asCredential);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const integration = await this.requireIntegration(tx, input.integrationId, true);
            const scopes = input.scopes ? normalizeScopes(input.scopes) : integration.scopes;
            requireScopeSubset(scopes, integration.scopes);
            const id = createId();
            await tx.execute({
                sql: `INSERT INTO api_credentials
                        (id, integration_id, name, token_prefix, token_hash, scopes_json,
                         created_by_user_id, expires_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.integrationId,
                    name,
                    tokenPrefix(token),
                    secretHash(token),
                    JSON.stringify(scopes),
                    input.actorUserId,
                    expiresAt ?? null,
                ],
            });
            await this.appendAudit(
                tx,
                input.actorUserId,
                "integration.credential_created",
                "api_credential",
                id,
                { integrationId: input.integrationId, scopes },
            );
            const row = await one(tx, `${credentialSelect()} WHERE id = ?`, [id]);
            if (!row) throw new Error("API credential was not created");
            return { credential: asCredential(row), token };
        });
    }

    async revokeApiCredential(actorUserId: string, credentialId: string): Promise<void> {
        await this.write(async (tx) => {
            await this.requireAdmin(tx, actorUserId);
            const result = await tx.execute({
                sql: `UPDATE api_credentials SET revoked_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND revoked_at IS NULL`,
                args: [credentialId],
            });
            if (!result.rowsAffected)
                throw new IntegrationError("not_found", "API credential was not found");
            await this.appendAudit(
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
        const candidates = await this.client.execute({
            sql: `SELECT c.id, c.integration_id, c.token_hash,
                         c.scopes_json AS credential_scopes_json,
                         i.scopes_json AS integration_scopes_json, i.bot_id,
                         i.created_by_user_id
                    FROM api_credentials c
                    JOIN integrations i ON i.id = c.integration_id
                    JOIN users creator ON creator.id = i.created_by_user_id
                    JOIN accounts creator_account ON creator_account.id = creator.account_id
                   WHERE c.token_prefix = ? AND c.revoked_at IS NULL
                     AND (c.expires_at IS NULL OR datetime(c.expires_at) > CURRENT_TIMESTAMP)
                     AND i.active = 1 AND i.deleted_at IS NULL
                     AND creator.role = 'admin' AND creator.deleted_at IS NULL
                     AND creator_account.active = 1 AND creator_account.banned_at IS NULL
                     AND creator_account.deleted_at IS NULL`,
            args: [tokenPrefix(token)],
        });
        const digest = secretHash(token);
        const row = candidates.rows.find((candidate) =>
            hashesEqual(text(candidate.token_hash), digest),
        );
        if (!row) return undefined;
        const credentialScopes = parseScopes(row.credential_scopes_json);
        const integrationScopeValues = parseScopes(row.integration_scopes_json);
        const effective = credentialScopes.filter((scope) =>
            integrationScopeValues.includes(scope),
        );
        if (requested.some((scope) => !effective.includes(scope))) return undefined;
        await this.client.execute({
            sql: `UPDATE api_credentials SET last_used_at = CURRENT_TIMESTAMP
                   WHERE id = ? AND revoked_at IS NULL`,
            args: [text(row.id)],
        });
        return {
            credentialId: text(row.id),
            integrationId: text(row.integration_id),
            actorUserId: text(row.created_by_user_id),
            botId: optionalText(row.bot_id),
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            await this.requireBot(tx, input.botId);
            await this.requireChat(tx, input.chatId);
            const integration = await this.insertIntegration(tx, {
                actorUserId: input.actorUserId,
                kind: "incoming_webhook",
                name: input.name,
                description: input.description,
                botId: input.botId,
                scopes: ["messages:write"],
            });
            const subscriptionId = createId();
            await tx.execute({
                sql: `INSERT INTO webhook_subscriptions
                        (id, integration_id, direction, chat_id, token_hash, event_types_json)
                      VALUES (?, ?, 'incoming', ?, ?, '[]')`,
                args: [subscriptionId, integration.id, input.chatId, secretHash(token)],
            });
            const change = await this.finishIntegrationChange(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegration(tx, integration.id),
                    subscription: await this.getSubscription(tx, subscriptionId),
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
        const row = await one(
            this.client,
            `SELECT ws.id, ws.chat_id, i.id AS integration_id, i.bot_id, i.scopes_json,
                    i.created_by_user_id
               FROM webhook_subscriptions ws
               JOIN integrations i ON i.id = ws.integration_id
               JOIN users creator ON creator.id = i.created_by_user_id
              JOIN accounts creator_account ON creator_account.id = creator.account_id
              WHERE ws.direction = 'incoming' AND ws.token_hash = ? AND ws.active = 1
                AND i.kind = 'incoming_webhook' AND i.active = 1 AND i.deleted_at IS NULL
                AND creator.role = 'admin' AND creator.deleted_at IS NULL
                AND creator_account.active = 1 AND creator_account.banned_at IS NULL
                AND creator_account.deleted_at IS NULL`,
            [secretHash(token)],
        );
        if (!row || !parseScopes(row.scopes_json).includes("messages:write"))
            throw new IntegrationError("unauthorized", "Incoming webhook token is invalid");
        const chatId = optionalText(row.chat_id);
        const botId = optionalText(row.bot_id);
        const actorUserId = optionalText(row.created_by_user_id);
        if (!chatId || !botId || !actorUserId)
            throw new IntegrationError("forbidden", "Incoming webhook is no longer configured");
        return sink.sendMessage({
            actorUserId,
            integrationId: text(row.integration_id),
            subscriptionId: text(row.id),
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.chatId) await this.requireChat(tx, input.chatId);
            const integration = await this.insertIntegration(tx, {
                actorUserId: input.actorUserId,
                kind: "outgoing_webhook",
                name: input.name,
                description: input.description,
                scopes: ["events:read"],
            });
            const subscriptionId = createId();
            await tx.execute({
                sql: `INSERT INTO webhook_subscriptions
                        (id, integration_id, direction, chat_id, url,
                         signing_secret_ciphertext, event_types_json)
                      VALUES (?, ?, 'outgoing', ?, ?, ?, ?)`,
                args: [
                    subscriptionId,
                    integration.id,
                    input.chatId ?? null,
                    url,
                    ciphertext,
                    JSON.stringify(eventTypes),
                ],
            });
            const change = await this.finishIntegrationChange(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegration(tx, integration.id),
                    subscription: await this.getSubscription(tx, subscriptionId),
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
        await this.requireAdmin(this.client, actorUserId);
        await this.requireIntegration(this.client, integrationId, false);
        const rows = await this.client.execute({
            sql: `${subscriptionSelect()} WHERE integration_id = ? ORDER BY created_at DESC, id DESC`,
            args: [integrationId],
        });
        return rows.rows.map(asSubscription);
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
        return this.write(async (tx) => {
            const subscriptions = await tx.execute({
                sql: `SELECT ws.id
                        FROM webhook_subscriptions ws
                        JOIN integrations i ON i.id = ws.integration_id
                       WHERE ws.direction = 'outgoing' AND ws.active = 1
                         AND i.active = 1 AND i.deleted_at IS NULL
                         AND (? IS NULL AND ws.chat_id IS NULL OR ws.chat_id IS NULL OR ws.chat_id = ?)
                         AND EXISTS (SELECT 1 FROM json_each(ws.event_types_json) WHERE value = ?)
                         AND EXISTS (SELECT 1 FROM json_each(i.scopes_json) WHERE value = 'events:read')
                       ORDER BY ws.id`,
                args: [input.chatId ?? null, input.chatId ?? null, eventType],
            });
            const deliveries: QueuedWebhookDelivery[] = [];
            for (const row of subscriptions.rows) {
                const subscriptionId = text(row.id);
                const id = createId();
                await tx.execute({
                    sql: `INSERT OR IGNORE INTO webhook_deliveries
                            (id, subscription_id, event_id, event_type, payload_json)
                          VALUES (?, ?, ?, ?, ?)`,
                    args: [id, subscriptionId, input.eventId, eventType, payloadJson],
                });
                const delivery = await one(
                    tx,
                    `${deliverySelect()} WHERE subscription_id = ? AND event_id = ?`,
                    [subscriptionId, input.eventId],
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
        const events = await this.client.execute({
            sql: `SELECT id, sequence, kind, chat_id, chat_pts, entity_id,
                         actor_user_id, target_user_id, created_at
                    FROM sync_events WHERE sequence = ? ORDER BY id`,
            args: [sequence],
        });
        const deliveries: QueuedWebhookDelivery[] = [];
        for (const event of events.rows) {
            deliveries.push(
                ...(await this.enqueueOutgoingEvent({
                    eventId: `sync:${text(event.id)}`,
                    eventType: text(event.kind),
                    chatId: optionalText(event.chat_id),
                    payload: {
                        syncEventId: text(event.id),
                        sequence: text(event.sequence),
                        chatId: optionalText(event.chat_id),
                        chatPts: optionalText(event.chat_pts),
                        entityId: optionalText(event.entity_id),
                        actorUserId: optionalText(event.actor_user_id),
                        targetUserId: optionalText(event.target_user_id),
                        createdAt: text(event.created_at),
                    },
                })),
            );
        }
        return deliveries;
    }

    /** Recovers sync rows missed by ephemeral pubsub delivery, without a local cursor. */
    async enqueuePendingSyncEvents(limit = 100): Promise<QueuedWebhookDelivery[]> {
        positiveLimit(limit, 1_000);
        const sequences = await this.client.execute({
            sql: `SELECT se.sequence, MIN(se.id) AS first_event_id
                    FROM sync_events se
                   WHERE EXISTS (
                     SELECT 1
                       FROM webhook_subscriptions ws
                       JOIN integrations i ON i.id = ws.integration_id
                      WHERE ws.direction = 'outgoing' AND ws.active = 1
                        AND i.active = 1 AND i.deleted_at IS NULL
                        AND julianday(se.created_at) >= julianday(ws.created_at)
                        AND (ws.chat_id IS NULL OR ws.chat_id = se.chat_id)
                        AND EXISTS (SELECT 1 FROM json_each(ws.event_types_json)
                                     WHERE value = se.kind)
                        AND EXISTS (SELECT 1 FROM json_each(i.scopes_json)
                                     WHERE value = 'events:read')
                        AND NOT EXISTS (
                          SELECT 1 FROM webhook_deliveries d
                           WHERE d.subscription_id = ws.id
                             AND d.event_id = 'sync:' || se.id
                        )
                   )
                   GROUP BY se.sequence
                   ORDER BY first_event_id
                   LIMIT ?`,
            args: [limit],
        });
        const deliveries: QueuedWebhookDelivery[] = [];
        for (const row of sequences.rows)
            deliveries.push(...(await this.enqueueSyncSequence(text(row.sequence))));
        return deliveries;
    }

    async listWebhookDeliveries(
        actorUserId: string,
        integrationId: string,
        limit = 100,
    ): Promise<QueuedWebhookDelivery[]> {
        await this.requireAdmin(this.client, actorUserId);
        positiveLimit(limit, 200);
        await this.requireIntegration(this.client, integrationId, false);
        const rows = await this.client.execute({
            sql: `${deliverySelect()}
                    JOIN webhook_subscriptions ws ON ws.id = webhook_deliveries.subscription_id
                   WHERE ws.integration_id = ?
                   ORDER BY webhook_deliveries.created_at DESC, webhook_deliveries.id DESC LIMIT ?`,
            args: [integrationId, limit],
        });
        return rows.rows.map(asDelivery);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.botId) await this.requireBot(tx, input.botId);
            const integration = await this.insertIntegration(tx, {
                actorUserId: input.actorUserId,
                kind: "slash_command",
                name: input.name,
                description: input.description,
                botId: input.botId,
                scopes: ["commands:receive"],
            });
            const commandId = createId();
            try {
                await tx.execute({
                    sql: `INSERT INTO slash_commands
                            (id, integration_id, command, description, usage_hint, handler_url)
                          VALUES (?, ?, ?, ?, ?, ?)`,
                    args: [
                        commandId,
                        integration.id,
                        command,
                        optionalTrimmed(input.description, "Command description", 500) ?? null,
                        optionalTrimmed(input.usageHint, "Usage hint", 500) ?? null,
                        handlerUrl,
                    ],
                });
            } catch (error: unknown) {
                throw constraintConflict(error, "Slash command is already registered");
            }
            await tx.execute({
                sql: `INSERT INTO webhook_subscriptions
                        (id, integration_id, direction, url, signing_secret_ciphertext,
                         event_types_json)
                      VALUES (?, ?, 'outgoing', ?, ?, ?)`,
                args: [
                    createId(),
                    integration.id,
                    handlerUrl,
                    ciphertext,
                    JSON.stringify([slashEventType(commandId)]),
                ],
            });
            const change = await this.finishIntegrationChange(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return {
                value: {
                    integration: await this.getIntegration(tx, integration.id),
                    command: await this.getSlashCommand(tx, commandId),
                    signingSecret,
                },
                change,
            };
        });
    }

    async listSlashCommands(actorUserId: string): Promise<SlashCommandSummary[]> {
        await this.requireActiveUser(this.client, actorUserId);
        const rows = await this.client.execute(
            `${slashCommandSelect()}
              JOIN integrations i ON i.id = slash_commands.integration_id
             WHERE slash_commands.active = 1 AND i.active = 1 AND i.deleted_at IS NULL
             ORDER BY slash_commands.command`,
        );
        return rows.rows.map(asSlashCommand);
    }

    async invokeSlashCommand(input: {
        actorUserId: string;
        chatId: string;
        command: string;
        text?: string;
    }): Promise<QueuedWebhookDelivery> {
        const command = normalizedCommand(input.command);
        const commandText = optionalTextBody(input.text, "Command text", 20_000) ?? "";
        return this.write(async (tx) => {
            await this.requireChatMember(tx, input.actorUserId, input.chatId);
            const commandRow = await this.findSlashSubscription(tx, command);
            if (!commandRow) throw new IntegrationError("not_found", "Slash command was not found");
            const eventId = `slash:${createId()}`;
            const eventType = slashEventType(text(commandRow.id));
            const payload = serializedPayload({
                eventId,
                eventType,
                occurredAt: this.now().toISOString(),
                payload: {
                    command,
                    text: commandText,
                    chatId: input.chatId,
                    actorUserId: input.actorUserId,
                    integrationId: text(commandRow.integration_id),
                },
            });
            const deliveryId = createId();
            await tx.execute({
                sql: `INSERT INTO webhook_deliveries
                        (id, subscription_id, event_id, event_type, payload_json)
                      VALUES (?, ?, ?, ?, ?)`,
                args: [deliveryId, text(commandRow.subscription_id), eventId, eventType, payload],
            });
            const delivery = await one(tx, `${deliverySelect()} WHERE id = ?`, [deliveryId]);
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
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.botId) await this.requireBot(tx, input.botId);
            const integration = await this.insertIntegration(tx, input);
            const change = await this.finishIntegrationChange(
                tx,
                input.actorUserId,
                "integration.created",
                integration.id,
            );
            return { value: await this.getIntegration(tx, integration.id), change };
        });
    }

    private async insertIntegration(
        tx: Transaction,
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
        await tx.execute({
            sql: `INSERT INTO integrations
                    (id, kind, name, description, bot_id, created_by_user_id, scopes_json)
                  VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                input.kind,
                requiredTrimmed(input.name, "Integration name", 200),
                optionalTrimmed(input.description, "Integration description", 2_000) ?? null,
                input.botId ?? null,
                input.actorUserId,
                JSON.stringify(normalizeScopes(input.scopes)),
            ],
        });
        return { id };
    }

    private async finishIntegrationChange(
        tx: Transaction,
        actorUserId: string,
        kind: string,
        integrationId: string,
    ): Promise<IntegrationChange> {
        const change = await this.recordChange(tx, actorUserId, kind, integrationId);
        await this.appendAudit(tx, actorUserId, kind, "integration", integrationId);
        await tx.execute({
            sql: `UPDATE integrations SET sync_sequence = ? WHERE id = ?`,
            args: [change.sequence, integrationId],
        });
        return change;
    }

    private async recordChange(
        tx: Transaction,
        actorUserId: string,
        kind: string,
        entityId: string,
    ): Promise<IntegrationChange> {
        const state = await one(
            tx,
            `UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1 RETURNING sequence`,
        );
        if (!state) throw new Error("Server sync state is not initialized");
        const sequence = text(state.sequence);
        await tx.execute({
            sql: `INSERT INTO sync_events (sequence, kind, entity_id, actor_user_id)
                  VALUES (?, ?, ?, ?)`,
            args: [sequence, kind, entityId, actorUserId],
        });
        return { sequence, kind, entityId };
    }

    private async appendAudit(
        tx: Transaction,
        actorUserId: string,
        action: string,
        targetType: string,
        targetId: string,
        metadata?: Record<string, unknown>,
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO audit_log_entries
                    (id, actor_user_id, action, target_type, target_id, metadata_json)
                  VALUES (?, ?, ?, ?, ?, ?)`,
            args: [
                createId(),
                actorUserId,
                action,
                targetType,
                targetId,
                metadata ? JSON.stringify(metadata) : null,
            ],
        });
    }

    private async claimDueDeliveries(
        limit: number,
        leaseMs: number,
        maxAttempts: number,
    ): Promise<ClaimedDelivery[]> {
        const now = this.now();
        const leaseUntil = new Date(now.getTime() + leaseMs).toISOString();
        return this.write(async (tx) => {
            const due = await tx.execute({
                sql: `SELECT d.id
                        FROM webhook_deliveries d
                        JOIN webhook_subscriptions ws ON ws.id = d.subscription_id
                        JOIN integrations i ON i.id = ws.integration_id
                       WHERE d.attempts < ?
                         AND (d.status IN ('pending', 'failed')
                              OR (d.status = 'delivering' AND julianday(d.next_attempt_at) <= julianday(?)))
                         AND julianday(d.next_attempt_at) <= julianday(?)
                         AND ws.active = 1 AND ws.direction = 'outgoing'
                         AND i.active = 1 AND i.deleted_at IS NULL
                       ORDER BY d.next_attempt_at, d.id LIMIT ?`,
                args: [maxAttempts, now.toISOString(), now.toISOString(), limit],
            });
            const claimed: ClaimedDelivery[] = [];
            for (const candidate of due.rows) {
                const id = text(candidate.id);
                const result = await tx.execute({
                    sql: `UPDATE webhook_deliveries
                             SET status = 'delivering', attempts = attempts + 1,
                                 next_attempt_at = ?
                           WHERE id = ? AND attempts < ?
                             AND (status IN ('pending', 'failed')
                                  OR (status = 'delivering' AND julianday(next_attempt_at) <= julianday(?)))`,
                    args: [leaseUntil, id, maxAttempts, now.toISOString()],
                });
                if (!result.rowsAffected) continue;
                const row = await one(
                    tx,
                    `SELECT d.id, d.subscription_id, d.event_id, d.event_type, d.status,
                            d.attempts, d.next_attempt_at, d.created_at, d.payload_json,
                            ws.url, ws.signing_secret_ciphertext
                       FROM webhook_deliveries d
                       JOIN webhook_subscriptions ws ON ws.id = d.subscription_id
                      WHERE d.id = ?`,
                    [id],
                );
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
        await this.client.execute({
            sql: `UPDATE webhook_deliveries
                     SET status = 'delivered', response_status = ?, response_body = ?,
                         last_error = NULL, delivered_at = CURRENT_TIMESTAMP
                   WHERE id = ? AND status = 'delivering' AND next_attempt_at = ?`,
            args: [
                responseStatus,
                truncate(responseBody, MAX_DELIVERY_RESPONSE) ?? null,
                delivery.id,
                delivery.nextAttemptAt,
            ],
        });
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
        await this.client.execute({
            sql: `UPDATE webhook_deliveries
                     SET status = 'failed', next_attempt_at = ?, response_status = ?,
                         response_body = ?, last_error = ?
                   WHERE id = ? AND status = 'delivering' AND next_attempt_at = ?`,
            args: [
                nextAttemptAt,
                response?.statusCode ?? null,
                truncate(response?.responseBody, MAX_DELIVERY_RESPONSE) ?? null,
                truncate(errorMessage(error), 2_000)!,
                delivery.id,
                delivery.nextAttemptAt,
            ],
        });
    }

    private async findSlashSubscription(
        executor: Executor,
        command: string,
    ): Promise<Row | undefined> {
        return one(
            executor,
            `SELECT sc.id, sc.integration_id, ws.id AS subscription_id
               FROM slash_commands sc
               JOIN integrations i ON i.id = sc.integration_id
               JOIN webhook_subscriptions ws ON ws.integration_id = i.id
              WHERE sc.command = ? COLLATE NOCASE AND sc.active = 1
                AND i.active = 1 AND i.deleted_at IS NULL
                AND EXISTS (SELECT 1 FROM json_each(i.scopes_json)
                             WHERE value = 'commands:receive')
                AND ws.direction = 'outgoing' AND ws.active = 1
                AND EXISTS (SELECT 1 FROM json_each(ws.event_types_json)
                             WHERE value = 'slash_command:' || sc.id)
              LIMIT 1`,
            [command],
        );
    }

    private async requireAdmin(executor: Executor, userId: string): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.role = 'admin' AND u.deleted_at IS NULL
                AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
            [userId],
        );
        if (!row) throw new IntegrationError("forbidden", "Server admin permission is required");
    }

    private async requireActiveUser(executor: Executor, userId: string): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.deleted_at IS NULL AND a.active = 1
                AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
            [userId],
        );
        if (!row) throw new IntegrationError("not_found", "User was not found");
    }

    private async requireChatMember(
        executor: Executor,
        userId: string,
        chatId: string,
    ): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM chat_members cm
              JOIN chats c ON c.id = cm.chat_id
              JOIN users u ON u.id = cm.user_id
              JOIN accounts a ON a.id = u.account_id
             WHERE cm.chat_id = ? AND cm.user_id = ? AND cm.left_at IS NULL
               AND c.deleted_at IS NULL AND c.archived_at IS NULL
               AND u.deleted_at IS NULL AND a.active = 1
               AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
            [chatId, userId],
        );
        if (!row) throw new IntegrationError("not_found", "Chat was not found");
    }

    private async requireChat(executor: Executor, chatId: string): Promise<void> {
        if (
            !(await one(
                executor,
                `SELECT 1 AS found FROM chats WHERE id = ? AND deleted_at IS NULL`,
                [chatId],
            ))
        )
            throw new IntegrationError("not_found", "Chat was not found");
    }

    private async requireFile(executor: Executor, fileId: string): Promise<void> {
        if (
            !(await one(
                executor,
                `SELECT 1 AS found FROM files WHERE id = ? AND deleted_at IS NULL AND upload_status = 'complete'`,
                [fileId],
            ))
        )
            throw new IntegrationError("not_found", "File was not found");
    }

    private async requireBot(executor: Executor, botId: string): Promise<void> {
        await this.getBot(executor, botId, true);
    }

    private async requireIntegration(
        executor: Executor,
        integrationId: string,
        active: boolean,
    ): Promise<IntegrationSummary> {
        const integration = await this.getIntegration(executor, integrationId);
        if (active && !integration.active)
            throw new IntegrationError("not_found", "Integration was not found");
        return integration;
    }

    private async getBot(executor: Executor, botId: string, active = false): Promise<BotSummary> {
        const row = await one(
            executor,
            `SELECT id, name, username, description, photo_file_id, owner_user_id,
                    active, created_at, updated_at, deleted_at
               FROM bot_identities WHERE id = ?`,
            [botId],
        );
        if (!row || (active && (number(row.active) !== 1 || row.deleted_at !== null)))
            throw new IntegrationError("not_found", "Bot was not found");
        const bot = asBot(row);
        if (active && !bot.active) throw new IntegrationError("not_found", "Bot was not found");
        return bot;
    }

    private async getIntegration(
        executor: Executor,
        integrationId: string,
    ): Promise<IntegrationSummary> {
        const row = await one(executor, `${integrationSelect()} WHERE id = ?`, [integrationId]);
        if (!row) throw new IntegrationError("not_found", "Integration was not found");
        return asIntegration(row);
    }

    private async getSubscription(
        executor: Executor,
        subscriptionId: string,
    ): Promise<WebhookSubscriptionSummary> {
        const row = await one(executor, `${subscriptionSelect()} WHERE id = ?`, [subscriptionId]);
        if (!row) throw new Error("Webhook subscription was not created");
        return asSubscription(row);
    }

    private async getSlashCommand(
        executor: Executor,
        commandId: string,
    ): Promise<SlashCommandSummary> {
        const row = await one(executor, `${slashCommandSelect()} WHERE id = ?`, [commandId]);
        if (!row) throw new Error("Slash command was not created");
        return asSlashCommand(row);
    }

    private async write<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
        const tx = await this.client.transaction("write");
        try {
            const result = await operation(tx);
            await tx.commit();
            return result;
        } catch (error: unknown) {
            if (!tx.closed) await tx.rollback();
            throw error;
        } finally {
            tx.close();
        }
    }
}

function integrationSelect(): string {
    return `SELECT id, kind, name, description, bot_id, scopes_json, active,
                   created_at, updated_at FROM integrations`;
}

function credentialSelect(): string {
    return `SELECT id, integration_id, name, token_prefix, scopes_json, expires_at,
                   last_used_at, revoked_at, created_at FROM api_credentials`;
}

function subscriptionSelect(): string {
    return `SELECT id, integration_id, direction, chat_id, url, event_types_json,
                   active, created_at, updated_at FROM webhook_subscriptions`;
}

function slashCommandSelect(): string {
    return `SELECT slash_commands.id, slash_commands.integration_id, slash_commands.command,
                   slash_commands.description, slash_commands.usage_hint,
                   slash_commands.active, slash_commands.created_at,
                   slash_commands.updated_at FROM slash_commands`;
}

function deliverySelect(): string {
    return `SELECT webhook_deliveries.id, webhook_deliveries.subscription_id,
                   webhook_deliveries.event_id, webhook_deliveries.event_type,
                   webhook_deliveries.status, webhook_deliveries.attempts,
                   webhook_deliveries.next_attempt_at, webhook_deliveries.created_at
              FROM webhook_deliveries`;
}

function asBot(row: Row): BotSummary {
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

function asIntegration(row: Row): IntegrationSummary {
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

function asCredential(row: Row): ApiCredentialSummary {
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

function asSubscription(row: Row): WebhookSubscriptionSummary {
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

function asSlashCommand(row: Row): SlashCommandSummary {
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

function asDelivery(row: Row): QueuedWebhookDelivery {
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

function asClaimedDelivery(row: Row): ClaimedDelivery {
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

async function one(executor: Executor, sql: string, args: InArgs = []): Promise<Row | undefined> {
    return (await executor.execute({ sql, args })).rows[0];
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
