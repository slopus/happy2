import { inArray } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginManagementRequests } from "../schema.js";

/** Lists terminal pluginManagementRequests whose staged package directories can be reclaimed and does not mutate durable state. This restart-cleanup boundary prevents resolved approval snapshots from accumulating after a process stops between resolution and filesystem cleanup. */
export async function pluginManagementRequestListTerminalIds(
    executor: DrizzleExecutor,
): Promise<string[]> {
    const rows = await executor
        .select({ id: pluginManagementRequests.id })
        .from(pluginManagementRequests)
        .where(inArray(pluginManagementRequests.status, ["approved", "denied", "failed"]));
    return rows.map(({ id }) => id);
}
