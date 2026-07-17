import { type AutomationRuntime } from "./types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { createId } from "@paralleldrive/cuid2";
import { executeAutomation } from "./impl/executeAutomation.js";
import { requireAdmin } from "./impl/requireAdmin.js";
/**
 * Requires server-administrator authority and executes one automation immediately with a caller-supplied or generated manual trigger identifier.
 * Generating the trigger identity before dispatch gives the run the same deduplication boundary as event-initiated automation executions.
 */
export async function automationRunNow(
    executor: DrizzleExecutor,
    options: AutomationRuntime,
    actorUserId: string,
    automationId: string,
    triggerEventId = `manual:${createId()}`,
): Promise<{
    hint?: MutationHint;
    runId: string;
}> {
    await requireAdmin(executor, actorUserId);
    return executeAutomation(executor, options, automationId, triggerEventId, actorUserId);
}
