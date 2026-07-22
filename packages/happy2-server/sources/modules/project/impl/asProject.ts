import { number } from "../../chat/number.js";
import { optionalText } from "../../chat/optionalText.js";
import { text } from "../../chat/text.js";
import type { ProjectSummary } from "../types.js";

export function asProject(row: Record<string, unknown>): ProjectSummary {
    return {
        id: text(row.id),
        name: text(row.name),
        description: optionalText(row.description),
        isDefault: number(row.is_default, 0) === 1,
        createdByUserId: optionalText(row.created_by_user_id),
        syncSequence: text(row.sync_sequence, "0"),
        createdAt: text(row.created_at),
        updatedAt: text(row.updated_at),
    };
}
