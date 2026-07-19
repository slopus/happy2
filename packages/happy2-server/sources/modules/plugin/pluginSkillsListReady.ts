import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginSkills } from "../schema.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";

/**
 * Lists the immutable package snapshots for plugins with at least one ready installation so agent submissions can discover their skills without depending on the mutable built-in catalog.
 * Distinct package projection collapses repeated installations of one plugin while preserving a deterministic install order for collision detection and Rig catalogs.
 */
export async function pluginSkillsListReady(
    executor: DrizzleExecutor,
): Promise<PluginSkillSourceRecord[]> {
    return executor
        .selectDistinct({
            pluginId: plugins.id,
            installedAt: plugins.installedAt,
            shortName: plugins.shortName,
            packageDigest: plugins.packageDigest,
            packageDirectory: plugins.packageDirectory,
            name: pluginSkills.name,
            description: pluginSkills.description,
            directory: pluginSkills.directory,
        })
        .from(pluginSkills)
        .innerJoin(plugins, eq(plugins.id, pluginSkills.pluginId))
        .innerJoin(pluginInstallations, eq(pluginInstallations.pluginId, plugins.id))
        .where(eq(pluginInstallations.status, "ready"))
        .orderBy(plugins.installedAt, plugins.id, pluginSkills.name);
}
