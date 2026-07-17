import { type DataExportJob, OperationsError } from "../operations/types.js";
import { type DrizzleExecutor } from "../drizzle.js";

import { exportJobDb } from "./impl/exportJobDb.js";
import { userRequireOperationsActive } from "../operations/userRequireOperationsActive.js";
/**
 * Returns a data-export job to its active requester or to a server administrator, hiding other users' jobs as not-found.
 * Applying ownership after the canonical job projection keeps status visibility and authorization consistent across operations routes.
 */
export async function dataExportGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    jobId: string,
): Promise<DataExportJob> {
    const actor = await userRequireOperationsActive(executor, actorUserId);
    const job = await exportJobDb(executor, jobId);
    if (actor.role !== "admin" && job.requestedByUserId !== actorUserId)
        throw new OperationsError("not_found", "Data export was not found");
    return job;
}
