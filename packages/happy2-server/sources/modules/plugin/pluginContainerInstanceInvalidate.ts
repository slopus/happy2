import { and, eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";

/**
 * Revokes one missing container incarnation in pluginInstallations only if it is still the installation's current authority.
 * The guarded transaction prevents an old health check from invalidating a replacement and publishes the resulting failed lifecycle state.
 */
export async function pluginContainerInstanceInvalidate(
    executor: DrizzleExecutor,
    input: { installationId: string; containerInstanceId: string; detail: string },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const [current] = await tx
            .select({ id: pluginInstallations.id })
            .from(pluginInstallations)
            .where(
                and(
                    eq(pluginInstallations.id, input.installationId),
                    eq(pluginInstallations.containerInstanceId, input.containerInstanceId),
                ),
            )
            .limit(1);
        if (!current) return undefined;
        const sequence = await syncSequenceNext(tx);
        const [updated] = await tx
            .update(pluginInstallations)
            .set({
                containerInstanceId: null,
                status: "failed",
                statusDetail: input.detail,
                lastError: "The recorded plugin container is not running.",
                readyAt: null,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(pluginInstallations.id, input.installationId),
                    eq(pluginInstallations.containerInstanceId, input.containerInstanceId),
                ),
            )
            .returning({ id: pluginInstallations.id });
        if (!updated) return undefined;
        await syncEventInsert(tx, {
            sequence,
            kind: "plugin.failed",
            entityId: input.installationId,
        });
        return areaHint(sequence, "plugins");
    });
}
