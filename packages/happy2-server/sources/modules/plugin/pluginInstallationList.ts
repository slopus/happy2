import type { DrizzleExecutor } from "../drizzle.js";
import { eq } from "drizzle-orm";
import { pluginInstallations, plugins } from "../schema.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import type { PluginInstallationSummary } from "./types.js";
import { pluginInstallationSelection } from "./impl/installationSelection.js";
import { asPluginInstallation } from "./impl/asInstallation.js";

/**
 * Lists durable plugin installations and their lifecycle state after requiring managePlugins permission.
 * This read-only action does not mutate durable state and centralizes authorization before installation health is joined into the catalog.
 */
export async function pluginInstallationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<PluginInstallationSummary[]> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
    const rows = await executor
        .select(pluginInstallationSelection)
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id);
    return rows.map(asPluginInstallation);
}
