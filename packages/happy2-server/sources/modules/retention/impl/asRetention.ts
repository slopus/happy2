import { number } from "../../operations/number.js";
import { optionalText } from "../../operations/optionalText.js";
import { parseJson } from "../../operations/parseJson.js";
import { type RetentionRun, type RetentionScope } from "../../operations/types.js";

import { text } from "../../operations/text.js";
export function asRetention(row: Record<string, unknown>): RetentionRun {
    return {
        id: text(row.id),
        scope: text(row.scope) as RetentionScope,
        status: text(row.status) as RetentionRun["status"],
        itemsExamined: number(row.items_examined),
        itemsDeleted: number(row.items_deleted),
        details: parseJson(row.details_json),
        lastError: optionalText(row.last_error),
        startedAt: text(row.started_at),
        completedAt: optionalText(row.completed_at),
    };
}
