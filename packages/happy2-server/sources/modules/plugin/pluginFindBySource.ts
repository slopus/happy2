import { and, eq } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { plugins } from "../schema.js";

/**
 * Finds the durable system plugin for one catalog source so installation orchestration can reuse its immutable package snapshot.
 * This read-only lookup does not mutate durable state and exists to avoid copying package files for ordinary additional installations.
 */
export async function pluginFindBySource(
    executor: DrizzleExecutor,
    sourceKind: "builtin",
    sourceReference: string,
): Promise<{ id: string } | undefined> {
    const [row] = await executor
        .select({ id: plugins.id })
        .from(plugins)
        .where(
            and(eq(plugins.sourceKind, sourceKind), eq(plugins.sourceReference, sourceReference)),
        )
        .limit(1);
    return row;
}
