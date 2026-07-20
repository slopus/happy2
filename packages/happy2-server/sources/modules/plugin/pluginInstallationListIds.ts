import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { ne } from "drizzle-orm";

/**
 * Lists plugin installation ids eligible for startup recovery while leaving broken packages quarantined until an explicit update or reinstall.
 * This read-only worker boundary does not mutate durable state and prevents known-invalid package code from being loaded after restart.
 */
export async function pluginInstallationListIds(executor: DrizzleExecutor): Promise<string[]> {
    const rows = await executor
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .where(ne(pluginInstallations.status, "broken_configuration"))
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id);
    return rows.map(({ id }) => id);
}
