import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { plugins } from "../schema.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { PluginError } from "./types.js";

export interface StoredPluginImage {
    pluginId: string;
    shortName: string;
    packageDigest: string;
    packageDirectory: string;
    storageKey: string;
    contentType: string;
    size: number;
    checksumSha256: string;
}

/**
 * Returns one plugin image's private locator and public metadata after requiring managePlugins permission.
 * This read-only boundary does not mutate durable state and prevents routes from reading package paths without a durable plugin record.
 */
export async function pluginGetImage(
    executor: DrizzleExecutor,
    actorUserId: string,
    pluginId: string,
): Promise<StoredPluginImage> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
    const [row] = await executor
        .select({
            pluginId: plugins.id,
            shortName: plugins.shortName,
            packageDigest: plugins.packageDigest,
            packageDirectory: plugins.packageDirectory,
            storageKey: plugins.imageStorageKey,
            contentType: plugins.imageContentType,
            size: plugins.imageSize,
            checksumSha256: plugins.imageChecksumSha256,
        })
        .from(plugins)
        .where(eq(plugins.id, pluginId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "System plugin was not found");
    return row;
}
