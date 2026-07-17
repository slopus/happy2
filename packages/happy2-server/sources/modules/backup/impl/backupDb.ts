import { type BackupRecord, OperationsError } from "../../operations/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";

import { asBackup } from "./asBackup.js";
import { backupRecords } from "../../schema.js";
import { backupSelection } from "./backupSelection.js";
import { eq } from "drizzle-orm";
/**
 * Loads the canonical backup record by identifier and maps absence to the operations not-found error.
 * Reusing the same projection after create and update keeps returned status, retention, storage, and audit fields consistent.
 */
export async function backupDb(executor: DrizzleExecutor, id: string): Promise<BackupRecord> {
    const [row] = await executor
        .select(backupSelection)
        .from(backupRecords)
        .where(eq(backupRecords.id, id))
        .limit(1);
    if (!row) throw new OperationsError("not_found", "Backup was not found");
    return asBackup(row);
}
