import { type DocumentFormat, type DocumentSummary } from "../types.js";
import { type DocumentRow } from "./documentRowGet.js";

/** Projects a documents row into its public summary with sequences as decimal strings. */
export function documentProjection(row: DocumentRow): DocumentSummary {
    return {
        id: row.id,
        chatId: row.chatId,
        title: row.title,
        format: row.format as DocumentFormat,
        createdByUserId: row.createdByUserId ?? undefined,
        latestSequence: String(row.lastSequence),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
