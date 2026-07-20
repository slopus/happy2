import { sql } from "drizzle-orm";
import type { MutationHint } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { appPresentationPreferences } from "../schema.js";
import { pluginSurfaceViewerRequire } from "./impl/surfaceAuthority.js";
import { pluginPositionEncode, pluginSurfaceIdentifier } from "./impl/surfaceDefinition.js";
import { pluginAppInstanceProjectionList } from "./impl/surfaceProjection.js";
import { pluginSurfaceMutationRecord } from "./impl/surfaceMutation.js";
import { PluginError } from "./types.js";

/**
 * Upserts one appPresentationPreferences row for an already-visible sidebar app and emits viewer-targeted sync evidence.
 * The transaction isolates personal hide/order state from shared pluginAppInstances audience and definition state.
 */
export async function pluginAppPreferenceUpdate(
    executor: DrizzleExecutor,
    input: { viewerUserId: string; instanceId: unknown; hidden: unknown; position?: unknown },
): Promise<{ hint: MutationHint }> {
    const instanceId = pluginSurfaceIdentifier(input.instanceId, "app instanceId", 128);
    if (typeof input.hidden !== "boolean")
        throw new PluginError("broken_configuration", "App hidden preference must be a boolean");
    const hidden = input.hidden;
    let position: string | null = null;
    if (input.position !== undefined && input.position !== null) {
        if (
            !Number.isSafeInteger(input.position) ||
            (input.position as number) < 0 ||
            (input.position as number) > 999_999_999
        )
            throw new PluginError(
                "broken_configuration",
                "App preference position must be a nonnegative integer",
            );
        position = pluginPositionEncode(input.position as number);
    }
    return withTransaction(executor, async (tx) => {
        await pluginSurfaceViewerRequire(tx, input.viewerUserId);
        const [instance] = await pluginAppInstanceProjectionList(
            tx,
            input.viewerUserId,
            instanceId,
        );
        if (!instance || instance.presentation !== "sidebar")
            throw new PluginError("not_found", "Sidebar app instance was not found");
        const mutation = await pluginSurfaceMutationRecord(tx, {
            area: "apps",
            kind: "plugin.app_preference_changed",
            entityId: instanceId,
            actorUserId: input.viewerUserId,
            targetUserId: input.viewerUserId,
        });
        await tx
            .insert(appPresentationPreferences)
            .values({
                userId: input.viewerUserId,
                instanceId,
                hidden,
                position,
                syncSequence: mutation.sequence,
            })
            .onConflictDoUpdate({
                target: [appPresentationPreferences.userId, appPresentationPreferences.instanceId],
                set: {
                    hidden,
                    position,
                    syncSequence: mutation.sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        return { hint: mutation.hint };
    });
}
