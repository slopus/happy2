import { and, eq } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginAppInstances } from "../schema.js";
import { pluginSurfaceInstallationRequire } from "./impl/surfaceAuthority.js";
import { pluginSurfaceIdentifier } from "./impl/surfaceDefinition.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

/**
 * Deletes one installation-owned pluginAppInstances row and its cascading presentation preferences while recording a durable sync tombstone.
 * This boundary verifies installation ownership before removal so one plugin cannot delete another plugin's destination.
 */
export async function pluginAppInstanceDelete(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        viewerUserId?: string;
        chatId?: string;
        instanceKey: unknown;
    },
): Promise<{ deleted: boolean; hint?: MutationHint }> {
    const instanceKey = pluginSurfaceIdentifier(input.instanceKey, "app instanceKey", 128);
    return withTransaction(executor, async (tx) => {
        await pluginSurfaceInstallationRequire(tx, input.installationId);
        const [current] = await tx
            .select({
                id: pluginAppInstances.id,
                ownerUserId: pluginAppInstances.ownerUserId,
                chatId: pluginAppInstances.chatId,
            })
            .from(pluginAppInstances)
            .where(
                and(
                    eq(pluginAppInstances.installationId, input.installationId),
                    eq(pluginAppInstances.instanceKey, instanceKey),
                ),
            )
            .limit(1);
        if (!current) return { deleted: false };
        if (current.ownerUserId && current.ownerUserId !== input.viewerUserId)
            throw new PluginError("forbidden", "App instance belongs to another user");
        if (current.chatId && current.chatId !== input.chatId)
            throw new PluginError("forbidden", "App instance belongs to another chat");
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "apps",
            kind: "plugin.app_instance_deleted",
            entityId: current.id,
            targetUserId: current.ownerUserId ?? undefined,
            chatId: current.chatId ?? undefined,
        });
        await tx.delete(pluginAppInstances).where(eq(pluginAppInstances.id, current.id));
        return { deleted: true, hint: mutation.hint };
    });
}
