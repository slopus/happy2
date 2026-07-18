import { eq, inArray } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { pluginInstallations, plugins } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Removes system plugins whose built-in source is no longer present, including their pluginInstallations and cascade-owned pluginInstallationVariables.
 * The transaction records syncEvents for the deleted plugin identities so startup pruning is durable and clients can reconcile the plugins area.
 */
export async function pluginRemoveMissingBuiltins(
    executor: DrizzleExecutor,
    availableSourceReferences: readonly string[],
): Promise<{
    hint?: MutationHint;
    plugins: Array<{ pluginId: string; containerNames: string[] }>;
}> {
    return withTransaction(executor, async (tx) => {
        const available = new Set(availableSourceReferences);
        const builtins = await tx
            .select({ id: plugins.id, sourceReference: plugins.sourceReference })
            .from(plugins)
            .where(eq(plugins.sourceKind, "builtin"));
        const missing = builtins.filter(({ sourceReference }) => !available.has(sourceReference));
        if (missing.length === 0) return { plugins: [] };

        const pluginIds = missing.map(({ id }) => id);
        const installations = await tx
            .select({
                pluginId: pluginInstallations.pluginId,
                containerName: pluginInstallations.containerName,
            })
            .from(pluginInstallations)
            .where(inArray(pluginInstallations.pluginId, pluginIds));
        await tx
            .delete(pluginInstallations)
            .where(inArray(pluginInstallations.pluginId, pluginIds));
        await tx.delete(plugins).where(inArray(plugins.id, pluginIds));

        const sequence = await syncSequenceNext(tx);
        for (const { id } of missing)
            await syncEventInsert(tx, {
                sequence,
                kind: "plugin.builtin_removed",
                entityId: id,
            });
        return {
            hint: areaHint(sequence, "plugins"),
            plugins: missing.map(({ id }) => ({
                pluginId: id,
                containerNames: installations
                    .filter(({ pluginId, containerName }) => pluginId === id && containerName)
                    .map(({ containerName }) => containerName!),
            })),
        };
    });
}
