import { eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { plugins, pluginUiAssets } from "../schema.js";
import type { MutationHint } from "../chat/types.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

export interface PluginUiAssetMetadataInput {
    id: string;
    path: string;
    contentType: "image/png";
    size: number;
    width: 40;
    height: 40;
    checksumSha256: string;
}

/**
 * Replaces one plugin package's validated pluginUiAssets catalog and advances the plugins sync sequence with an availability event.
 * The transaction makes asset metadata replacement and dependent app invalidation one durable package boundary.
 */
export async function pluginUiAssetsReplace(
    executor: DrizzleExecutor,
    pluginId: string,
    assets: readonly PluginUiAssetMetadataInput[],
): Promise<MutationHint> {
    const rows = assetsParse(assets);
    return withTransaction(executor, async (tx) => {
        const [plugin] = await tx
            .select({ id: plugins.id })
            .from(plugins)
            .where(eq(plugins.id, pluginId))
            .limit(1);
        if (!plugin) throw new PluginError("not_found", "Plugin was not found");
        await tx.delete(pluginUiAssets).where(eq(pluginUiAssets.pluginId, pluginId));
        if (rows.length)
            await tx.insert(pluginUiAssets).values(rows.map((row) => ({ pluginId, ...row })));
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "apps",
            kind: "plugin.ui_assets_replaced",
            entityId: pluginId,
        });
        await tx
            .update(plugins)
            .set({ syncSequence: mutation.sequence, updatedAt: sql`CURRENT_TIMESTAMP` })
            .where(eq(plugins.id, pluginId));
        return { ...mutation.hint, areas: ["apps", "contributions"] };
    });
}

function assetsParse(assets: readonly PluginUiAssetMetadataInput[]) {
    if (!Array.isArray(assets) || assets.length > 128)
        throw new PluginError("broken_configuration", "Plugin declares too many UI assets");
    const ids = new Set<string>();
    const paths = new Set<string>();
    return assets.map((asset) => {
        if (
            !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(asset.id) ||
            asset.id.length > 64 ||
            ids.has(asset.id)
        )
            invalid("Plugin UI asset id is invalid or duplicated");
        if (
            !asset.path ||
            asset.path.length > 512 ||
            asset.path.startsWith("/") ||
            asset.path.split("/").some((part: string) => !part || part === "." || part === "..") ||
            paths.has(asset.path)
        )
            invalid("Plugin UI asset path is invalid or duplicated");
        if (
            asset.contentType !== "image/png" ||
            !Number.isSafeInteger(asset.size) ||
            asset.size < 1 ||
            asset.size > 65_536 ||
            asset.width !== 40 ||
            asset.height !== 40 ||
            !/^[a-f0-9]{64}$/.test(asset.checksumSha256)
        )
            invalid("Plugin UI asset metadata is invalid");
        ids.add(asset.id);
        paths.add(asset.path);
        return {
            assetId: asset.id,
            relativePath: asset.path,
            contentType: asset.contentType,
            byteSize: asset.size,
            width: asset.width,
            height: asset.height,
            checksumSha256: asset.checksumSha256,
            updatedAt: sql`CURRENT_TIMESTAMP`,
        };
    });
}

function invalid(message: string): never {
    throw new PluginError("broken_configuration", message);
}
