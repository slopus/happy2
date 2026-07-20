import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins } from "../schema.js";
import type { PluginSource } from "./types.js";

export interface PluginReadySkillPackage {
    pluginId: string;
    shortName: string;
    packageDigest: string;
    packageDirectory: string;
    source: PluginSource;
}

/** Lists each durable plugin package with at least one ready installation and does not mutate durable state. This worker boundary exposes only immutable package coordinates needed to reconcile skills into an isolated agent home. */
export async function pluginSkillPackageListReady(
    executor: DrizzleExecutor,
): Promise<PluginReadySkillPackage[]> {
    const rows = await executor
        .select({
            pluginId: plugins.id,
            shortName: plugins.shortName,
            packageDigest: pluginInstallations.packageDigest,
            packageDirectory: pluginInstallations.packageDirectory,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
        })
        .from(plugins)
        .innerJoin(pluginInstallations, eq(pluginInstallations.pluginId, plugins.id))
        .where(eq(pluginInstallations.status, "ready"))
        .groupBy(
            plugins.id,
            pluginInstallations.packageDigest,
            pluginInstallations.packageDirectory,
        )
        .orderBy(plugins.shortName, plugins.id, pluginInstallations.packageDigest);
    return rows.map((row) => {
        if (
            row.sourceKind !== "builtin" &&
            row.sourceKind !== "archive" &&
            row.sourceKind !== "link"
        )
            throw new Error(`Unknown plugin source kind ${row.sourceKind}`);
        return {
            pluginId: row.pluginId,
            shortName: row.shortName,
            packageDigest: row.packageDigest,
            packageDirectory: row.packageDirectory,
            source: { kind: row.sourceKind, reference: row.sourceReference },
        };
    });
}
