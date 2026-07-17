import { and, eq, isNull } from "drizzle-orm";
import { type AutomationRow } from "./automationRow.js";
import { automations } from "../../schema.js";
import { type DrizzleExecutor } from "../../drizzle.js";

export async function getAutomation(
    executor: DrizzleExecutor,
    id: string,
): Promise<AutomationRow | undefined> {
    const rows = await executor
        .select()
        .from(automations)
        .where(and(eq(automations.id, id), isNull(automations.deletedAt)));
    return rows[0];
}
