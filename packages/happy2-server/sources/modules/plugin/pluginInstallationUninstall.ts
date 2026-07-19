import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequirePermission } from "../permission/userRequirePermission.js";
import { pluginInstallations, plugins } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { PluginError } from "./types.js";

/**
 * Deletes one authorized plugin installation and its cascade-owned state, removing the plugin row when no installation remains.
 * The transaction records actor provenance and a plugins sync event after PluginService has stopped process/container resources.
 */
export async function pluginInstallationUninstall(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        actorUserId?: string;
        actorInstallationId?: string;
    },
): Promise<{ hint: MutationHint; pluginId: string; pluginRemoved: boolean }> {
    return withTransaction(executor, async (tx) => {
        if (input.actorUserId) await userRequirePermission(tx, input.actorUserId, "managePlugins");
        else if (!input.actorInstallationId)
            throw new PluginError("forbidden", "Plugin installation authority is required");
        const [installation] = await tx
            .select({
                id: pluginInstallations.id,
                pluginId: pluginInstallations.pluginId,
                shortName: plugins.shortName,
                sourceVersion: plugins.sourceVersion,
            })
            .from(pluginInstallations)
            .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!installation) throw new PluginError("not_found", "Plugin installation was not found");
        await tx
            .delete(pluginInstallations)
            .where(eq(pluginInstallations.id, input.installationId));
        const [remaining] = await tx
            .select({ id: pluginInstallations.id })
            .from(pluginInstallations)
            .where(eq(pluginInstallations.pluginId, installation.pluginId))
            .limit(1);
        const pluginRemoved = !remaining;
        if (pluginRemoved) await tx.delete(plugins).where(eq(plugins.id, installation.pluginId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.uninstalled",
            targetType: "plugin_installation",
            targetId: input.installationId,
            before: {
                pluginId: installation.pluginId,
                shortName: installation.shortName,
                actorInstallationId: input.actorInstallationId,
                version: installation.sourceVersion,
            },
            after: { pluginRemoved },
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.uninstalled",
            entityId: input.installationId,
            actorUserId: input.actorUserId,
        });
        return {
            hint: areaHint(sequence, "plugins"),
            pluginId: installation.pluginId,
            pluginRemoved,
        };
    });
}
