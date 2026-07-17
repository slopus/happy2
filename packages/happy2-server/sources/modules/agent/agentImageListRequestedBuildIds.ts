import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { and, eq, isNull, lte, or, sql } from "drizzle-orm";

/**
 * Lists non-system images with a requested pending build or an expired building lease, ordered by request and creation time.
 * This queue projection lets workers recover abandoned builds while leaving actively leased and unrequested definitions untouched.
 */
export async function agentImageListRequestedBuildIds(
    executor: DrizzleExecutor,
): Promise<string[]> {
    const rows = await executor
        .select({
            id: agentImages.id,
        })
        .from(agentImages)
        .where(
            and(
                eq(agentImages.systemOnly, 0),
                or(
                    and(
                        eq(agentImages.status, "pending"),
                        sql`${agentImages.buildRequestedAt} IS NOT NULL`,
                    ),
                    and(
                        eq(agentImages.status, "building"),
                        or(
                            isNull(agentImages.leaseExpiresAt),
                            lte(agentImages.leaseExpiresAt, new Date().toISOString()),
                        ),
                    ),
                ),
            ),
        )
        .orderBy(agentImages.buildRequestedAt, agentImages.createdAt, agentImages.id);
    return rows.map((row) => row.id);
}
