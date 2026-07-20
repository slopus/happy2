import { and, eq } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginContributions } from "../schema.js";
import { pluginSurfaceIdentifier } from "./impl/surfaceDefinition.js";
import { pluginSurfaceInstallationRequire } from "./impl/surfaceAuthority.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

/**
 * Deletes one pluginContributions row only within its owning installation and records a scoped reconciliation tombstone.
 * This transaction boundary prevents cross-installation deletion and lets native surfaces reconcile without invoking plugin behavior.
 */
export async function pluginContributionDelete(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        viewerUserId?: string;
        chatId?: string;
        externalKey: unknown;
    },
): Promise<{ deleted: boolean; hint?: MutationHint }> {
    const externalKey = pluginSurfaceIdentifier(input.externalKey, "contribution externalKey", 128);
    return withTransaction(executor, async (tx) => {
        await pluginSurfaceInstallationRequire(tx, input.installationId);
        const [current] = await tx
            .select({
                id: pluginContributions.id,
                ownerUserId: pluginContributions.ownerUserId,
                chatId: pluginContributions.chatId,
            })
            .from(pluginContributions)
            .where(
                and(
                    eq(pluginContributions.installationId, input.installationId),
                    eq(pluginContributions.contributionKey, externalKey),
                ),
            )
            .limit(1);
        if (!current) return { deleted: false };
        if (current.ownerUserId && current.ownerUserId !== input.viewerUserId)
            throw new PluginError("forbidden", "Contribution belongs to another user");
        if (current.chatId && current.chatId !== input.chatId)
            throw new PluginError("forbidden", "Contribution belongs to another chat");
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "contributions",
            kind: "plugin.contribution_deleted",
            entityId: current.id,
            targetUserId: current.ownerUserId ?? undefined,
            chatId: current.chatId ?? undefined,
        });
        await tx.delete(pluginContributions).where(eq(pluginContributions.id, current.id));
        return { deleted: true, hint: mutation.hint };
    });
}
