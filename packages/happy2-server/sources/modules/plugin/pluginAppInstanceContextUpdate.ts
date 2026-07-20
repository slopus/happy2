import { and, eq, sql } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginAppInstances } from "../schema.js";
import {
    pluginAppContextParse,
    pluginSurfaceIdentifier,
    pluginSurfaceJson,
} from "./impl/surfaceDefinition.js";
import { pluginSurfaceInstallationRequire } from "./impl/surfaceAuthority.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

/**
 * Replaces one pluginAppInstances row's bounded context and unconditionally advances dataRevision with durable sync evidence.
 * Keeping invalidation in this transaction boundary prevents concurrent collaborators from collapsing independent changes into one revision.
 */
export async function pluginAppInstanceContextUpdate(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        viewerUserId?: string;
        chatId?: string;
        instanceKey: unknown;
        context: unknown;
    },
): Promise<{ dataRevision: number; hint: MutationHint; id: string }> {
    const instanceKey = pluginSurfaceIdentifier(input.instanceKey, "app instanceKey", 128);
    const contextJson = pluginSurfaceJson(pluginAppContextParse(input.context));
    return withTransaction(executor, async (tx) => {
        await pluginSurfaceInstallationRequire(tx, input.installationId);
        const [current] = await tx
            .select({
                id: pluginAppInstances.id,
                dataRevision: pluginAppInstances.dataRevision,
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
        if (!current) throw new PluginError("not_found", "App instance was not found");
        if (current.ownerUserId && current.ownerUserId !== input.viewerUserId)
            throw new PluginError("forbidden", "App instance belongs to another user");
        if (current.chatId && current.chatId !== input.chatId)
            throw new PluginError("forbidden", "App instance belongs to another chat");
        const dataRevision = current.dataRevision + 1;
        if (!Number.isSafeInteger(dataRevision))
            throw new PluginError("conflict", "App instance data revision is exhausted");
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "apps",
            kind: "plugin.app_instance_invalidated",
            entityId: current.id,
            targetUserId: current.ownerUserId ?? undefined,
            chatId: current.chatId ?? undefined,
        });
        await tx
            .update(pluginAppInstances)
            .set({
                contextJson,
                dataRevision,
                syncSequence: mutation.sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(pluginAppInstances.id, current.id));
        return { id: current.id, dataRevision, hint: mutation.hint };
    });
}
