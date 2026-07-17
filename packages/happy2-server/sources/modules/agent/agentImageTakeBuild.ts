import { type AgentImageBuild } from "./impl/agentImageBuild.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentImages } from "../schema.js";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Atomically claims the next eligible agentImages build, assigning a lease token and attempt deadline to one worker.
 * The conditional claim is the concurrency boundary that prevents two builders from executing the same queued image.
 */
export async function agentImageTakeBuild(
    executor: DrizzleExecutor,
    imageId: string,
    workerId: string,
): Promise<
    | {
          build: AgentImageBuild;
          hint: MutationHint;
      }
    | undefined
> {
    return withTransaction(executor, async (tx) => {
        const now = new Date().toISOString();
        const leaseExpiresAt = new Date(Date.now() + 60_000).toISOString();
        const claimable = or(
            and(
                eq(agentImages.status, "pending"),
                sql`${agentImages.buildRequestedAt} IS NOT NULL`,
            ),
            and(
                eq(agentImages.status, "building"),
                or(isNull(agentImages.leaseExpiresAt), lte(agentImages.leaseExpiresAt, now)),
            ),
        );
        const [claimed] = await tx
            .update(agentImages)
            .set({
                status: "building",
                buildAttempt: sql`${agentImages.buildAttempt} + 1`,
                buildProgress: 1,
                buildLog: "",
                buildLogTruncated: 0,
                lastBuildLogLine: null,
                buildLogUpdatedAt: sql`CURRENT_TIMESTAMP`,
                buildStartedAt: sql`CURRENT_TIMESTAMP`,
                lastError: null,
                workerId,
                leaseExpiresAt,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(agentImages.id, imageId), eq(agentImages.systemOnly, 0), claimable))
            .returning({
                id: agentImages.id,
                buildContext: agentImages.buildContext,
                dockerfile: agentImages.dockerfile,
                dockerTag: agentImages.dockerTag,
            });
        if (!claimed) return undefined;
        const sequence = await syncSequenceNext(tx);
        await syncEventInsert(tx, {
            sequence,
            kind: "agentImage.building",
            entityId: imageId,
        });
        return {
            build: {
                id: claimed.id,
                dockerfile: claimed.dockerfile,
                dockerTag: claimed.dockerTag,
                ...(claimed.buildContext
                    ? {
                          buildContext: claimed.buildContext,
                      }
                    : {}),
            },
            hint: areaHint(sequence, "agent-images"),
        };
    });
}
