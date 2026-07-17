import { type AutomationSummary } from "./impl/automationSummary.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { asAutomation } from "./impl/asAutomation.js";
import { automations } from "../schema.js";
import { desc, isNull } from "drizzle-orm";

import { requireAdmin } from "./impl/requireAdmin.js";
/**
 * Lists non-deleted automation definitions newest first after requiring an active server administrator.
 * Including inactive definitions lets management clients inspect paused workflows while excluding soft-deleted history from the operational surface.
 */
export async function automationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<AutomationSummary[]> {
    await requireAdmin(executor, actorUserId);
    return (
        await executor
            .select()
            .from(automations)
            .where(isNull(automations.deletedAt))
            .orderBy(desc(automations.createdAt), desc(automations.id))
    ).map(asAutomation);
}
