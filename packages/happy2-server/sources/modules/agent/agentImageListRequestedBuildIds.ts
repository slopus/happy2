import { type DrizzleExecutor } from "../drizzle.js";
import { agentImages } from "../schema.js";
import { and, eq, or, sql } from "drizzle-orm";

/**
 * Lists images with requested pending work or any in-progress build, ordered by request and creation time.
 * Including live leases lets a restarted worker schedule a claim for their expiry instead of leaving crash-interrupted builds stranded.
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
                or(
                    and(
                        eq(agentImages.status, "pending"),
                        sql`${agentImages.buildRequestedAt} IS NOT NULL`,
                    ),
                    eq(agentImages.status, "building"),
                ),
            ),
        )
        .orderBy(agentImages.buildRequestedAt, agentImages.createdAt, agentImages.id);
    return rows.map((row) => row.id);
}
