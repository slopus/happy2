import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginSkills } from "../schema.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";

/**
 * Lists the immutable package snapshots for plugins with at least one ready installation so agent submissions can discover their skills without depending on the mutable built-in catalog.
 * Each installation retains its own package snapshot so independently upgraded skill versions remain isolated and deterministic.
 */
export async function pluginSkillsListReady(
    executor: DrizzleExecutor,
): Promise<PluginSkillSourceRecord[]> {
    return executor
        .selectDistinct({
            pluginId: plugins.id,
            installedAt: plugins.installedAt,
            shortName: plugins.shortName,
            packageDigest: pluginInstallations.packageDigest,
            packageDirectory: pluginInstallations.packageDirectory,
            name: pluginSkills.name,
            description: pluginSkills.description,
            directory: pluginSkills.directory,
        })
        .from(pluginSkills)
        .innerJoin(pluginInstallations, eq(pluginInstallations.id, pluginSkills.installationId))
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(eq(pluginInstallations.status, "ready"))
        .orderBy(plugins.installedAt, plugins.id, pluginSkills.name);
}
