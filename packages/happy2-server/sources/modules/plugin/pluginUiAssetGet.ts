import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins, pluginUiAssets } from "../schema.js";
import { PluginError, type PluginSourceKind } from "./types.js";

export interface PluginUiAssetSummary {
    pluginId: string;
    installationId: string;
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
 * Resolves one pluginUiAssets row by its exact installation and asset identities for authenticated package serving.
 * This durable read boundary returns only validated metadata so routes never accept a browser-supplied relative path.
 */
export async function pluginUiAssetGet(
    executor: DrizzleExecutor,
    installationId: string,
    assetId: string,
): Promise<PluginUiAssetSummary> {
    const [asset] = await executor
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
        .where(
            and(
                eq(pluginUiAssets.installationId, installationId),
                eq(pluginUiAssets.assetId, assetId),
            ),
        )
        .limit(1);
    if (!asset) throw new PluginError("not_found", "Plugin UI asset was not found");
    return { ...asset, sourceKind: asset.sourceKind as PluginSourceKind };
}
