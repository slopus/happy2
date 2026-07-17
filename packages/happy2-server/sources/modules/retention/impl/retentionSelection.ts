import { retentionRuns } from "../../schema.js";
export const retentionSelection = {
    id: retentionRuns.id,
    scope: retentionRuns.scope,
    status: retentionRuns.status,
    items_examined: retentionRuns.itemsExamined,
    items_deleted: retentionRuns.itemsDeleted,
    details_json: retentionRuns.detailsJson,
    last_error: retentionRuns.lastError,
    started_at: retentionRuns.startedAt,
    completed_at: retentionRuns.completedAt,
};
