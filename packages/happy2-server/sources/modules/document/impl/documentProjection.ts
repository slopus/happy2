import {
    type DocumentChannelAttachment,
    type DocumentFormat,
    type DocumentSummary,
} from "../types.js";
import { type DocumentRow } from "./documentRowGet.js";

/** Projects a documents row into its public summary with sequences as decimal strings. */
export function documentProjection(
    row: DocumentRow,
    channelAttachments: readonly DocumentChannelAttachment[],
): DocumentSummary {
    return {
        id: row.id,
        ownerUserId: row.ownerUserId,
        title: row.title,
        format: row.format as DocumentFormat,
        channelAttachments,
        latestSequence: String(row.lastSequence),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
