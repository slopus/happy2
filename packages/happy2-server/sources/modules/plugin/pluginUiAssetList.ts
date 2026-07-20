import { asc, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginUiAssets } from "../schema.js";
import { PluginError } from "./types.js";
import type { PluginUiAssetSummary } from "./pluginUiAssetGet.js";

/**
 * Lists trusted pluginUiAssets metadata belonging to one persisted plugins package without exposing package bytes directly.
 * Keeping resolution at this durable boundary ensures callers cannot enumerate a filesystem path outside the validated catalog.
 */
export async function pluginUiAssetList(
    executor: DrizzleExecutor,
    installationId: string,
): Promise<PluginUiAssetSummary[]> {
    const [installation] = await executor
        .select({ id: pluginInstallations.id })
        .from(pluginInstallations)
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
    return executor
        .select({
            installationId: pluginUiAssets.installationId,
            pluginId: pluginInstallations.pluginId,
            assetId: pluginUiAssets.assetId,
            relativePath: pluginUiAssets.relativePath,
            contentType: pluginUiAssets.contentType,
            byteSize: pluginUiAssets.byteSize,
            width: pluginUiAssets.width,
            height: pluginUiAssets.height,
            checksumSha256: pluginUiAssets.checksumSha256,
            shortName: plugins.shortName,
            packageDigest: pluginInstallations.packageDigest,
            packageDirectory: pluginInstallations.packageDirectory,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
        })
        .from(pluginUiAssets)
        .innerJoin(pluginInstallations, eq(pluginInstallations.id, pluginUiAssets.installationId))
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(eq(pluginUiAssets.installationId, installationId))
        .orderBy(asc(pluginUiAssets.assetId))
        .then((rows) =>
            rows.map((row) => ({
                ...row,
                sourceKind: row.sourceKind as PluginUiAssetSummary["sourceKind"],
            })),
        );
}
