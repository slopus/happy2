import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginSkills } from "../schema.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";

/**
 * Lists durable skill metadata for plugin packages that still have an installation so a previously accepted Rig callback remains resolvable across runtime status changes and server restarts.
 * Distinct projection keeps repeated installations from making one static skill ambiguous while package deletion remains authoritative revocation.
 */
export async function pluginSkillsListInstalled(
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
        .orderBy(plugins.installedAt, plugins.id, pluginSkills.name);
}
