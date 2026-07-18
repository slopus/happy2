import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Clears build ownership from building agentImages rows while retaining their lifecycle, progress, and log state across shutdown.
 * Releasing only matching leases makes interrupted builds claimable again without making recovery indistinguishable from a fresh request.
 */
export async function agentImageReleaseBuildLeases(
    executor: DrizzleExecutor,
    workerId: string,
): Promise<void> {
    await withTransaction(executor, async (tx) => {
        const changed = await tx
            .update(agentImages)
            .set({
                workerId: null,
                leaseExpiresAt: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(agentImages.workerId, workerId), eq(agentImages.status, "building")))
            .returning({
                id: agentImages.id,
            });
        if (!changed.length) return;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.buildReleased",
            entityId: changed[0]!.id,
        });
    });
}
