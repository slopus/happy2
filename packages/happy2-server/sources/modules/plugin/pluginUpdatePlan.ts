import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { pluginInstallations, pluginInstallationVariables, plugins } from "../schema.js";
import {
    pluginUpdateCompatibility,
    pluginUpdateIdentityRequire,
} from "./impl/pluginUpdateCompatibility.js";
import { PluginError, type PluginPackage } from "./types.js";

/**
 * Validates one replacement package against exactly one installation before runtime shutdown and returns only that installation's resources.
 * This read-only administrator boundary prevents an upgrade from stopping or changing sibling installations of the same system plugin.
 */
export async function pluginUpdatePlan(
    executor: DrizzleExecutor,
    actorUserId: string,
    installationId: string,
    replacement: PluginPackage,
): Promise<{
    containerName?: string;
    currentPackageDigest: string;
    currentPackageDirectory: string;
    pluginId: string;
}> {
    await userRequirePermission(executor, actorUserId, "managePlugins");
    const [installation] = await executor
        .select({
            id: pluginInstallations.id,
            pluginId: pluginInstallations.pluginId,
            shortName: plugins.shortName,
            sourceKind: plugins.sourceKind,
            sourceReference: plugins.sourceReference,
            packageDigest: pluginInstallations.packageDigest,
            packageDirectory: pluginInstallations.packageDirectory,
            containerImageId: pluginInstallations.containerImageId,
            containerName: pluginInstallations.containerName,
            grantedPermissionsJson: pluginInstallations.grantedPermissionsJson,
        })
        .from(pluginInstallations)
        .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
        .where(eq(pluginInstallations.id, installationId))
        .limit(1);
    if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
    pluginUpdateIdentityRequire(installation, replacement);
    if (installation.packageDigest === replacement.packageDigest)
        throw new PluginError("conflict", "The plugin installation is already current");
    const variables = await executor
        .select({
            installationId: pluginInstallationVariables.installationId,
            key: pluginInstallationVariables.key,
            kind: pluginInstallationVariables.kind,
        })
        .from(pluginInstallationVariables)
        .where(eq(pluginInstallationVariables.installationId, installationId));
    pluginUpdateCompatibility(replacement.manifest, [installation], variables);
    return {
        ...(installation.containerName ? { containerName: installation.containerName } : {}),
        currentPackageDigest: installation.packageDigest,
        currentPackageDirectory: installation.packageDirectory,
        pluginId: installation.pluginId,
    };
}
