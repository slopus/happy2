import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins } from "../schema.js";
import { PluginError, type PluginSource } from "./types.js";

/** Returns one installed plugin's non-secret immutable package coordinates and does not mutate durable state. This boundary lets a capability-authorized request snapshot trusted metadata without exposing variables or repository-style access. */
export async function pluginInstallationGetRequestUninstallContext(
    executor: DrizzleExecutor,
    installationId: string,
): Promise<{
    pluginId: string;
    displayName: string;
    shortName: string;
    description: string;
    packageDigest: string;
    packageDirectory: string;
    source: PluginSource;
}> {
    const [row] = await executor
        .select({
            pluginId: plugins.id,
            displayName: plugins.displayName,
            shortName: plugins.shortName,
            description: plugins.description,
            packageDigest: plugins.packageDigest,
            packageDirectory: plugins.packageDirectory,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    if (row.sourceKind !== "builtin" && row.sourceKind !== "archive" && row.sourceKind !== "link")
        throw new Error(`Unknown plugin source kind ${row.sourceKind}`);
    return {
        pluginId: row.pluginId,
        displayName: row.displayName,
        shortName: row.shortName,
        description: row.description,
        packageDigest: row.packageDigest,
        packageDirectory: row.packageDirectory,
        source: { kind: row.sourceKind, reference: row.sourceReference },
    };
}
