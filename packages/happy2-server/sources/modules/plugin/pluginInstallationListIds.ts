import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";

/**
 * Lists every durable plugin installation id so the lifecycle worker can reconcile all runtimes after server startup.
 * This read-only worker boundary does not mutate durable state and avoids coupling restart recovery to catalog availability.
 */
export async function pluginInstallationListIds(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id);
    return rows.map(({ id }) => id);
}
