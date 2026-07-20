import { and, eq, inArray, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import {
    pluginInstallations,
    pluginInstallationVariables,
    pluginSkills,
    plugins,
} from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import {
    pluginUpdateCompatibility,
    pluginUpdateIdentityRequire,
    pluginUpdateRemovedVariableKeys,
} from "./impl/pluginUpdateCompatibility.js";
import { pluginUiAssetsReplace } from "./pluginUiAssetsReplace.js";
import { PluginError, type PluginPackage } from "./types.js";

/**
 * Replaces exactly one installation's validated package snapshot while preserving its workspace, compatible variables, and still-declared permission grants.
 * The guarded transaction updates pluginInstallations, pluginSkills, pluginUiAssets, and pluginInstallationVariables without mutating siblings or shared plugin source metadata, and records installation-scoped audit and sync evidence.
 */
export async function pluginUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        expectedPackageDigest: string;
        installationId: string;
        packageDirectory: string;
        replacement: PluginPackage;
    },
): Promise<{
    hint: MutationHint;
    installationId: string;
    pluginId: string;
    pluginPackageDirectory: string;
    previousPackageDirectory: string;
    sourceVersion: string;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "managePlugins");
        const [current] = await tx
            .select({
                id: pluginInstallations.id,
                pluginId: pluginInstallations.pluginId,
                shortName: plugins.shortName,
                sourceKind: plugins.sourceKind,
                sourceReference: plugins.sourceReference,
                sourceVersion: pluginInstallations.sourceVersion,
                packageDigest: pluginInstallations.packageDigest,
                packageDirectory: pluginInstallations.packageDirectory,
                pluginPackageDirectory: plugins.packageDirectory,
                containerImageId: pluginInstallations.containerImageId,
                containerName: pluginInstallations.containerName,
                grantedPermissionsJson: pluginInstallations.grantedPermissionsJson,
            })
            .from(pluginInstallations)
            .innerJoin(plugins, eq(plugins.id, pluginInstallations.pluginId))
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!current) throw new PluginError("not_found", "Plugin installation was not found");
        pluginUpdateIdentityRequire(current, input.replacement);
        if (current.packageDigest !== input.expectedPackageDigest)
            throw new PluginError("conflict", "The plugin installation changed during its update");
        if (current.packageDigest === input.replacement.packageDigest)
            throw new PluginError("conflict", "The plugin installation is already current");
        const variables = await tx
            .select({
                installationId: pluginInstallationVariables.installationId,
                key: pluginInstallationVariables.key,
                kind: pluginInstallationVariables.kind,
            })
            .from(pluginInstallationVariables)
            .where(eq(pluginInstallationVariables.installationId, input.installationId));
        const [plan] = pluginUpdateCompatibility(input.replacement.manifest, [current], variables);
        if (!plan) throw new Error("Plugin installation update plan was not created");
        const removedVariableKeys = pluginUpdateRemovedVariableKeys(
            input.replacement.manifest,
            variables,
        );
        const manifest = input.replacement.manifest;
        const [updatedInstallation] = await tx
            .update(pluginInstallations)
            .set({
                sourceVersion: manifest.version,
                packageDigest: input.replacement.packageDigest,
                manifestJson: JSON.stringify(manifest),
                packageDirectory: input.packageDirectory,
                containerImageId: plan.containerImageId,
                containerName: plan.containerName,
                containerInstanceId: null,
                runtimeImageTag: null,
                grantedPermissionsJson: JSON.stringify(plan.grantedPermissions),
                status: plan.ready ? "ready" : "preparing",
                statusDetail: plan.ready
                    ? "Plugin skills are installed."
                    : "Updated plugin runtime is queued for preparation.",
                lastError: null,
                diagnosticOutput: null,
                readyAt: plan.ready ? sql`CURRENT_TIMESTAMP` : null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginInstallations.id, input.installationId),
                    eq(pluginInstallations.packageDigest, input.expectedPackageDigest),
                ),
            )
            .returning({ id: pluginInstallations.id });
        if (!updatedInstallation)
            throw new PluginError("conflict", "The plugin installation changed during its update");
        await tx.delete(pluginSkills).where(eq(pluginSkills.installationId, input.installationId));
        if (input.replacement.skills.length)
            await tx.insert(pluginSkills).values(
                input.replacement.skills.map((skill) => ({
                    installationId: input.installationId,
                    name: skill.name,
                    description: skill.description,
                    directory: skill.directory,
                })),
            );
        await pluginUiAssetsReplace(tx, input.installationId, input.replacement.uiAssets);
        if (removedVariableKeys.length)
            await tx
                .delete(pluginInstallationVariables)
                .where(
                    and(
                        eq(pluginInstallationVariables.installationId, input.installationId),
                        inArray(pluginInstallationVariables.key, removedVariableKeys),
                    ),
                );
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.updated",
            targetType: "plugin_installation",
            targetId: input.installationId,
            before: {
                packageDigest: current.packageDigest,
                version: current.sourceVersion,
            },
            after: {
                pluginId: current.pluginId,
                packageDigest: input.replacement.packageDigest,
                version: manifest.version,
            },
        });
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginInstallations)
            .set({ syncSequence: sequence })
            .where(eq(pluginInstallations.id, input.installationId));
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.updated",
            entityId: input.installationId,
            actorUserId: input.actorUserId,
        });
        return {
            hint: {
                ...areaHint(sequence, "plugins"),
                areas: ["plugins", "apps", "contributions"],
            },
            installationId: input.installationId,
            pluginId: current.pluginId,
            pluginPackageDirectory: current.pluginPackageDirectory,
            previousPackageDirectory: current.packageDirectory,
            sourceVersion: manifest.version,
        };
    });
}
