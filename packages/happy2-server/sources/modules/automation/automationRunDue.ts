import { type AutomationRuntime } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { and, asc, eq, isNull, lte, sql } from "drizzle-orm";

import { automations } from "../schema.js";

import { executeAutomation } from "./impl/executeAutomation.js";
/**
 * Executes active scheduled automations whose nextRunAt is due, oldest first, using the scheduled timestamp as the trigger identity.
 * Continuing after an individual failure lets the durable run and last-error records explain that failure without starving later due definitions.
 */
export async function automationRunDue(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    limit = 25,
): Promise<MutationHint[]> {
    const due = await executor
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
            const result = await executeAutomation(
                executor,
                options,
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
