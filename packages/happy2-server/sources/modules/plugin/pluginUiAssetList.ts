import { asc, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { plugins, pluginUiAssets } from "../schema.js";
import { PluginError } from "./types.js";
import type { PluginUiAssetSummary } from "./pluginUiAssetGet.js";

/**
 * Lists trusted pluginUiAssets metadata belonging to one persisted plugins package without exposing package bytes directly.
 * Keeping resolution at this durable boundary ensures callers cannot enumerate a filesystem path outside the validated catalog.
 */
export async function pluginUiAssetList(
    executor: DrizzleExecutor,
    pluginId: string,
): Promise<PluginUiAssetSummary[]> {
    const [plugin] = await executor
        .select({ id: plugins.id })
        .from(plugins)
        .where(eq(plugins.id, pluginId))
        .limit(1);
    if (!plugin) throw new PluginError("not_found", "Plugin was not found");
    return executor
        .select({
            pluginId: pluginUiAssets.pluginId,
            assetId: pluginUiAssets.assetId,
            relativePath: pluginUiAssets.relativePath,
            contentType: pluginUiAssets.contentType,
            byteSize: pluginUiAssets.byteSize,
            width: pluginUiAssets.width,
            height: pluginUiAssets.height,
            checksumSha256: pluginUiAssets.checksumSha256,
            shortName: plugins.shortName,
            packageDigest: plugins.packageDigest,
            packageDirectory: plugins.packageDirectory,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
        })
        .from(pluginUiAssets)
        .innerJoin(plugins, eq(plugins.id, pluginUiAssets.pluginId))
        .where(eq(pluginUiAssets.pluginId, pluginId))
        .orderBy(asc(pluginUiAssets.assetId))
        .then((rows) =>
            rows.map((row) => ({
                ...row,
                sourceKind: row.sourceKind as PluginUiAssetSummary["sourceKind"],
            })),
        );
}
