import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { plugins } from "../schema.js";
import { PluginError, type PluginSource, type PluginSourceKind } from "./types.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";

/**
 * Returns one plugins row's source identity and immutable version evidence to an authorized administrator without mutating durable state.
 * This boundary keeps remote-update orchestration from reading persistence directly and reveals no installation variables or secrets.
 */
export async function pluginGetSource(
    executor: DrizzleExecutor,
    actorUserId: string,
    pluginId: string,
): Promise<{
    packageDigest: string;
    shortName: string;
    source: PluginSource;
    sourceVersion: string;
}> {
    await pluginAuthorizeManagement(executor, actorUserId);
    const [row] = await executor
        .select({
            packageDigest: plugins.packageDigest,
            shortName: plugins.shortName,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
            sourceVersion: plugins.sourceVersion,
        })
        .from(plugins)
        .where(eq(plugins.id, pluginId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "System plugin was not found");
    if (!sourceKinds.has(row.sourceKind as PluginSourceKind))
        throw new Error(`Unknown plugin source kind ${row.sourceKind}`);
    return {
        packageDigest: row.packageDigest,
        shortName: row.shortName,
        source: {
            kind: row.sourceKind as PluginSourceKind,
            reference: row.sourceReference,
        },
        sourceVersion: row.sourceVersion,
    };
}

const sourceKinds = new Set<PluginSourceKind>(["builtin", "github", "upload", "zip_url"]);
