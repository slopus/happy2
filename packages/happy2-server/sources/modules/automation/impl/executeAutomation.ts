import { type AutomationRuntime } from "../types.js";
import { CollaborationError, type MutationHint } from "../../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../../drizzle.js";

import { and, eq, lte, or, sql } from "drizzle-orm";
import { asAutomation } from "./asAutomation.js";
import { automationRuns, automations, webhookDeliveries } from "../../schema.js";

import { createId } from "@paralleldrive/cuid2";

import { errorMessage } from "../../scheduled-message/errorMessage.js";
import { getAutomation } from "./getAutomation.js";
import { jsonObject } from "./jsonObject.js";

import { messageSendAutomated } from "../../message/messageSendAutomated.js";
import { moderationAction } from "./moderationAction.js";
import { optionalObject } from "./optionalObject.js";
import { optionalString } from "./optionalString.js";

import { positiveNumber } from "./positiveNumber.js";
import { requiredString } from "./requiredString.js";

import { stringArray } from "./stringArray.js";

import { appendAudit } from "./appendAudit.js";

/**
 * Records one automationRuns attempt, advances its automations schedule, and queues any resulting webhookDeliveries from a validated payload.
 * The execution transaction gives retries a single durable outcome and prevents the next trigger from advancing without the work it produced.
 */
export async function executeAutomation(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    automationId: string,
    triggerEventId: string,
    actorUserId: string,
): Promise<{
    hint?: MutationHint;
    runId: string;
}> {
    const claimed = await withTransaction(executor, async (tx) => {
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
                .returning({
                    id: automationRuns.id,
                });
            if (reclaimed.length === 0)
                return {
                    automation: asAutomation(row),
                    runId,
                    alreadyCompleted: true,
                };
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
        await appendAudit(tx, actorUserId, "automation.run", automationId);
        const intervalSeconds = positiveNumber(jsonObject(row.triggerConfigJson).intervalSeconds);
        await tx
            .update(automations)
            .set({
                nextRunAt: intervalSeconds
                    ? new Date(Date.now() + intervalSeconds * 1_000).toISOString()
                    : null,
                ...(intervalSeconds || row.triggerType !== "schedule"
                    ? {}
                    : {
                          active: 0,
                      }),
                lastRunAt: sql`CURRENT_TIMESTAMP`,
                lastError: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(automations.id, automationId));
        return {
            automation: asAutomation(row),
            runId,
            alreadyCompleted: false,
        };
    });
    if (claimed.alreadyCompleted)
        return {
            runId: claimed.runId,
        };
    try {
        let hint: MutationHint | undefined;
        if (claimed.automation.actionType === "send_message") {
            const config = claimed.automation.actionConfig;
            const chatId = claimed.automation.chatId ?? requiredString(config.chatId, "chatId");
            const sent = await messageSendAutomated(executor, {
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
            await executor
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
            if (!options.moderate) throw new Error("Moderation automation handler is unavailable");
            const config = claimed.automation.actionConfig;
            const moderated = await options.moderate({
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
        await executor
            .update(automationRuns)
            .set({
                status: "succeeded",
                resultJson: JSON.stringify({
                    hint: hint ?? null,
                }),
                completedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(automationRuns.id, claimed.runId));
        return {
            hint,
            runId: claimed.runId,
        };
    } catch (error) {
        const message = errorMessage(error);
        await withTransaction(executor, async (tx) => {
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
                .set({
                    lastError: message,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(eq(automations.id, automationId));
        });
        throw error;
    }
}
