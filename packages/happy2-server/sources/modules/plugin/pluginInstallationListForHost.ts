import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins } from "../schema.js";

export interface PluginHostInstalledPlugin {
    id: string;
    pluginId: string;
    shortName: string;
    version: string;
    status: string;
}

/**
 * Lists the non-secret pluginInstallations identity and health projection for a capability-authorized plugin runtime.
 * The caller authenticates the runtime grant before this read; this action deliberately exposes no variables, users, paths, or package internals.
 */
export async function pluginInstallationListForHost(
    executor: DrizzleExecutor,
): Promise<PluginHostInstalledPlugin[]> {
    return executor
        .select({
            id: pluginInstallations.id,
            pluginId: pluginInstallations.pluginId,
            shortName: plugins.shortName,
            version: plugins.sourceVersion,
            status: pluginInstallations.status,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
        .orderBy(plugins.shortName, pluginInstallations.id);
}
