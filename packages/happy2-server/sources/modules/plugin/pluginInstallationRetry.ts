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
import { asPluginInstallation } from "./impl/asInstallation.js";
import { pluginInstallationSelection } from "./impl/installationSelection.js";
import { PluginError, type PluginInstallationSummary } from "./types.js";

/**
 * Requeues one failed plugin installation for an explicit administrator retry while preserving its package, variables, permissions, and workspace.
 * The transaction clears failure fields on pluginInstallations and records audit plus sync evidence; broken configurations remain quarantined for reinstall or update.
 */
export async function pluginInstallationRetry(
    executor: DrizzleExecutor,
    input: { actorUserId: string; installationId: string },
): Promise<{
    containerName?: string;
    hint: MutationHint;
    installation: PluginInstallationSummary;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequirePermission(tx, input.actorUserId, "managePlugins");
        const [current] = await tx
            .select({
                id: pluginInstallations.id,
                status: pluginInstallations.status,
                containerName: pluginInstallations.containerName,
                pluginId: pluginInstallations.pluginId,
            })
            .from(pluginInstallations)
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!current) throw new PluginError("not_found", "Plugin installation was not found");
        if (current.status !== "failed")
            throw new PluginError("conflict", "Only a failed plugin installation can be retried");
        const sequence = await syncSequenceNext(tx);
        await tx
            .update(pluginInstallations)
            .set({
                status: "preparing",
                statusDetail: "Plugin runtime retry is queued for preparation.",
                lastError: null,
                diagnosticOutput: null,
                containerInstanceId: null,
                readyAt: null,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(pluginInstallations.id, input.installationId));
        await chatAppendAudit(tx, {
            actorUserId: input.actorUserId,
            action: "plugin.retried",
            targetType: "plugin_installation",
            targetId: input.installationId,
            before: { status: current.status },
            after: { pluginId: current.pluginId, status: "preparing" },
        });
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.retry_queued",
            entityId: input.installationId,
            actorUserId: input.actorUserId,
        });
        const [row] = await tx
            .select(pluginInstallationSelection)
            .from(pluginInstallations)
            .innerJoin(plugins, eq(pluginInstallations.pluginId, plugins.id))
            .where(eq(pluginInstallations.id, input.installationId))
            .limit(1);
        if (!row) throw new Error("Retried plugin installation was not found");
        return {
            ...(current.containerName ? { containerName: current.containerName } : {}),
            hint: areaHint(sequence, "plugins"),
            installation: asPluginInstallation(row),
        };
    });
}
