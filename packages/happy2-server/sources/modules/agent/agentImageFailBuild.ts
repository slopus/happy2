import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentImages } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Marks the currently leased agentImages build as failed and preserves its bounded diagnostic output for operators.
 * Requiring the active lease keeps a superseded builder from turning a later successful attempt back into a failure.
 */
export async function agentImageFailBuild(
    executor: DrizzleExecutor,
    input: {
        error: string;
        imageId: string;
        workerId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const changed = await tx
            .update(agentImages)
            .set({
                status: "failed",
                dockerImageId: null,
                lastError: input.error,
                readyAt: null,
                workerId: null,
                leaseExpiresAt: null,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentImages.id, input.imageId),
                    eq(agentImages.status, "building"),
                    eq(agentImages.workerId, input.workerId),
                ),
            )
            .returning({
                id: agentImages.id,
            });
        if (changed.length !== 1) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.failed",
            entityId: input.imageId,
        });
        return areaHint(sequence, "agent-images");
    });
}
