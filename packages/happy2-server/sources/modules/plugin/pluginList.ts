import type { DrizzleExecutor } from "../drizzle.js";
import { plugins } from "../schema.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { asSystemPlugin } from "./impl/asPlugin.js";
import { pluginSelection } from "./impl/pluginSelection.js";
import type { SystemPluginSummary } from "./types.js";

/**
 * Lists durable system plugins and package-image metadata after requiring managePlugins permission.
 * This read-only boundary does not mutate durable state and keeps catalog packages distinct from reusable installed plugin identities.
 */
export async function pluginList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<SystemPluginSummary[]> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
    const rows = await executor
        .select(pluginSelection)
        .from(plugins)
        .orderBy(plugins.installedAt, plugins.id);
    return rows.map(asSystemPlugin);
}
