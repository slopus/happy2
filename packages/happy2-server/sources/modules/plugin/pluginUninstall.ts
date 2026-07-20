import { eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { chatAppendAudit } from "../chat/chatAppendAudit.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import { userRequireServerAdmin } from "../chat/userRequireServerAdmin.js";
import { pluginInstallations, plugins } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { PluginError } from "./types.js";

/**
 * Atomically removes one plugins row and every linked pluginInstallations row, whose variables cascade away, while appending audit and sync evidence.
 * This durable boundary makes the plugin disappear before orchestration removes its containers, package snapshot, and writable data directory.
 */
export async function pluginUninstall(
    executor: DrizzleExecutor,
    actorUserId: string,
    pluginId: string,
): Promise<{
    containerNames: string[];
    hint: MutationHint;
    installationIds: string[];
    pluginId: string;
}> {
    return withTransaction(executor, async (tx) => {
        await userRequireServerAdmin(tx, actorUserId);
        const [plugin] = await tx
            .select({
                id: plugins.id,
                shortName: plugins.shortName,
                version: plugins.sourceVersion,
            })
            .from(plugins)
            .where(eq(plugins.id, pluginId))
            .limit(1);
        if (!plugin) throw new PluginError("not_found", "System plugin was not found");
        const installations = await tx
            .select({
                id: pluginInstallations.id,
                containerName: pluginInstallations.containerName,
            })
            .from(pluginInstallations)
            .where(eq(pluginInstallations.pluginId, pluginId));
        await tx.delete(pluginInstallations).where(eq(pluginInstallations.pluginId, pluginId));
        await tx.delete(plugins).where(eq(plugins.id, pluginId));
        await chatAppendAudit(tx, {
            actorUserId,
            action: "plugin.uninstalled",
            targetType: "plugin",
            targetId: pluginId,
            before: {
                shortName: plugin.shortName,
                version: plugin.version,
                installationIds: installations.map(({ id }) => id),
            },
        });
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.uninstalled",
            entityId: pluginId,
            actorUserId,
        });
        return {
            containerNames: installations.flatMap(({ containerName }) =>
                containerName ? [containerName] : [],
            ),
            hint: {
                ...areaHint(sequence, "plugins"),
                areas: ["plugins", "apps", "contributions"],
            },
            installationIds: installations.map(({ id }) => id),
            pluginId,
        };
    });
}
