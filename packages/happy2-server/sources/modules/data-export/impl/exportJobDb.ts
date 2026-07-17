import { type DataExportJob, OperationsError } from "../../operations/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";

import { asExport } from "./asExport.js";
import { dataExportJobs } from "../../schema.js";
import { eq } from "drizzle-orm";
import { exportSelection } from "./exportSelection.js";
/**
 * Loads the canonical data-export job projection by identifier and maps absence to an operations not-found error.
 * Sharing this mapper across request, worker, and completion paths keeps lease, result-file, status, and error fields consistent.
 */
export async function exportJobDb(executor: DrizzleExecutor, id: string): Promise<DataExportJob> {
    const [row] = await executor
        .select(exportSelection)
        .from(dataExportJobs)
        .where(eq(dataExportJobs.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Data export was not found");
    return asExport(row);
}
