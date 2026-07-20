import { asc, isNull } from "drizzle-orm";
import type { DrizzleExecutor } from "../drizzle.js";
import { portShares } from "../schema.js";
import { asPortShare } from "./impl/asPortShare.js";
import { portShareSelection } from "./impl/portShareSelection.js";
import type { PortShareSummary } from "./types.js";

/**
 * Loads every durable active portShares hostname for server startup without changing share state.
 * Keeping this read behind an action lets the process rebuild a non-authoritative routing cache while the database remains the access authority.
 */
export async function portShareListActive(executor: DrizzleExecutor): Promise<PortShareSummary[]> {
    const rows = await executor
        .select(portShareSelection)
        .from(portShares)
        .where(isNull(portShares.disabledAt))
        .orderBy(asc(portShares.id));
    return rows.map(asPortShare);
}
