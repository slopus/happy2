import { type AgentImageBuild } from "./impl/agentImageBuild.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";
import { agentImages } from "../schema.js";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { areaHint } from "../chat/areaHint.js";

import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Atomically claims an eligible agentImages build, assigning a lease while retaining progress and logs from an abandoned attempt.
 * A live competing lease returns retryAt while leaving agentImages unchanged, so restart recovery can requeue the same observable job exactly when it becomes claimable.
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
    | {
          retryAt: string;
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
                buildProgress: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.buildProgress} ELSE 1 END`,
                buildLog: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.buildLog} ELSE '' END`,
                buildLogTruncated: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.buildLogTruncated} ELSE 0 END`,
                lastBuildLogLine: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.lastBuildLogLine} ELSE NULL END`,
                buildLogUpdatedAt: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.buildLogUpdatedAt} ELSE CURRENT_TIMESTAMP END`,
                buildStartedAt: sql`CASE WHEN ${agentImages.status} = 'building' THEN ${agentImages.buildStartedAt} ELSE CURRENT_TIMESTAMP END`,
                lastError: null,
                workerId,
                leaseExpiresAt,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(and(eq(agentImages.id, imageId), isNull(agentImages.deletedAt), claimable))
            .returning({
                id: agentImages.id,
                buildContext: agentImages.buildContext,
                dockerfile: agentImages.dockerfile,
                dockerTag: agentImages.dockerTag,
            });
        if (!claimed) {
            const [leased] = await tx
                .select({
                    leaseExpiresAt: agentImages.leaseExpiresAt,
                    status: agentImages.status,
                })
                .from(agentImages)
                .where(and(eq(agentImages.id, imageId), isNull(agentImages.deletedAt)))
                .limit(1);
            if (
                leased?.status === "building" &&
                leased.leaseExpiresAt &&
                leased.leaseExpiresAt > now
            )
                return { retryAt: leased.leaseExpiresAt };
            return undefined;
        }
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
