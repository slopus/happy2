import { and, eq, isNull } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { portShares } from "../schema.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import type { PortShareSummary } from "./types.js";

/**
 * Resolves one active durable portShares subdomain after a process-local hostname cache miss without changing share state.
 * This lookup boundary lets the in-memory proxy map discover active routes created by another server process.
 */
export async function portShareGetActiveBySubdomain(
    executor: DrizzleExecutor,
    subdomain: string,
): Promise<PortShareSummary | undefined> {
    const [row] = await executor
        .select(portShareSelection)
        .from(portShares)
        .where(and(eq(portShares.subdomain, subdomain), isNull(portShares.disabledAt)))
        .limit(1);
    return row ? asPortShare(row) : undefined;
}
