import { type BackupStatus, OperationsError } from "../../operations/types.js";

export function assertBackupTransition(
    from: BackupStatus,
    to: Exclude<BackupStatus, "pending">,
): void {
    const allowed: Record<BackupStatus, readonly BackupStatus[]> = {
        pending: ["running", "failed", "deleted"],
        running: ["complete", "failed", "deleted"],
        complete: ["deleted"],
        failed: ["deleted"],
        deleted: [],
    };
    if (!allowed[from].includes(to))
        throw new OperationsError("conflict", `Cannot move a backup from ${from} to ${to}`);
}
