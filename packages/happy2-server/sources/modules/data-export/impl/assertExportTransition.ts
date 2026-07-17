import { type DataExportStatus, OperationsError } from "../../operations/types.js";

export function assertExportTransition(
    from: DataExportStatus,
    to: Exclude<DataExportStatus, "pending">,
): void {
    const allowed: Record<DataExportStatus, readonly DataExportStatus[]> = {
        pending: ["running", "failed", "cancelled"],
        running: ["complete", "failed", "cancelled"],
        complete: ["expired"],
        failed: [],
        cancelled: [],
        expired: [],
    };
    if (!allowed[from].includes(to))
        throw new OperationsError("conflict", `Cannot move a data export from ${from} to ${to}`);
}
