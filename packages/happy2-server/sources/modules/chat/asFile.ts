import { type FileKind } from "../file/types.js";
import { type FileSummary } from "./types.js";
import { number } from "./number.js";
import { optionalText } from "./optionalText.js";
import { text } from "./text.js";
export function asFile(row: Record<string, unknown>): FileSummary {
    return {
        id: text(row.id),
        kind: text(row.kind) as FileKind,
        originalName: optionalText(row.original_name),
        contentType: text(row.content_type),
        size: number(row.size),
        width: number(row.width, 0) || undefined,
        height: number(row.height, 0) || undefined,
        durationMs: number(row.duration_ms, 0) || undefined,
        thumbhash: optionalText(row.thumbhash) || undefined,
        uploadedByUserId: text(row.uploaded_by_user_id),
        createdAt: text(row.created_at),
    };
}
