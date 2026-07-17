import { type AutomationRuntime } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { and, asc, eq, isNull, or, sql } from "drizzle-orm";
import { asAutomation } from "./impl/asAutomation.js";

import { automations, messages, syncEvents } from "../schema.js";

import { matchesEvent } from "./impl/matchesEvent.js";

import { executeAutomation } from "./impl/executeAutomation.js";
/**
 * Matches one positive sync sequence against older active event automations, including whether a referenced message was automated, then executes each match.
 * Using the durable sync-event identifier as the trigger key makes replay safe while excluding definitions created after the event they would consume.
 */
export async function automationRunEvent(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    sequence: number,
): Promise<MutationHint[]> {
    if (!Number.isSafeInteger(sequence) || sequence < 1)
        throw new TypeError("sequence must be a positive safe integer");
    const [events, definitions] = await Promise.all([
        executor
            .select({
                id: syncEvents.id,
                kind: syncEvents.kind,
                chatId: syncEvents.chatId,
                entityId: syncEvents.entityId,
            })
            .from(syncEvents)
            .where(eq(syncEvents.sequence, sequence))
            .orderBy(asc(syncEvents.id)),
        executor
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
                      await executor
                          .select({
                              id: messages.id,
                          })
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
                const result = await executeAutomation(
                    executor,
                    options,
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
