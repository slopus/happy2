import { eq, sql } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { withTransaction } from "../drizzle.js";
import { pluginInstallations } from "../schema.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { areaHint } from "../chat/areaHint.js";
import type { MutationHint } from "../chat/types.js";
import type { PluginInstallationStatus } from "./types.js";

/**
 * Commits a worker-observed lifecycle state to pluginInstallations and appends its matching sync event.
 * The transaction makes asynchronous preparation and health transitions durable and reactive without letting the worker mutate tables directly.
 */
export async function pluginInstallationUpdateStatus(
    executor: DrizzleExecutor,
    input: {
        installationId: string;
        status: PluginInstallationStatus;
        detail: string;
        error?: string;
        runtimeImageTag?: string;
    },
): Promise<MutationHint> {
    return withTransaction(executor, async (tx) => {
        const sequence = await syncSequenceNext(tx);
        const [updated] = await tx
            .update(pluginInstallations)
            .set({
                status: input.status,
                statusDetail: input.detail,
                lastError: input.error ?? null,
                runtimeImageTag: input.runtimeImageTag,
                syncSequence: sequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
                readyAt: input.status === "ready" ? sql`CURRENT_TIMESTAMP` : null,
            })
            .where(eq(pluginInstallations.id, input.installationId))
            .returning({ id: pluginInstallations.id });
        if (!updated) throw new Error("Plugin installation disappeared during status update");
        await syncEventInsert(tx, {
            sequence,
            kind: `plugin.${input.status}`,
            entityId: input.installationId,
        });
        return areaHint(sequence, "plugins");
    });
}
