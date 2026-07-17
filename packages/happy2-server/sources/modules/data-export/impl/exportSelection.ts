import { dataExportJobs } from "../../schema.js";
export const exportSelection = {
    id: dataExportJobs.id,
    requested_by_user_id: dataExportJobs.requestedByUserId,
    kind: dataExportJobs.kind,
    target_id: dataExportJobs.targetId,
    status: dataExportJobs.status,
    output_file_id: dataExportJobs.outputFileId,
    options_json: dataExportJobs.optionsJson,
    last_error: dataExportJobs.lastError,
    expires_at: dataExportJobs.expiresAt,
    created_at: dataExportJobs.createdAt,
    started_at: dataExportJobs.startedAt,
    completed_at: dataExportJobs.completedAt,
};
