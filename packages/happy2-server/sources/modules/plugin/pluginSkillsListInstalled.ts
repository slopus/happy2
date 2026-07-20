import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginSkills } from "../schema.js";
import type { PluginSkillSourceRecord } from "./impl/pluginSkillSource.js";

/**
 * Lists durable skill metadata for plugin packages that still have an installation so a previously accepted Rig callback remains resolvable across runtime status changes and server restarts.
 * Each installation contributes its own immutable package snapshot so callbacks remain bound to the exact installed version.
 */
export async function pluginSkillsListInstalled(
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
        .orderBy(plugins.installedAt, plugins.id, pluginSkills.name);
}
