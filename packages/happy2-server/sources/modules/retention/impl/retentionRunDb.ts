import { type DrizzleExecutor } from "../../drizzle.js";
import { OperationsError, type RetentionRun } from "../../operations/types.js";

import { asRetention } from "./asRetention.js";
import { eq } from "drizzle-orm";
import { retentionRuns } from "../../schema.js";
import { retentionSelection } from "./retentionSelection.js";
/**
 * Loads the canonical retention-run projection by identifier and maps absence to the operations not-found error.
 * Sharing this mapper across start and finish keeps scope, counts, timestamps, errors, and policy metadata consistent.
 */
export async function retentionRunDb(executor: DrizzleExecutor, id: string): Promise<RetentionRun> {
    const [row] = await executor
        .select(retentionSelection)
        .from(retentionRuns)
        .where(eq(retentionRuns.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Retention run was not found");
    return asRetention(row);
}
