import type { DrizzleExecutor } from "../drizzle.js";
import { plugins } from "../schema.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { asSystemPlugin } from "./impl/asPlugin.js";
import { pluginSelection } from "./impl/pluginSelection.js";
import type { SystemPluginSummary } from "./types.js";

/**
 * Lists durable system plugins and their persisted package-image metadata for an active server administrator.
 * This read-only boundary does not mutate durable state and keeps catalog packages distinct from reusable installed plugin identities.
 */
export async function pluginList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<SystemPluginSummary[]> {
    await userRequireServerAdmin(executor, actorUserId);
    const rows = await executor
        .select(pluginSelection)
        .from(plugins)
        .orderBy(plugins.installedAt, plugins.id);
    return rows.map(asSystemPlugin);
}
