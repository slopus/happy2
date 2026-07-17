import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentImages } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Moves a leased agentImages build to ready with its resulting Docker image identifier and terminal progress details.
 * Lease validation at this boundary prevents an expired worker from publishing output over a newer build attempt.
 */
export async function agentImageCompleteBuild(
    executor: DrizzleExecutor,
    input: {
        dockerImageId: string;
        imageId: string;
        workerId: string;
    },
): Promise<MutationHint | undefined> {
    return withTransaction(executor, async (tx) => {
        const changed = await tx
            .update(agentImages)
            .set({
                status: "ready",
                buildProgress: 100,
                dockerImageId: input.dockerImageId,
                lastError: null,
                readyAt: sql`CURRENT_TIMESTAMP`,
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
            kind: "agentImage.ready",
            entityId: input.imageId,
        });
        return areaHint(sequence, "agent-images");
    });
}
