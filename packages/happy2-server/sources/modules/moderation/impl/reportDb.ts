import { type DrizzleExecutor } from "../../drizzle.js";
import { type ModerationReport, OperationsError } from "../../operations/types.js";

import { asReport } from "./asReport.js";
import { eq } from "drizzle-orm";
import { moderationReports } from "../../schema.js";
import { reportSelection } from "./reportSelection.js";
/**
 * Loads the canonical moderation-report projection by identifier and maps absence to the operations not-found error.
 * One mapper keeps assignment, target, resolution, and status fields consistent across report creation, updates, and enforcement.
 */
export async function reportDb(executor: DrizzleExecutor, id: string): Promise<ModerationReport> {
    const [row] = await executor
        .select(reportSelection)
        .from(moderationReports)
        .where(eq(moderationReports.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Moderation report was not found");
    return asReport(row);
}
