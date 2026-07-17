import { type AutomationSummary } from "./impl/automationSummary.js";
import { CollaborationError, type MutationHint } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, isNull, sql } from "drizzle-orm";
import { areaHint } from "../scheduled-message/areaHint.js";
import { asAutomation } from "./impl/asAutomation.js";
import { automations } from "../schema.js";

import { getAutomation } from "./impl/getAutomation.js";

import { jsonObject } from "./impl/jsonObject.js";

import { validateAction } from "./impl/validateAction.js";
import { validateTrigger } from "./impl/validateTrigger.js";
import { appendAudit } from "./impl/appendAudit.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { requireAdmin } from "./impl/requireAdmin.js";

/**
 * Replaces the mutable trigger and action configuration of an existing automations row after administrator validation.
 * Recomputing schedule state with its sync and audit records keeps runners from mixing an old due time with a new definition.
 */
export async function automationUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        automationId: string;
        active?: boolean;
        name?: string;
        triggerConfig?: Record<string, unknown>;
        actionConfig?: Record<string, unknown>;
        nextRunAt?: string | null;
    },
): Promise<{
    automation: AutomationSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        await requireAdmin(tx, input.actorUserId);
        const current = await getAutomation(tx, input.automationId);
        if (!current) throw new CollaborationError("not_found", "Automation was not found");
        const currentTriggerConfig = jsonObject(current.triggerConfigJson);
        const triggerConfig = input.triggerConfig
            ? {
                  ...input.triggerConfig,
                  ...(typeof currentTriggerConfig.tokenHash === "string"
                      ? {
                            tokenHash: currentTriggerConfig.tokenHash,
                        }
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
                ...(input.active === undefined
                    ? {}
                    : {
                          active: input.active ? 1 : 0,
                      }),
                ...(input.name === undefined
                    ? {}
                    : {
                          name: input.name,
                      }),
                ...(input.triggerConfig === undefined
                    ? {}
                    : {
                          triggerConfigJson: JSON.stringify(triggerConfig),
                      }),
                ...(input.actionConfig === undefined
                    ? {}
                    : {
                          actionConfigJson: JSON.stringify(actionConfig),
                      }),
                ...(input.nextRunAt === undefined
                    ? {}
                    : {
                          nextRunAt: input.nextRunAt,
                      }),
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(automations.id, input.automationId), isNull(automations.deletedAt)));
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "automation.updated",
            entityId: input.automationId,
            actorUserId: input.actorUserId,
        });
        await appendAudit(tx, input.actorUserId, "automation.updated", input.automationId);
        const row = await getAutomation(tx, input.automationId);
        if (!row) throw new Error("Automation disappeared");
        return {
            automation: asAutomation(row),
            hint: areaHint(sequence, "automations"),
        };
    });
}
