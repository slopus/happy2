import { createId } from "@paralleldrive/cuid2";
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type Client, type InArgs, type Row, type Transaction } from "@libsql/client";
import type { CollaborationRepository } from "../collaboration/repository.js";
import { CollaborationError, type MutationHint } from "../collaboration/types.js";

type Executor = Pick<Client, "execute"> | Pick<Transaction, "execute">;

type ModerationAction =
    | "warn"
    | "restrict"
    | "remove_message"
    | "remove_file"
    | "ban"
    | "unban"
    | "delete_user";

export interface AutomationRepositoryOptions {
    authToken?: string;
    moderate?: (input: {
        actorUserId: string;
        reportId: string;
        action: ModerationAction;
        reason?: string;
        expiresAt?: string;
        metadata?: Record<string, unknown>;
        automationRunId: string;
    }) => Promise<{ sync?: MutationHint }>;
}

export interface AutomationSummary {
    id: string;
    name: string;
    chatId?: string;
    botId?: string;
    triggerType: "schedule" | "event" | "webhook";
    triggerConfig: Record<string, unknown>;
    actionType: "send_message" | "call_webhook" | "moderate";
    actionConfig: Record<string, unknown>;
    timezone?: string;
    nextRunAt?: string;
    active: boolean;
    lastRunAt?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}

export interface ScheduledMessageSummary {
    id: string;
    chatId: string;
    text: string;
    attachmentFileIds: string[];
    scheduledFor: string;
    timezone?: string;
    status: "scheduled" | "publishing" | "published" | "cancelled" | "failed";
    publishedMessageId?: string;
    lastError?: string;
    createdAt: string;
    updatedAt: string;
}

export class AutomationRepository {
    private readonly client: Client;
    private readonly ownsClient: boolean;

    constructor(
        source: string | Client,
        private readonly collaboration: CollaborationRepository,
        private readonly options: AutomationRepositoryOptions = {},
    ) {
        this.ownsClient = typeof source === "string";
        this.client =
            typeof source === "string"
                ? createClient({ url: source, authToken: options.authToken })
                : source;
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    async listAutomations(actorUserId: string): Promise<AutomationSummary[]> {
        await this.requireAdmin(this.client, actorUserId);
        const result = await this.client.execute(
            `SELECT id, name, chat_id, bot_id, trigger_type, trigger_config_json,
                    action_type, action_config_json, timezone, next_run_at, active,
                    last_run_at, last_error, created_at, updated_at
               FROM automations WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC`,
        );
        return result.rows.map(asAutomation);
    }

    async createAutomation(input: {
        actorUserId: string;
        name: string;
        chatId?: string;
        botId?: string;
        triggerType: "schedule" | "event" | "webhook";
        triggerConfig: Record<string, unknown>;
        actionType: "send_message" | "call_webhook" | "moderate";
        actionConfig: Record<string, unknown>;
        timezone?: string;
        nextRunAt?: string;
    }): Promise<{ automation: AutomationSummary; hint: MutationHint; webhookToken?: string }> {
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            if (input.chatId && !(await this.chatExists(tx, input.chatId)))
                throw new CollaborationError("not_found", "Automation chat was not found");
            if (input.botId && !(await this.botExists(tx, input.botId)))
                throw new CollaborationError("not_found", "Automation bot was not found");
            validateTrigger(input.triggerType, input.triggerConfig, input.nextRunAt);
            validateAction(input.actionType, input.actionConfig, input.chatId);
            const id = createId();
            const webhookToken =
                input.triggerType === "webhook"
                    ? `rgd_auto_${randomBytes(32).toString("base64url")}`
                    : undefined;
            const triggerConfig = webhookToken
                ? { ...input.triggerConfig, tokenHash: secretHash(webhookToken) }
                : input.triggerConfig;
            await tx.execute({
                sql: `INSERT INTO automations
                        (id, name, created_by_user_id, bot_id, chat_id, trigger_type,
                         trigger_config_json, action_type, action_config_json, timezone,
                         next_run_at)
                      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    input.name,
                    input.actorUserId,
                    input.botId ?? null,
                    input.chatId ?? null,
                    input.triggerType,
                    JSON.stringify(triggerConfig),
                    input.actionType,
                    JSON.stringify(input.actionConfig),
                    input.timezone ?? null,
                    input.nextRunAt ?? null,
                ],
            });
            const sequence = await this.nextSequence(tx);
            await tx.execute({
                sql: `UPDATE automations SET created_sequence = ? WHERE id = ?`,
                args: [sequence, id],
            });
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "automation.created",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            await this.appendAudit(tx, input.actorUserId, "automation.created", id);
            const row = await one(tx, automationSelect(), [id]);
            if (!row) throw new Error("Automation was not created");
            return {
                automation: asAutomation(row),
                hint: areaHint(sequence, "automations"),
                ...(webhookToken ? { webhookToken } : {}),
            };
        });
    }

    async updateAutomation(input: {
        actorUserId: string;
        automationId: string;
        active?: boolean;
        name?: string;
        triggerConfig?: Record<string, unknown>;
        actionConfig?: Record<string, unknown>;
        nextRunAt?: string | null;
    }): Promise<{ automation: AutomationSummary; hint: MutationHint }> {
        return this.write(async (tx) => {
            await this.requireAdmin(tx, input.actorUserId);
            const current = await one(tx, automationSelect(), [input.automationId]);
            if (!current) throw new CollaborationError("not_found", "Automation was not found");
            const currentTriggerConfig = jsonObject(current.trigger_config_json);
            const triggerConfig = input.triggerConfig
                ? {
                      ...input.triggerConfig,
                      ...(typeof currentTriggerConfig.tokenHash === "string"
                          ? { tokenHash: currentTriggerConfig.tokenHash }
                          : {}),
                  }
                : currentTriggerConfig;
            const actionConfig = input.actionConfig ?? jsonObject(current.action_config_json);
            validateTrigger(
                text(current.trigger_type) as AutomationSummary["triggerType"],
                triggerConfig,
                input.nextRunAt === null
                    ? undefined
                    : (input.nextRunAt ?? optionalText(current.next_run_at)),
            );
            validateAction(
                text(current.action_type) as AutomationSummary["actionType"],
                actionConfig,
                optionalText(current.chat_id),
            );
            await tx.execute({
                sql: `UPDATE automations
                         SET active = CASE WHEN ? = 1 THEN ? ELSE active END,
                             name = CASE WHEN ? = 1 THEN ? ELSE name END,
                             trigger_config_json = CASE WHEN ? = 1
                                 THEN ? ELSE trigger_config_json END,
                             action_config_json = CASE WHEN ? = 1
                                 THEN ? ELSE action_config_json END,
                             next_run_at = CASE WHEN ? = 1 THEN ? ELSE next_run_at END,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [
                    input.active === undefined ? 0 : 1,
                    input.active ? 1 : 0,
                    input.name === undefined ? 0 : 1,
                    input.name ?? null,
                    input.triggerConfig === undefined ? 0 : 1,
                    JSON.stringify(triggerConfig),
                    input.actionConfig === undefined ? 0 : 1,
                    JSON.stringify(actionConfig),
                    input.nextRunAt === undefined ? 0 : 1,
                    input.nextRunAt ?? null,
                    input.automationId,
                ],
            });
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "automation.updated",
                entityId: input.automationId,
                actorUserId: input.actorUserId,
            });
            await this.appendAudit(tx, input.actorUserId, "automation.updated", input.automationId);
            const row = await one(tx, automationSelect(), [input.automationId]);
            if (!row) throw new Error("Automation disappeared");
            return {
                automation: asAutomation(row),
                hint: areaHint(sequence, "automations"),
            };
        });
    }

    async deleteAutomation(actorUserId: string, automationId: string): Promise<MutationHint> {
        return this.write(async (tx) => {
            await this.requireAdmin(tx, actorUserId);
            const result = await tx.execute({
                sql: `UPDATE automations
                         SET active = 0, deleted_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND deleted_at IS NULL`,
                args: [automationId],
            });
            if (!result.rowsAffected)
                throw new CollaborationError("not_found", "Automation was not found");
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "automation.deleted",
                entityId: automationId,
                actorUserId,
            });
            await this.appendAudit(tx, actorUserId, "automation.deleted", automationId);
            return areaHint(sequence, "automations");
        });
    }

    async runAutomationNow(
        actorUserId: string,
        automationId: string,
        triggerEventId = `manual:${createId()}`,
    ): Promise<{ hint?: MutationHint; runId: string }> {
        await this.requireAdmin(this.client, actorUserId);
        return this.executeAutomation(automationId, triggerEventId, actorUserId);
    }

    async runWebhookAutomation(
        token: string,
        idempotencyKey?: string,
    ): Promise<{ hint?: MutationHint; runId: string }> {
        if (!token.startsWith("rgd_auto_") || token.length > 256)
            throw new CollaborationError("not_found", "Automation webhook was not found");
        if (
            idempotencyKey !== undefined &&
            (idempotencyKey.length < 1 ||
                idempotencyKey.length > 200 ||
                !/^[\x21-\x7e]+$/.test(idempotencyKey))
        )
            throw new CollaborationError("invalid", "Idempotency key is invalid");
        const candidates = await this.client.execute(
            `${automationSelectBase()}
              WHERE active = 1 AND deleted_at IS NULL AND trigger_type = 'webhook'
              ORDER BY id`,
        );
        const digest = secretHash(token);
        const row = candidates.rows.find((candidate) => {
            const stored = jsonObject(candidate.trigger_config_json).tokenHash;
            return typeof stored === "string" && hashesEqual(stored, digest);
        });
        const actorUserId = optionalText(row?.created_by_user_id);
        if (!row || !actorUserId)
            throw new CollaborationError("not_found", "Automation webhook was not found");
        const eventId = idempotencyKey
            ? `webhook:${secretHash(`${text(row.id)}:${idempotencyKey}`)}`
            : `webhook:${createId()}`;
        return this.executeAutomation(text(row.id), eventId, actorUserId);
    }

    async runDueAutomations(limit = 25): Promise<MutationHint[]> {
        const due = await this.client.execute({
            sql: `SELECT id, created_by_user_id, next_run_at
                    FROM automations
                   WHERE active = 1 AND deleted_at IS NULL AND trigger_type = 'schedule'
                     AND next_run_at IS NOT NULL AND datetime(next_run_at) <= CURRENT_TIMESTAMP
                   ORDER BY next_run_at, id LIMIT ?`,
            args: [limit],
        });
        const hints: MutationHint[] = [];
        for (const row of due.rows) {
            const actorUserId = optionalText(row.created_by_user_id);
            if (!actorUserId) continue;
            try {
                const result = await this.executeAutomation(
                    text(row.id),
                    `schedule:${text(row.next_run_at)}`,
                    actorUserId,
                );
                if (result.hint) hints.push(result.hint);
            } catch {
                // The execution row and automation last_error retain durable failure details.
            }
        }
        return hints;
    }

    /** Processes durable sync events after the event-automation cursor, including after restart. */
    async runPendingEventAutomations(limit = 100): Promise<MutationHint[]> {
        const cursor = await one(
            this.client,
            `SELECT automation_event_sequence FROM server_sync_state WHERE id = 1`,
        );
        if (!cursor) throw new Error("Sync state has not been initialized");
        const sequences = await this.client.execute({
            sql: `SELECT DISTINCT sequence FROM sync_events
                   WHERE sequence > ? ORDER BY sequence LIMIT ?`,
            args: [number(cursor.automation_event_sequence), limit],
        });
        const hints: MutationHint[] = [];
        for (const row of sequences.rows) {
            const sequence = number(row.sequence);
            hints.push(...(await this.runEventAutomations(sequence)));
            await this.client.execute({
                sql: `UPDATE server_sync_state
                         SET automation_event_sequence = max(automation_event_sequence, ?)
                       WHERE id = 1`,
                args: [sequence],
            });
        }
        return hints;
    }

    async runEventAutomations(sequence: number): Promise<MutationHint[]> {
        if (!Number.isSafeInteger(sequence) || sequence < 1)
            throw new TypeError("sequence must be a positive safe integer");
        const [events, definitions] = await Promise.all([
            this.client.execute({
                sql: `SELECT id, kind, chat_id, entity_id FROM sync_events
                       WHERE sequence = ? ORDER BY id`,
                args: [sequence],
            }),
            this.client.execute(
                `${automationSelectBase()}
                  WHERE active = 1 AND deleted_at IS NULL AND trigger_type = 'event'
                  ORDER BY id`,
            ),
        ]);
        const hints: MutationHint[] = [];
        for (const event of events.rows) {
            const eventId = number(event.id);
            const kind = text(event.kind);
            const chatId = optionalText(event.chat_id);
            const entityId = optionalText(event.entity_id);
            const automated = entityId
                ? Boolean(
                      await one(
                          this.client,
                          `SELECT 1 AS found FROM messages
                            WHERE id = ? AND sender_bot_id IS NOT NULL`,
                          [entityId],
                      ),
                  )
                : false;
            for (const definition of definitions.rows) {
                if (number(definition.created_sequence) >= sequence) continue;
                const automation = asAutomation(definition);
                if (!matchesEvent(automation.triggerConfig, { kind, chatId, automated })) continue;
                const actorUserId = optionalText(definition.created_by_user_id);
                if (!actorUserId) continue;
                try {
                    const result = await this.executeAutomation(
                        automation.id,
                        `sync:${eventId}`,
                        actorUserId,
                    );
                    if (result.hint) hints.push(result.hint);
                } catch {
                    // The automation run and last_error persist the failure for administrators.
                }
            }
        }
        return hints;
    }

    async scheduleMessage(input: {
        actorUserId: string;
        chatId: string;
        text: string;
        attachmentFileIds: string[];
        scheduledFor: string;
        timezone?: string;
        quotedMessageId?: string;
        threadRootMessageId?: string;
        clientMutationId?: string;
    }): Promise<{ message: ScheduledMessageSummary; hint?: MutationHint }> {
        if (!(await this.collaboration.canPostToChat(input.actorUserId, input.chatId)))
            throw new CollaborationError("not_found", "Chat was not found");
        for (const fileId of input.attachmentFileIds)
            if (!(await this.collaboration.canAccessFile(input.actorUserId, fileId)))
                throw new CollaborationError("not_found", "Attachment file was not found");
        return this.write(async (tx) => {
            const id = createId();
            try {
                await tx.execute({
                    sql: `INSERT INTO scheduled_messages
                            (id, chat_id, created_by_user_id, text, quoted_message_id,
                             thread_root_message_id, scheduled_for, timezone, client_mutation_id)
                          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        id,
                        input.chatId,
                        input.actorUserId,
                        input.text,
                        input.quotedMessageId ?? null,
                        input.threadRootMessageId ?? null,
                        input.scheduledFor,
                        input.timezone ?? null,
                        input.clientMutationId ?? null,
                    ],
                });
            } catch (error) {
                if (!input.clientMutationId) throw error;
                const existing = await one(
                    tx,
                    `SELECT id FROM scheduled_messages
                      WHERE created_by_user_id = ? AND client_mutation_id = ?`,
                    [input.actorUserId, input.clientMutationId],
                );
                if (!existing) throw error;
                return {
                    message: await this.getScheduledMessageWith(
                        tx,
                        input.actorUserId,
                        text(existing.id),
                    ),
                };
            }
            for (const [position, fileId] of input.attachmentFileIds.entries())
                await tx.execute({
                    sql: `INSERT INTO scheduled_message_attachments
                            (scheduled_message_id, file_id, position) VALUES (?, ?, ?)`,
                    args: [id, fileId, position],
                });
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "scheduled.created",
                entityId: id,
                actorUserId: input.actorUserId,
                targetUserId: input.actorUserId,
            });
            return {
                message: await this.getScheduledMessageWith(tx, input.actorUserId, id),
                hint: areaHint(sequence, "scheduledMessages"),
            };
        });
    }

    async listScheduledMessages(actorUserId: string): Promise<ScheduledMessageSummary[]> {
        const result = await this.client.execute({
            sql: `SELECT id FROM scheduled_messages
                   WHERE created_by_user_id = ? ORDER BY scheduled_for, id`,
            args: [actorUserId],
        });
        const messages: ScheduledMessageSummary[] = [];
        for (const row of result.rows)
            messages.push(
                await this.getScheduledMessageWith(this.client, actorUserId, text(row.id)),
            );
        return messages;
    }

    async cancelScheduledMessage(
        actorUserId: string,
        scheduledMessageId: string,
    ): Promise<MutationHint> {
        return this.write(async (tx) => {
            const result = await tx.execute({
                sql: `UPDATE scheduled_messages
                         SET status = 'cancelled', cancelled_at = CURRENT_TIMESTAMP,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND created_by_user_id = ? AND status = 'scheduled'`,
                args: [scheduledMessageId, actorUserId],
            });
            if (!result.rowsAffected)
                throw new CollaborationError("not_found", "Scheduled message was not found");
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "scheduled.cancelled",
                entityId: scheduledMessageId,
                actorUserId,
                targetUserId: actorUserId,
            });
            return areaHint(sequence, "scheduledMessages");
        });
    }

    async publishDueScheduledMessages(limit = 25): Promise<MutationHint[]> {
        const due = await this.client.execute({
            sql: `SELECT id, created_by_user_id FROM scheduled_messages
                   WHERE (status = 'scheduled' AND datetime(scheduled_for) <= CURRENT_TIMESTAMP)
                      OR (status = 'publishing'
                          AND datetime(updated_at) <= datetime('now', '-1 minute'))
                   ORDER BY scheduled_for, id LIMIT ?`,
            args: [limit],
        });
        const hints: MutationHint[] = [];
        for (const row of due.rows) {
            const id = text(row.id);
            const actorUserId = optionalText(row.created_by_user_id);
            if (!actorUserId) continue;
            const claimed = await this.client.execute({
                sql: `UPDATE scheduled_messages SET status = 'publishing',
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ? AND (
                         status = 'scheduled'
                         OR (status = 'publishing'
                             AND datetime(updated_at) <= datetime('now', '-1 minute'))
                       )`,
                args: [id],
            });
            if (!claimed.rowsAffected) continue;
            try {
                const scheduled = await this.getScheduledMessageWith(this.client, actorUserId, id);
                const detail = await one(
                    this.client,
                    `SELECT quoted_message_id, thread_root_message_id
                       FROM scheduled_messages WHERE id = ?`,
                    [id],
                );
                const sent = await this.collaboration.sendMessage({
                    actorUserId,
                    chatId: scheduled.chatId,
                    text: scheduled.text,
                    attachmentFileIds: scheduled.attachmentFileIds,
                    quotedMessageId: optionalText(detail?.quoted_message_id),
                    threadRootMessageId: optionalText(detail?.thread_root_message_id),
                    clientMutationId: `scheduled:${id}`,
                });
                await this.client.execute({
                    sql: `UPDATE scheduled_messages
                             SET status = 'published', published_message_id = ?,
                                 published_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
                    args: [sent.message.id, id],
                });
                hints.push(sent.hint);
                hints.push(
                    await this.recordAreaChange({
                        actorUserId,
                        kind: "scheduled.published",
                        entityId: id,
                        area: "scheduledMessages",
                        targetUserId: actorUserId,
                    }),
                );
            } catch (error) {
                await this.client.execute({
                    sql: `UPDATE scheduled_messages
                             SET status = 'failed', last_error = ?, updated_at = CURRENT_TIMESTAMP
                           WHERE id = ?`,
                    args: [errorMessage(error), id],
                });
                hints.push(
                    await this.recordAreaChange({
                        actorUserId,
                        kind: "scheduled.failed",
                        entityId: id,
                        area: "scheduledMessages",
                        targetUserId: actorUserId,
                    }),
                );
            }
        }
        return hints;
    }

    private async executeAutomation(
        automationId: string,
        triggerEventId: string,
        actorUserId: string,
    ): Promise<{ hint?: MutationHint; runId: string }> {
        const claimed = await this.write(async (tx) => {
            const row = await one(tx, automationSelect(), [automationId]);
            if (!row || number(row.active) !== 1)
                throw new CollaborationError("not_found", "Automation was not found");
            const existing = await one(
                tx,
                `SELECT id, status, result_json FROM automation_runs
                  WHERE automation_id = ? AND trigger_event_id = ?`,
                [automationId, triggerEventId],
            );
            if (existing && text(existing.status) === "succeeded")
                return {
                    automation: asAutomation(row),
                    runId: text(existing.id),
                    alreadyCompleted: true,
                };
            let runId: string;
            if (existing) {
                runId = text(existing.id);
                const reclaimed = await tx.execute({
                    sql: `UPDATE automation_runs
                             SET status = 'running', attempts = attempts + 1,
                                 started_at = CURRENT_TIMESTAMP, completed_at = NULL,
                                 last_error = NULL
                           WHERE id = ? AND (
                             status IN ('pending', 'failed')
                             OR (status = 'running'
                                 AND datetime(started_at) <= datetime('now', '-1 minute'))
                           )`,
                    args: [runId],
                });
                if (!reclaimed.rowsAffected)
                    return {
                        automation: asAutomation(row),
                        runId,
                        alreadyCompleted: true,
                    };
            } else {
                runId = createId();
                await tx.execute({
                    sql: `INSERT INTO automation_runs
                        (id, automation_id, trigger_event_id, scheduled_for, status,
                         attempts, started_at)
                      VALUES (?, ?, ?, ?, 'running', 1, CURRENT_TIMESTAMP)`,
                    args: [runId, automationId, triggerEventId, row.next_run_at ?? null],
                });
            }
            await this.appendAudit(tx, actorUserId, "automation.run", automationId);
            const config = jsonObject(row.trigger_config_json);
            const intervalSeconds = positiveNumber(config.intervalSeconds);
            await tx.execute({
                sql: `UPDATE automations
                         SET next_run_at = CASE WHEN ? IS NULL THEN NULL
                              ELSE strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '+' || ? || ' seconds') END,
                             active = CASE WHEN ? IS NULL AND trigger_type = 'schedule'
                                           THEN 0 ELSE active END,
                             last_run_at = CURRENT_TIMESTAMP, last_error = NULL,
                             updated_at = CURRENT_TIMESTAMP
                       WHERE id = ?`,
                args: [
                    intervalSeconds ?? null,
                    intervalSeconds ?? null,
                    intervalSeconds ?? null,
                    automationId,
                ],
            });
            return { automation: asAutomation(row), runId, alreadyCompleted: false };
        });
        if (claimed.alreadyCompleted) return { runId: claimed.runId };
        try {
            let hint: MutationHint | undefined;
            if (claimed.automation.actionType === "send_message") {
                const config = claimed.automation.actionConfig;
                const chatId = claimed.automation.chatId ?? requiredString(config.chatId, "chatId");
                const textValue = requiredString(config.text, "text");
                const attachmentFileIds = stringArray(config.attachmentFileIds);
                const sent = await this.collaboration.sendAutomatedMessage({
                    actorUserId,
                    chatId,
                    text: textValue,
                    attachmentFileIds,
                    clientMutationId: `automation:${claimed.runId}`,
                    botId: claimed.automation.botId,
                });
                hint = sent.hint;
            } else if (claimed.automation.actionType === "call_webhook") {
                const subscriptionId = requiredString(
                    claimed.automation.actionConfig.subscriptionId,
                    "subscriptionId",
                );
                await this.client.execute({
                    sql: `INSERT INTO webhook_deliveries
                            (id, subscription_id, event_id, event_type, payload_json)
                          VALUES (?, ?, ?, 'automation.triggered', ?)
                          ON CONFLICT(subscription_id, event_id) DO NOTHING`,
                    args: [
                        createId(),
                        subscriptionId,
                        claimed.runId,
                        JSON.stringify(claimed.automation.actionConfig.payload ?? {}),
                    ],
                });
            } else {
                if (!this.options.moderate)
                    throw new Error("Moderation automation handler is unavailable");
                const config = claimed.automation.actionConfig;
                const moderated = await this.options.moderate({
                    actorUserId,
                    reportId: requiredString(config.reportId, "reportId"),
                    action: moderationAction(config.action),
                    reason: optionalString(config.reason),
                    expiresAt: optionalString(config.expiresAt),
                    metadata: optionalObject(config.metadata),
                    automationRunId: claimed.runId,
                });
                hint = moderated.sync;
            }
            await this.client.execute({
                sql: `UPDATE automation_runs SET status = 'succeeded', result_json = ?,
                             completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                args: [JSON.stringify({ hint: hint ?? null }), claimed.runId],
            });
            return { hint, runId: claimed.runId };
        } catch (error) {
            const message = errorMessage(error);
            await this.client.batch(
                [
                    {
                        sql: `UPDATE automation_runs SET status = 'failed', last_error = ?,
                                     completed_at = CURRENT_TIMESTAMP WHERE id = ?`,
                        args: [message, claimed.runId],
                    },
                    {
                        sql: `UPDATE automations SET last_error = ?, updated_at = CURRENT_TIMESTAMP
                               WHERE id = ?`,
                        args: [message, automationId],
                    },
                ],
                "write",
            );
            throw error;
        }
    }

    private async getScheduledMessageWith(
        executor: Executor,
        actorUserId: string,
        id: string,
    ): Promise<ScheduledMessageSummary> {
        const row = await one(
            executor,
            `SELECT id, chat_id, text, scheduled_for, timezone, status,
                    published_message_id, last_error, created_at, updated_at
               FROM scheduled_messages WHERE id = ? AND created_by_user_id = ?`,
            [id, actorUserId],
        );
        if (!row) throw new CollaborationError("not_found", "Scheduled message was not found");
        const files = await executor.execute({
            sql: `SELECT file_id FROM scheduled_message_attachments
                   WHERE scheduled_message_id = ? ORDER BY position`,
            args: [id],
        });
        return {
            id,
            chatId: text(row.chat_id),
            text: text(row.text),
            attachmentFileIds: files.rows.map((file) => text(file.file_id)),
            scheduledFor: text(row.scheduled_for),
            timezone: optionalText(row.timezone),
            status: text(row.status) as ScheduledMessageSummary["status"],
            publishedMessageId: optionalText(row.published_message_id),
            lastError: optionalText(row.last_error),
            createdAt: text(row.created_at),
            updatedAt: text(row.updated_at),
        };
    }

    private async requireAdmin(executor: Executor, userId: string): Promise<void> {
        const row = await one(
            executor,
            `SELECT 1 AS found FROM users u JOIN accounts a ON a.id = u.account_id
              WHERE u.id = ? AND u.role = 'admin' AND u.deleted_at IS NULL
                AND a.active = 1 AND a.banned_at IS NULL AND a.deleted_at IS NULL`,
            [userId],
        );
        if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
    }

    private async chatExists(executor: Executor, chatId: string): Promise<boolean> {
        return Boolean(
            await one(
                executor,
                `SELECT 1 AS found FROM chats WHERE id = ? AND deleted_at IS NULL`,
                [chatId],
            ),
        );
    }

    private async botExists(executor: Executor, botId: string): Promise<boolean> {
        return Boolean(
            await one(
                executor,
                `SELECT 1 AS found FROM bot_identities WHERE id = ? AND active = 1 AND deleted_at IS NULL`,
                [botId],
            ),
        );
    }

    private async nextSequence(tx: Transaction): Promise<number> {
        const row = await one(
            tx,
            `UPDATE server_sync_state SET sequence = sequence + 1 WHERE id = 1
             RETURNING sequence`,
        );
        if (!row) throw new Error("Sync state has not been initialized");
        return number(row.sequence);
    }

    private async insertSyncEvent(
        tx: Transaction,
        input: {
            sequence: number;
            kind: string;
            entityId: string;
            actorUserId?: string;
            targetUserId?: string;
        },
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO sync_events
                    (sequence, kind, entity_id, actor_user_id, target_user_id)
                  VALUES (?, ?, ?, ?, ?)`,
            args: [
                input.sequence,
                input.kind,
                input.entityId,
                input.actorUserId ?? null,
                input.targetUserId ?? null,
            ],
        });
    }

    private async recordAreaChange(input: {
        actorUserId?: string;
        kind: string;
        entityId: string;
        area: string;
        targetUserId?: string;
    }): Promise<MutationHint> {
        return this.write(async (tx) => {
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, { sequence, ...input });
            return areaHint(sequence, input.area);
        });
    }

    private async appendAudit(
        tx: Transaction,
        actorUserId: string,
        action: string,
        targetId: string,
    ): Promise<void> {
        await tx.execute({
            sql: `INSERT INTO audit_log_entries
                    (id, actor_user_id, action, target_type, target_id)
                  VALUES (?, ?, ?, 'automation', ?)`,
            args: [createId(), actorUserId, action, targetId],
        });
    }

    private async write<T>(operation: (tx: Transaction) => Promise<T>): Promise<T> {
        const tx = await this.client.transaction("write");
        try {
            const result = await operation(tx);
            await tx.commit();
            return result;
        } catch (error) {
            if (!tx.closed) await tx.rollback();
            throw error;
        } finally {
            tx.close();
        }
    }
}

function areaHint(sequence: number, area: string): MutationHint {
    return { sequence: String(sequence), chats: [], areas: [area] };
}

function automationSelect(): string {
    return `${automationSelectBase()} WHERE id = ? AND deleted_at IS NULL`;
}

function automationSelectBase(): string {
    return `SELECT id, name, chat_id, bot_id, trigger_type, trigger_config_json,
                   action_type, action_config_json, timezone, next_run_at, active,
                   last_run_at, last_error, created_at, updated_at, created_by_user_id,
                   created_sequence
              FROM automations`;
}

function asAutomation(row: Row): AutomationSummary {
    const triggerConfig = jsonObject(row.trigger_config_json);
    delete triggerConfig.tokenHash;
    return {
        id: text(row.id),
        name: text(row.name),
        chatId: optionalText(row.chat_id),
        botId: optionalText(row.bot_id),
        triggerType: text(row.trigger_type) as AutomationSummary["triggerType"],
        triggerConfig,
        actionType: text(row.action_type) as AutomationSummary["actionType"],
        actionConfig: jsonObject(row.action_config_json),
        timezone: optionalText(row.timezone),
        nextRunAt: optionalText(row.next_run_at),
        active: number(row.active) === 1,
        lastRunAt: optionalText(row.last_run_at),
        lastError: optionalText(row.last_error),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}

function validateTrigger(
    type: AutomationSummary["triggerType"],
    config: Record<string, unknown>,
    nextRunAt: string | undefined,
): void {
    if (type === "schedule") {
        if (!nextRunAt || !Number.isFinite(Date.parse(nextRunAt)))
            throw new CollaborationError("invalid", "Scheduled automation requires nextRunAt");
        const interval = config.intervalSeconds;
        if (
            interval !== undefined &&
            (!Number.isSafeInteger(interval) ||
                (interval as number) < 60 ||
                (interval as number) > 31_536_000)
        )
            throw new CollaborationError(
                "invalid",
                "intervalSeconds must be between 60 and 31536000",
            );
    }
    if (type === "event") eventKinds(config);
}

function validateAction(
    type: AutomationSummary["actionType"],
    config: Record<string, unknown>,
    chatId: string | undefined,
): void {
    if (type === "send_message") {
        if (!chatId && typeof config.chatId !== "string")
            throw new CollaborationError("invalid", "Send-message automation requires a chat");
        requiredString(config.text, "actionConfig.text");
        stringArray(config.attachmentFileIds);
    }
    if (type === "call_webhook") requiredString(config.subscriptionId, "subscriptionId");
    if (type === "moderate") {
        requiredString(config.reportId, "reportId");
        moderationAction(config.action);
    }
}

function eventKinds(config: Record<string, unknown>): string[] {
    if (typeof config.event === "string" && config.event.trim()) return [config.event];
    if (
        Array.isArray(config.eventTypes) &&
        config.eventTypes.length > 0 &&
        config.eventTypes.length <= 100 &&
        config.eventTypes.every(
            (value) => typeof value === "string" && value.length > 0 && value.length <= 128,
        )
    )
        return [...new Set(config.eventTypes as string[])];
    throw new CollaborationError(
        "invalid",
        "Event automation requires triggerConfig.event or triggerConfig.eventTypes",
    );
}

function matchesEvent(
    config: Record<string, unknown>,
    event: { kind: string; chatId?: string; automated: boolean },
): boolean {
    const kinds = eventKinds(config);
    if (!kinds.includes("*") && !kinds.includes(event.kind)) return false;
    if (typeof config.chatId === "string" && config.chatId !== event.chatId) return false;
    return config.includeAutomated === true || !event.automated;
}

function moderationAction(value: unknown): ModerationAction {
    const values: readonly ModerationAction[] = [
        "warn",
        "restrict",
        "remove_message",
        "remove_file",
        "ban",
        "unban",
        "delete_user",
    ];
    if (typeof value !== "string" || !values.includes(value as ModerationAction))
        throw new CollaborationError("invalid", "actionConfig.action is invalid");
    return value as ModerationAction;
}

function optionalString(value: unknown): string | undefined {
    if (value === undefined) return undefined;
    if (typeof value !== "string")
        throw new CollaborationError("invalid", "Automation action value must be a string");
    return value;
}

function optionalObject(value: unknown): Record<string, unknown> | undefined {
    if (value === undefined) return undefined;
    if (!value || typeof value !== "object" || Array.isArray(value))
        throw new CollaborationError("invalid", "Automation metadata must be an object");
    return value as Record<string, unknown>;
}

function secretHash(value: string): string {
    return createHash("sha256").update(value, "utf8").digest("hex");
}

function hashesEqual(left: string, right: string): boolean {
    const a = Buffer.from(left, "hex");
    const b = Buffer.from(right, "hex");
    return a.length === b.length && a.length > 0 && timingSafeEqual(a, b);
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

function jsonObject(value: unknown): Record<string, unknown> {
    const parsed = JSON.parse(text(value)) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
        throw new Error("Expected JSON object");
    return parsed as Record<string, unknown>;
}

function requiredString(value: unknown, name: string): string {
    if (typeof value !== "string" || value.length === 0)
        throw new CollaborationError("invalid", `${name} is required`);
    return value;
}

function stringArray(value: unknown): string[] {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.some((entry) => typeof entry !== "string"))
        throw new CollaborationError("invalid", "attachmentFileIds must be an array of ids");
    return [...new Set(value as string[])];
}

function positiveNumber(value: unknown): number | undefined {
    return Number.isSafeInteger(value) && (value as number) > 0 ? (value as number) : undefined;
}

function errorMessage(error: unknown): string {
    return (error instanceof Error ? error.message : String(error)).slice(0, 2_000);
}
