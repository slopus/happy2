import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { plugins, pluginUiAssets } from "../schema.js";
import { PluginError, type PluginSourceKind } from "./types.js";

export interface PluginUiAssetSummary {
    pluginId: string;
    assetId: string;
    relativePath: string;
    contentType: string;
    byteSize: number;
    width: number;
    height: number;
    checksumSha256: string;
    shortName: string;
    packageDigest: string;
    packageDirectory: string;
    sourceKind: PluginSourceKind;
    sourceReference: string;
}

/**
 * Resolves one pluginUiAssets row by its exact plugin and asset identities for authenticated package serving.
 * This durable read boundary returns only validated metadata so routes never accept a browser-supplied relative path.
 */
export async function pluginUiAssetGet(
    executor: DrizzleExecutor,
    pluginId: string,
    assetId: string,
): Promise<PluginUiAssetSummary> {
    const [asset] = await executor
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
        .where(and(eq(pluginUiAssets.pluginId, pluginId), eq(pluginUiAssets.assetId, assetId)))
        .limit(1);
    if (!asset) throw new PluginError("not_found", "Plugin UI asset was not found");
    return { ...asset, sourceKind: asset.sourceKind as PluginSourceKind };
}
