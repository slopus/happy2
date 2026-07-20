import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { pluginInstallations, plugins } from "../schema.js";
import { PluginError, type PluginSource, type PluginSourceKind } from "./types.js";
import { pluginAuthorizeManagement } from "./pluginAuthorizeManagement.js";

/**
 * Returns one installation's package version plus its system plugin source identity to an authorized administrator without exposing configured values.
 * This read boundary makes update discovery installation-scoped while retaining the shared source used to fetch a replacement package.
 */
export async function pluginInstallationGetSource(
    executor: DrizzleExecutor,
    actorUserId: string,
    installationId: string,
): Promise<{
    installationId: string;
    packageDigest: string;
    pluginId: string;
    shortName: string;
    source: PluginSource;
    sourceVersion: string;
}> {
    await pluginAuthorizeManagement(executor, actorUserId);
    const [row] = await executor
        .select({
            installationId: pluginInstallations.id,
            packageDigest: pluginInstallations.packageDigest,
            pluginId: plugins.id,
            shortName: plugins.shortName,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
            sourceVersion: pluginInstallations.sourceVersion,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!row) throw new PluginError("not_found", "Plugin installation was not found");
    if (!sourceKinds.has(row.sourceKind as PluginSourceKind))
        throw new Error(`Unknown plugin source kind ${row.sourceKind}`);
    return {
        installationId: row.installationId,
        packageDigest: row.packageDigest,
        pluginId: row.pluginId,
        shortName: row.shortName,
        source: {
            kind: row.sourceKind as PluginSourceKind,
            reference: row.sourceReference,
        },
        sourceVersion: row.sourceVersion,
    };
}

const sourceKinds = new Set<PluginSourceKind>([
    "builtin",
    "github",
    "upload",
    "zip_url",
    "archive",
    "link",
]);
