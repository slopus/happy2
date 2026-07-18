import type { DrizzleExecutor } from "../drizzle.js";
import { eq } from "drizzle-orm";
import { pluginInstallations, plugins } from "../schema.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import type { PluginInstallationSummary } from "./types.js";
import { pluginInstallationSelection } from "./impl/installationSelection.js";
import { asPluginInstallation } from "./impl/asInstallation.js";

/**
 * Lists durable system plugin installations and their latest lifecycle state for an active server administrator.
 * This read-only action does not mutate durable state and centralizes authorization before installation health is joined into the catalog.
 */
export async function pluginInstallationList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<PluginInstallationSummary[]> {
    await userRequireServerAdmin(executor, actorUserId);
    const rows = await executor
        .select(pluginInstallationSelection)
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .orderBy(pluginInstallations.installedAt, pluginInstallations.id);
    return rows.map(asPluginInstallation);
}
