import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS } from "./impl/maxAgentImageBuildLogCharacters.js";
import { type MutationHint } from "../chat/types.js";
import { agentImages } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Advances the progress and retained output of the agentImages build owned by the supplied lease token.
 * The lease-guarded update gives live clients monotonic status without allowing late output from an abandoned worker.
 */
export async function agentImageRecordBuildOutput(
    executor: DrizzleExecutor,
    input: {
        imageId: string;
        lastBuildLogLine?: string;
        logChunk: string;
        progress: number;
        workerId: string;
    },
): Promise<MutationHint | undefined> {
    const progress = Math.max(1, Math.min(99, Math.trunc(input.progress)));
    return withTransaction(executor, async (tx) => {
        const changed = await tx
            .update(agentImages)
            .set({
                buildLog: sql`substr(${agentImages.buildLog} || ${input.logChunk}, -${MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS})`,
                buildLogTruncated: sql`CASE WHEN ${agentImages.buildLogTruncated} = 1 OR length(${agentImages.buildLog}) + length(${input.logChunk}) > ${MAX_AGENT_IMAGE_BUILD_LOG_CHARACTERS} THEN 1 ELSE 0 END`,
                buildProgress: sql`max(${agentImages.buildProgress}, ${progress})`,
                ...(input.lastBuildLogLine === undefined
                    ? {}
                    : {
                          lastBuildLogLine: input.lastBuildLogLine,
                      }),
                buildLogUpdatedAt: sql`CURRENT_TIMESTAMP`,
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
            kind: "agentImage.buildProgress",
            entityId: input.imageId,
        });
        return areaHint(sequence, "agent-images");
    });
}
