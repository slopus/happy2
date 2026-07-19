import { eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { pluginInstallations, plugins } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import type { PluginHostPermission, PluginInstallationSummary } from "./types.js";
import { PluginError } from "./types.js";
import { asPluginInstallation } from "./impl/asInstallation.js";
import { effectiveContainer } from "./impl/effectiveContainer.js";
import { installedManifest } from "./impl/installedManifest.js";
import { pluginInstallationSelection } from "./impl/installationSelection.js";
import { pluginPermissionsParse, pluginPermissionsValidate } from "./impl/apiPermissions.js";

/**
 * Replaces one pluginInstallations row's user-approved API grants while enforcing its immutable manifest declarations.
 * A changed grant set invalidates the current container incarnation and queues runtime reactivation in the same audited sync transaction so old tokens stop authorizing immediately.
 */
export async function pluginInstallationPermissionsUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        installationId: string;
        permissions: readonly PluginHostPermission[];
    },
): Promise<{
    changed: boolean;
    containerName?: string;
    hint?: MutationHint;
    installation: PluginInstallationSummary;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "managePlugins");
        const [current] = await tx
            .select({
                ...pluginInstallationSelection,
                manifestJson: plugins.manifestJson,
                containerName: pluginInstallations.containerName,
            })
            .from(pluginInstallations)
            .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!current) throw new PluginError("not_found", "Plugin installation was not found");
        const manifest = installedManifest(current.manifestJson);
        const declared = effectiveContainer(manifest)?.permissions ?? [];
        const granted = pluginPermissionsValidate(input.permissions, declared);
        const before = pluginPermissionsParse(current.grantedPermissionsJson);
        if (samePermissions(before, granted))
            return {
                changed: false,
                ...(current.containerName ? { containerName: current.containerName } : {}),
                installation: asPluginInstallation(current),
            };

        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginInstallations)
            .set({
                grantedPermissionsJson: JSON.stringify(granted),
                status: current.containerName ? "preparing" : current.status,
                statusDetail: current.containerName
                    ? "Plugin runtime is queued to apply changed API permissions."
                    : current.statusDetail,
                containerInstanceId: null,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
                readyAt: current.containerName ? null : current.readyAt,
            })
            .where(eq(pluginInstallations.id, input.installationId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.permissions_updated",
            targetType: "plugin_installation",
            targetId: input.installationId,
            before: { grantedPermissions: before },
            after: { grantedPermissions: granted },
        });
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.permissions_updated",
            entityId: input.installationId,
            actorUserId: input.actorUserId,
        });
        const [updated] = await tx
            .select(pluginInstallationSelection)
            .from(pluginInstallations)
            .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!updated) throw new Error("Plugin installation disappeared after permission update");
        return {
            changed: true,
            ...(current.containerName ? { containerName: current.containerName } : {}),
            hint: areaHint(sequence, "plugins"),
            installation: asPluginInstallation(updated),
        };
    });
}

function samePermissions(
    left: readonly PluginHostPermission[],
    right: readonly PluginHostPermission[],
): boolean {
    return left.length === right.length && left.every((permission) => right.includes(permission));
}
