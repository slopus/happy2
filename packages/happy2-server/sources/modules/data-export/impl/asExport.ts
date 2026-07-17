import {
    type DataExportJob,
    type DataExportKind,
    type DataExportStatus,
} from "../../operations/types.js";

import { optionalText } from "../../operations/optionalText.js";
import { parseJson } from "../../operations/parseJson.js";
import { text } from "../../operations/text.js";
export function asExport(row: Record<string, unknown>): DataExportJob {
    return {
        id: text(row.id),
        requestedByUserId: optionalText(row.requested_by_user_id),
        kind: text(row.kind) as DataExportKind,
        targetId: optionalText(row.target_id),
        status: text(row.status) as DataExportStatus,
        outputFileId: optionalText(row.output_file_id),
        options: parseJson(row.options_json),
        lastError: optionalText(row.last_error),
        expiresAt: optionalText(row.expires_at),
        createdAt: text(row.created_at),
        startedAt: optionalText(row.started_at),
        completedAt: optionalText(row.completed_at),
    };
}
