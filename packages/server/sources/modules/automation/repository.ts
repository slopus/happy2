import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { createId } from "@paralleldrive/cuid2";
import { and, asc, desc, eq, gt, isNull, lte, or, sql } from "drizzle-orm";
import type { CollaborationRepository } from "../collaboration/repository.js";
import { CollaborationError, type MutationHint } from "../collaboration/types.js";
import {
    createDatabase,
    retrySqliteBusy,
    type DrizzleExecutor,
    type DrizzleTransaction,
} from "../drizzle.js";
import {
    accounts,
    auditLogEntries,
    automationRuns,
    automations,
    botIdentities,
    chats,
    messages,
    scheduledMessageAttachments,
    scheduledMessages,
    serverSyncState,
    syncEvents,
    users,
    webhookDeliveries,
} from "../schema.js";

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

type AutomationRow = typeof automations.$inferSelect;

export class AutomationRepository {
    private readonly client: Client;
    private readonly db;
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
        this.db = createDatabase(this.client);
    }

    close(): void {
        if (this.ownsClient) this.client.close();
    }

    async listAutomations(actorUserId: string): Promise<AutomationSummary[]> {
        await this.requireAdmin(this.db, actorUserId);
        return (
            await this.db
                .select()
                .from(automations)
                .where(isNull(automations.deletedAt))
                .orderBy(desc(automations.createdAt), desc(automations.id))
        ).map(asAutomation);
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
                    ? `happy2_auto_${randomBytes(32).toString("base64url")}`
                    : undefined;
            const triggerConfig = webhookToken
                ? { ...input.triggerConfig, tokenHash: secretHash(webhookToken) }
                : input.triggerConfig;
            await tx.insert(automations).values({
                id,
                name: input.name,
                createdByUserId: input.actorUserId,
                botId: input.botId ?? null,
                chatId: input.chatId ?? null,
                triggerType: input.triggerType,
                triggerConfigJson: JSON.stringify(triggerConfig),
                actionType: input.actionType,
                actionConfigJson: JSON.stringify(input.actionConfig),
                timezone: input.timezone ?? null,
                nextRunAt: input.nextRunAt ?? null,
            });
            const sequence = await this.nextSequence(tx);
            await tx
                .update(automations)
                .set({ createdSequence: sequence })
                .where(eq(automations.id, id));
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "automation.created",
                entityId: id,
                actorUserId: input.actorUserId,
            });
            await this.appendAudit(tx, input.actorUserId, "automation.created", id);
            const row = await getAutomation(tx, id);
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
            const current = await getAutomation(tx, input.automationId);
            if (!current) throw new CollaborationError("not_found", "Automation was not found");
            const currentTriggerConfig = jsonObject(current.triggerConfigJson);
            const triggerConfig = input.triggerConfig
                ? {
                      ...input.triggerConfig,
                      ...(typeof currentTriggerConfig.tokenHash === "string"
                          ? { tokenHash: currentTriggerConfig.tokenHash }
                          : {}),
                  }
                : currentTriggerConfig;
            const actionConfig = input.actionConfig ?? jsonObject(current.actionConfigJson);
            validateTrigger(
                current.triggerType as AutomationSummary["triggerType"],
                triggerConfig,
                input.nextRunAt === null
                    ? undefined
                    : (input.nextRunAt ?? current.nextRunAt ?? undefined),
            );
            validateAction(
                current.actionType as AutomationSummary["actionType"],
                actionConfig,
                current.chatId ?? undefined,
            );
            await tx
                .update(automations)
                .set({
                    ...(input.active === undefined ? {} : { active: input.active ? 1 : 0 }),
                    ...(input.name === undefined ? {} : { name: input.name }),
                    ...(input.triggerConfig === undefined
                        ? {}
                        : { triggerConfigJson: JSON.stringify(triggerConfig) }),
                    ...(input.actionConfig === undefined
                        ? {}
                        : { actionConfigJson: JSON.stringify(actionConfig) }),
                    ...(input.nextRunAt === undefined ? {} : { nextRunAt: input.nextRunAt }),
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(automations.id, input.automationId), isNull(automations.deletedAt)));
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "automation.updated",
                entityId: input.automationId,
                actorUserId: input.actorUserId,
            });
            await this.appendAudit(tx, input.actorUserId, "automation.updated", input.automationId);
            const row = await getAutomation(tx, input.automationId);
            if (!row) throw new Error("Automation disappeared");
            return { automation: asAutomation(row), hint: areaHint(sequence, "automations") };
        });
    }

    async deleteAutomation(actorUserId: string, automationId: string): Promise<MutationHint> {
        return this.write(async (tx) => {
            await this.requireAdmin(tx, actorUserId);
            const changed = await tx
                .update(automations)
                .set({
                    active: 0,
                    deletedAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(and(eq(automations.id, automationId), isNull(automations.deletedAt)))
                .returning({ id: automations.id });
            if (changed.length === 0)
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
        await this.requireAdmin(this.db, actorUserId);
        return this.executeAutomation(automationId, triggerEventId, actorUserId);
    }

    async runWebhookAutomation(
        token: string,
        idempotencyKey?: string,
    ): Promise<{ hint?: MutationHint; runId: string }> {
        if (!token.startsWith("happy2_auto_") || token.length > 256)
            throw new CollaborationError("not_found", "Automation webhook was not found");
        if (
            idempotencyKey !== undefined &&
            (idempotencyKey.length < 1 ||
                idempotencyKey.length > 200 ||
                !/^[\x21-\x7e]+$/.test(idempotencyKey))
        )
            throw new CollaborationError("invalid", "Idempotency key is invalid");
        const candidates = await this.db
            .select()
            .from(automations)
            .where(
                and(
                    eq(automations.active, 1),
                    isNull(automations.deletedAt),
                    eq(automations.triggerType, "webhook"),
                ),
            )
            .orderBy(asc(automations.id));
        const digest = secretHash(token);
        const row = candidates.find((candidate) => {
            const stored = jsonObject(candidate.triggerConfigJson).tokenHash;
            return typeof stored === "string" && hashesEqual(stored, digest);
        });
        if (!row?.createdByUserId)
            throw new CollaborationError("not_found", "Automation webhook was not found");
        const eventId = idempotencyKey
            ? `webhook:${secretHash(`${row.id}:${idempotencyKey}`)}`
            : `webhook:${createId()}`;
        return this.executeAutomation(row.id, eventId, row.createdByUserId);
    }

    async runDueAutomations(limit = 25): Promise<MutationHint[]> {
        const due = await this.db
            .select({
                id: automations.id,
                createdByUserId: automations.createdByUserId,
                nextRunAt: automations.nextRunAt,
            })
            .from(automations)
            .where(
                and(
                    eq(automations.active, 1),
                    isNull(automations.deletedAt),
                    eq(automations.triggerType, "schedule"),
                    sql`${automations.nextRunAt} is not null`,
                    lte(sql`datetime(${automations.nextRunAt})`, sql`CURRENT_TIMESTAMP`),
                ),
            )
            .orderBy(asc(automations.nextRunAt), asc(automations.id))
            .limit(limit);
        const hints: MutationHint[] = [];
        for (const row of due) {
            if (!row.createdByUserId || !row.nextRunAt) continue;
            try {
                const result = await this.executeAutomation(
                    row.id,
                    `schedule:${row.nextRunAt}`,
                    row.createdByUserId,
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
        const [cursor] = await this.db
            .select({ sequence: serverSyncState.automationEventSequence })
            .from(serverSyncState)
            .where(eq(serverSyncState.id, 1));
        if (!cursor) throw new Error("Sync state has not been initialized");
        const sequences = await this.db
            .selectDistinct({ sequence: syncEvents.sequence })
            .from(syncEvents)
            .where(gt(syncEvents.sequence, cursor.sequence))
            .orderBy(asc(syncEvents.sequence))
            .limit(limit);
        const hints: MutationHint[] = [];
        for (const row of sequences) {
            hints.push(...(await this.runEventAutomations(row.sequence)));
            await this.db
                .update(serverSyncState)
                .set({
                    automationEventSequence: sql`max(${serverSyncState.automationEventSequence}, ${row.sequence})`,
                })
                .where(eq(serverSyncState.id, 1));
        }
        return hints;
    }

    async runEventAutomations(sequence: number): Promise<MutationHint[]> {
        if (!Number.isSafeInteger(sequence) || sequence < 1)
            throw new TypeError("sequence must be a positive safe integer");
        const [events, definitions] = await Promise.all([
            this.db
                .select({
                    id: syncEvents.id,
                    kind: syncEvents.kind,
                    chatId: syncEvents.chatId,
                    entityId: syncEvents.entityId,
                })
                .from(syncEvents)
                .where(eq(syncEvents.sequence, sequence))
                .orderBy(asc(syncEvents.id)),
            this.db
                .select()
                .from(automations)
                .where(
                    and(
                        eq(automations.active, 1),
                        isNull(automations.deletedAt),
                        eq(automations.triggerType, "event"),
                    ),
                )
                .orderBy(asc(automations.id)),
        ]);
        const hints: MutationHint[] = [];
        for (const event of events) {
            const automated = event.entityId
                ? Boolean(
                      (
                          await this.db
                              .select({ id: messages.id })
                              .from(messages)
                              .where(
                                  and(
                                      eq(messages.id, event.entityId),
                                      or(
                                          eq(messages.kind, "automated"),
                                          sql`${messages.senderBotId} is not null`,
                                      ),
                                  ),
                              )
                              .limit(1)
                      )[0],
                  )
                : false;
            for (const definition of definitions) {
                if (definition.createdSequence >= sequence) continue;
                const automation = asAutomation(definition);
                if (
                    !matchesEvent(automation.triggerConfig, {
                        kind: event.kind,
                        chatId: event.chatId ?? undefined,
                        automated,
                    })
                )
                    continue;
                if (!definition.createdByUserId) continue;
                try {
                    const result = await this.executeAutomation(
                        automation.id,
                        `sync:${event.id}`,
                        definition.createdByUserId,
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
                await tx.insert(scheduledMessages).values({
                    id,
                    chatId: input.chatId,
                    createdByUserId: input.actorUserId,
                    text: input.text,
                    quotedMessageId: input.quotedMessageId ?? null,
                    threadRootMessageId: input.threadRootMessageId ?? null,
                    scheduledFor: input.scheduledFor,
                    timezone: input.timezone ?? null,
                    clientMutationId: input.clientMutationId ?? null,
                });
            } catch (error) {
                if (!input.clientMutationId) throw error;
                const [existing] = await tx
                    .select({ id: scheduledMessages.id })
                    .from(scheduledMessages)
                    .where(
                        and(
                            eq(scheduledMessages.createdByUserId, input.actorUserId),
                            eq(scheduledMessages.clientMutationId, input.clientMutationId),
                        ),
                    );
                if (!existing) throw error;
                return {
                    message: await this.getScheduledMessageWith(tx, input.actorUserId, existing.id),
                };
            }
            if (input.attachmentFileIds.length > 0)
                await tx.insert(scheduledMessageAttachments).values(
                    input.attachmentFileIds.map((fileId, position) => ({
                        scheduledMessageId: id,
                        fileId,
                        position,
                    })),
                );
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
                hint: areaHint(sequence, "scheduled-messages"),
            };
        });
    }

    async listScheduledMessages(actorUserId: string): Promise<ScheduledMessageSummary[]> {
        const rows = await this.db
            .select({ id: scheduledMessages.id })
            .from(scheduledMessages)
            .where(eq(scheduledMessages.createdByUserId, actorUserId))
            .orderBy(asc(scheduledMessages.scheduledFor), asc(scheduledMessages.id));
        const messages: ScheduledMessageSummary[] = [];
        for (const row of rows)
            messages.push(await this.getScheduledMessageWith(this.db, actorUserId, row.id));
        return messages;
    }

    async cancelScheduledMessage(
        actorUserId: string,
        scheduledMessageId: string,
    ): Promise<MutationHint> {
        return this.write(async (tx) => {
            const changed = await tx
                .update(scheduledMessages)
                .set({
                    status: "cancelled",
                    cancelledAt: sql`CURRENT_TIMESTAMP`,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(scheduledMessages.id, scheduledMessageId),
                        eq(scheduledMessages.createdByUserId, actorUserId),
                        eq(scheduledMessages.status, "scheduled"),
                    ),
                )
                .returning({ id: scheduledMessages.id });
            if (changed.length === 0)
                throw new CollaborationError("not_found", "Scheduled message was not found");
            const sequence = await this.nextSequence(tx);
            await this.insertSyncEvent(tx, {
                sequence,
                kind: "scheduled.cancelled",
                entityId: scheduledMessageId,
                actorUserId,
                targetUserId: actorUserId,
            });
            return areaHint(sequence, "scheduled-messages");
        });
    }

    async publishDueScheduledMessages(limit = 25): Promise<MutationHint[]> {
        const due = await this.db
            .select({ id: scheduledMessages.id, actorUserId: scheduledMessages.createdByUserId })
            .from(scheduledMessages)
            .where(
                or(
                    and(
                        eq(scheduledMessages.status, "scheduled"),
                        lte(
                            sql`datetime(${scheduledMessages.scheduledFor})`,
                            sql`CURRENT_TIMESTAMP`,
                        ),
                    ),
                    and(
                        eq(scheduledMessages.status, "publishing"),
                        lte(
                            sql`datetime(${scheduledMessages.updatedAt})`,
                            sql`datetime('now', '-1 minute')`,
                        ),
                    ),
                ),
            )
            .orderBy(asc(scheduledMessages.scheduledFor), asc(scheduledMessages.id))
            .limit(limit);
        const hints: MutationHint[] = [];
        for (const row of due) {
            if (!row.actorUserId) continue;
            const actorUserId = row.actorUserId;
            const [claimed] = await this.db
                .update(scheduledMessages)
                .set({ status: "publishing", updatedAt: sql`CURRENT_TIMESTAMP` })
                .where(
                    and(
                        eq(scheduledMessages.id, row.id),
                        or(
                            eq(scheduledMessages.status, "scheduled"),
                            and(
                                eq(scheduledMessages.status, "publishing"),
                                lte(
                                    sql`datetime(${scheduledMessages.updatedAt})`,
                                    sql`datetime('now', '-1 minute')`,
                                ),
                            ),
                        ),
                    ),
                )
                .returning({ id: scheduledMessages.id });
            if (!claimed) continue;
            let sent: Awaited<ReturnType<CollaborationRepository["sendMessage"]>>;
            try {
                const scheduled = await this.getScheduledMessageWith(this.db, actorUserId, row.id);
                const [detail] = await this.db
                    .select({
                        quotedMessageId: scheduledMessages.quotedMessageId,
                        threadRootMessageId: scheduledMessages.threadRootMessageId,
                    })
                    .from(scheduledMessages)
                    .where(eq(scheduledMessages.id, row.id));
                sent = await this.collaboration.sendMessage({
                    actorUserId,
                    chatId: scheduled.chatId,
                    text: scheduled.text,
                    attachmentFileIds: scheduled.attachmentFileIds,
                    quotedMessageId: detail?.quotedMessageId ?? undefined,
                    threadRootMessageId: detail?.threadRootMessageId ?? undefined,
                    clientMutationId: `scheduled:${row.id}`,
                });
            } catch (error) {
                hints.push(
                    await this.write(async (tx) => {
                        await tx
                            .update(scheduledMessages)
                            .set({
                                status: "failed",
                                lastError: errorMessage(error),
                                updatedAt: sql`CURRENT_TIMESTAMP`,
                            })
                            .where(eq(scheduledMessages.id, row.id));
                        const sequence = await this.nextSequence(tx);
                        await this.insertSyncEvent(tx, {
                            sequence,
                            kind: "scheduled.failed",
                            entityId: row.id,
                            actorUserId,
                            targetUserId: actorUserId,
                        });
                        return areaHint(sequence, "scheduled-messages");
                    }),
                );
                continue;
            }
            const areaHintValue = await this.write(async (tx) => {
                await tx
                    .update(scheduledMessages)
                    .set({
                        status: "published",
                        publishedMessageId: sent.message.id,
                        publishedAt: sql`CURRENT_TIMESTAMP`,
                        updatedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(scheduledMessages.id, row.id));
                const sequence = await this.nextSequence(tx);
                await this.insertSyncEvent(tx, {
                    sequence,
                    kind: "scheduled.published",
                    entityId: row.id,
                    actorUserId,
                    targetUserId: actorUserId,
                });
                return areaHint(sequence, "scheduled-messages");
            });
            hints.push(sent.hint, areaHintValue);
        }
        return hints;
    }

    private async executeAutomation(
        automationId: string,
        triggerEventId: string,
        actorUserId: string,
    ): Promise<{ hint?: MutationHint; runId: string }> {
        const claimed = await this.write(async (tx) => {
            const row = await getAutomation(tx, automationId);
            if (!row || row.active !== 1)
                throw new CollaborationError("not_found", "Automation was not found");
            const [existing] = await tx
                .select()
                .from(automationRuns)
                .where(
                    and(
                        eq(automationRuns.automationId, automationId),
                        eq(automationRuns.triggerEventId, triggerEventId),
                    ),
                );
            if (existing?.status === "succeeded")
                return {
                    automation: asAutomation(row),
                    runId: existing.id,
                    alreadyCompleted: true,
                };
            let runId: string;
            if (existing) {
                runId = existing.id;
                const reclaimed = await tx
                    .update(automationRuns)
                    .set({
                        status: "running",
                        attempts: sql`${automationRuns.attempts} + 1`,
                        startedAt: sql`CURRENT_TIMESTAMP`,
                        completedAt: null,
                        lastError: null,
                    })
                    .where(
                        and(
                            eq(automationRuns.id, runId),
                            or(
                                sql`${automationRuns.status} in ('pending', 'failed')`,
                                and(
                                    eq(automationRuns.status, "running"),
                                    lte(
                                        sql`datetime(${automationRuns.startedAt})`,
                                        sql`datetime('now', '-1 minute')`,
                                    ),
                                ),
                            ),
                        ),
                    )
                    .returning({ id: automationRuns.id });
                if (reclaimed.length === 0)
                    return { automation: asAutomation(row), runId, alreadyCompleted: true };
            } else {
                runId = createId();
                await tx.insert(automationRuns).values({
                    id: runId,
                    automationId,
                    triggerEventId,
                    scheduledFor: row.nextRunAt,
                    status: "running",
                    attempts: 1,
                    startedAt: sql`CURRENT_TIMESTAMP`,
                });
            }
            await this.appendAudit(tx, actorUserId, "automation.run", automationId);
            const intervalSeconds = positiveNumber(
                jsonObject(row.triggerConfigJson).intervalSeconds,
            );
            await tx
                .update(automations)
                .set({
                    nextRunAt: intervalSeconds
                        ? new Date(Date.now() + intervalSeconds * 1_000).toISOString()
                        : null,
                    ...(intervalSeconds || row.triggerType !== "schedule" ? {} : { active: 0 }),
                    lastRunAt: sql`CURRENT_TIMESTAMP`,
                    lastError: null,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(automations.id, automationId));
            return { automation: asAutomation(row), runId, alreadyCompleted: false };
        });
        if (claimed.alreadyCompleted) return { runId: claimed.runId };
        try {
            let hint: MutationHint | undefined;
            if (claimed.automation.actionType === "send_message") {
                const config = claimed.automation.actionConfig;
                const chatId = claimed.automation.chatId ?? requiredString(config.chatId, "chatId");
                const sent = await this.collaboration.sendAutomatedMessage({
                    actorUserId,
                    chatId,
                    text: requiredString(config.text, "text"),
                    attachmentFileIds: stringArray(config.attachmentFileIds),
                    clientMutationId: `automation:${claimed.runId}`,
                    botId: claimed.automation.botId,
                });
                hint = sent.hint;
            } else if (claimed.automation.actionType === "call_webhook") {
                const subscriptionId = requiredString(
                    claimed.automation.actionConfig.subscriptionId,
                    "subscriptionId",
                );
                await this.db
                    .insert(webhookDeliveries)
                    .values({
                        id: createId(),
                        subscriptionId,
                        eventId: claimed.runId,
                        eventType: "automation.triggered",
                        payloadJson: JSON.stringify(claimed.automation.actionConfig.payload ?? {}),
                    })
                    .onConflictDoNothing();
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
            await this.db
                .update(automationRuns)
                .set({
                    status: "succeeded",
                    resultJson: JSON.stringify({ hint: hint ?? null }),
                    completedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(automationRuns.id, claimed.runId));
            return { hint, runId: claimed.runId };
        } catch (error) {
            const message = errorMessage(error);
            await this.write(async (tx) => {
                await tx
                    .update(automationRuns)
                    .set({
                        status: "failed",
                        lastError: message,
                        completedAt: sql`CURRENT_TIMESTAMP`,
                    })
                    .where(eq(automationRuns.id, claimed.runId));
                await tx
                    .update(automations)
                    .set({ lastError: message, updatedAt: sql`CURRENT_TIMESTAMP` })
                    .where(eq(automations.id, automationId));
            });
            throw error;
        }
    }

    private async getScheduledMessageWith(
        executor: DrizzleExecutor,
        actorUserId: string,
        id: string,
    ): Promise<ScheduledMessageSummary> {
        const [row] = await executor
            .select()
            .from(scheduledMessages)
            .where(
                and(
                    eq(scheduledMessages.id, id),
                    eq(scheduledMessages.createdByUserId, actorUserId),
                ),
            );
        if (!row) throw new CollaborationError("not_found", "Scheduled message was not found");
        const attachments = await executor
            .select({ fileId: scheduledMessageAttachments.fileId })
            .from(scheduledMessageAttachments)
            .where(eq(scheduledMessageAttachments.scheduledMessageId, id))
            .orderBy(asc(scheduledMessageAttachments.position));
        return {
            id,
            chatId: row.chatId,
            text: row.text,
            attachmentFileIds: attachments.map(({ fileId }) => fileId),
            scheduledFor: row.scheduledFor,
            timezone: row.timezone ?? undefined,
            status: row.status as ScheduledMessageSummary["status"],
            publishedMessageId: row.publishedMessageId ?? undefined,
            lastError: row.lastError ?? undefined,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    }

    private async requireAdmin(executor: DrizzleExecutor, userId: string): Promise<void> {
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
        if (!row) throw new CollaborationError("forbidden", "Server admin permission is required");
    }

    private async chatExists(executor: DrizzleExecutor, chatId: string): Promise<boolean> {
        return Boolean(
            (
                await executor
                    .select({ id: chats.id })
                    .from(chats)
                    .where(and(eq(chats.id, chatId), isNull(chats.deletedAt)))
                    .limit(1)
            )[0],
        );
    }

    private async botExists(executor: DrizzleExecutor, botId: string): Promise<boolean> {
        return Boolean(
            (
                await executor
                    .select({ id: botIdentities.id })
                    .from(botIdentities)
                    .where(
                        and(
                            eq(botIdentities.id, botId),
                            eq(botIdentities.active, 1),
                            isNull(botIdentities.deletedAt),
                        ),
                    )
                    .limit(1)
            )[0],
        );
    }

    private async nextSequence(tx: DrizzleTransaction): Promise<number> {
        const [row] = await tx
            .update(serverSyncState)
            .set({ sequence: sql`${serverSyncState.sequence} + 1` })
            .where(eq(serverSyncState.id, 1))
            .returning({ sequence: serverSyncState.sequence });
        if (!row) throw new Error("Sync state has not been initialized");
        return row.sequence;
    }

    private async insertSyncEvent(
        tx: DrizzleTransaction,
        input: {
            sequence: number;
            kind: string;
            entityId: string;
            actorUserId?: string;
            targetUserId?: string;
        },
    ): Promise<void> {
        await tx.insert(syncEvents).values({
            sequence: input.sequence,
            kind: input.kind,
            entityId: input.entityId,
            actorUserId: input.actorUserId ?? null,
            targetUserId: input.targetUserId ?? null,
        });
    }

    private async appendAudit(
        tx: DrizzleTransaction,
        actorUserId: string,
        action: string,
        targetId: string,
    ): Promise<void> {
        await tx.insert(auditLogEntries).values({
            id: createId(),
            actorUserId,
            action,
            targetType: "automation",
            targetId,
        });
    }

    private write<T>(operation: (tx: DrizzleTransaction) => Promise<T>): Promise<T> {
        return retrySqliteBusy(() => this.db.transaction(operation));
    }
}

async function getAutomation(
    executor: DrizzleExecutor,
    id: string,
): Promise<AutomationRow | undefined> {
    const rows = await executor
        .select()
        .from(automations)
        .where(and(eq(automations.id, id), isNull(automations.deletedAt)));
    return rows[0];
}

function areaHint(sequence: number, area: string): MutationHint {
    return { sequence: String(sequence), chats: [], areas: [area] };
}

function asAutomation(row: AutomationRow): AutomationSummary {
    const triggerConfig = jsonObject(row.triggerConfigJson);
    delete triggerConfig.tokenHash;
    return {
        id: row.id,
        name: row.name,
        chatId: row.chatId ?? undefined,
        botId: row.botId ?? undefined,
        triggerType: row.triggerType as AutomationSummary["triggerType"],
        triggerConfig,
        actionType: row.actionType as AutomationSummary["actionType"],
        actionConfig: jsonObject(row.actionConfigJson),
        timezone: row.timezone ?? undefined,
        nextRunAt: row.nextRunAt ?? undefined,
        active: row.active === 1,
        lastRunAt: row.lastRunAt ?? undefined,
        lastError: row.lastError ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
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

function jsonObject(value: string): Record<string, unknown> {
    const parsed = JSON.parse(value) as unknown;
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
