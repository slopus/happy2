import { type AutomationSummary } from "./impl/automationSummary.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { areaHint } from "../scheduled-message/areaHint.js";
import { asAutomation } from "./impl/asAutomation.js";
import { automations } from "../schema.js";
import { createId } from "@paralleldrive/cuid2";
import { eq } from "drizzle-orm";
import { getAutomation } from "./impl/getAutomation.js";
import { randomBytes } from "node:crypto";
import { secretHash } from "./impl/secretHash.js";
import { validateAction } from "./impl/validateAction.js";
import { validateTrigger } from "./impl/validateTrigger.js";
import { appendAudit } from "./impl/appendAudit.js";
import { botExists } from "./impl/botExists.js";
import { chatExists } from "./impl/chatExists.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireAdmin } from "./impl/requireAdmin.js";

/**
 * Persists an administrator-validated automations definition with its trigger, action payload, and initial scheduling state.
 * Publishing the definition with audit and sync evidence ensures runners never execute an automation clients cannot attribute or inspect.
 */
export async function automationCreate(
    executor: DrizzleExecutor,
    input: {
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
    },
): Promise<{
    automation: AutomationSummary;
    hint: MutationHint;
    webhookToken?: string;
}> {
    return withTransaction(executor, async (tx) => {
        await requireAdmin(tx, input.actorUserId);
        if (input.chatId && !(await chatExists(tx, input.chatId)))
            throw new CollaborationError("not_found", "Automation chat was not found");
        if (input.botId && !(await botExists(tx, input.botId)))
            throw new CollaborationError("not_found", "Automation bot was not found");
        validateTrigger(input.triggerType, input.triggerConfig, input.nextRunAt);
        validateAction(input.actionType, input.actionConfig, input.chatId);
        const id = createId();
        const webhookToken =
            input.triggerType === "webhook"
                ? `happy2_auto_${randomBytes(32).toString("base64url")}`
                : undefined;
        const triggerConfig = webhookToken
            ? {
                  ...input.triggerConfig,
                  tokenHash: secretHash(webhookToken),
              }
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
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(automations)
            .set({
                createdSequence: sequence,
            })
            .where(eq(automations.id, id));
        await syncEventInsert(tx, {
            sequence,
            kind: "automation.created",
            entityId: id,
            actorUserId: input.actorUserId,
        });
        await appendAudit(tx, input.actorUserId, "automation.created", id);
        const row = await getAutomation(tx, id);
        if (!row) throw new Error("Automation was not created");
        return {
            automation: asAutomation(row),
            hint: areaHint(sequence, "automations"),
            ...(webhookToken
                ? {
                      webhookToken,
                  }
                : {}),
        };
    });
}
