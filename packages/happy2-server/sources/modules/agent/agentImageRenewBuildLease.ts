import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { and, eq, sql } from "drizzle-orm";

/**
 * Extends an agentImages build lease only when the caller still owns the in-progress attempt.
 * This compare-and-renew boundary lets workers prove liveness without reviving an expired or reassigned build.
 */
export async function agentImageRenewBuildLease(
    executor: DrizzleExecutor,
    imageId: string,
    workerId: string,
): Promise<boolean> {
    const changed = await withTransaction(executor, (tx) =>
        tx
            .update(agentImages)
            .set({
                leaseExpiresAt: new Date(Date.now() + 60_000).toISOString(),
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(
                and(
                    eq(agentImages.id, imageId),
                    eq(agentImages.status, "building"),
                    eq(agentImages.workerId, workerId),
                ),
            )
            .returning({
                id: agentImages.id,
            }),
    );
    return changed.length === 1;
}
