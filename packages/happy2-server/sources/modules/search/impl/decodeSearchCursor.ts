import { CollaborationError } from "../../chat/types.js";
export function decodeSearchCursor(cursor: string | undefined, query: string): number {
    if (!cursor) return 0;
    if (cursor.length > 1_024) throw new CollaborationError("invalid", "Search cursor is invalid");
    try {
        const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as {
            query?: unknown;
            offset?: unknown;
        };
        if (
            decoded.query !== query ||
            !Number.isSafeInteger(decoded.offset) ||
            (decoded.offset as number) < 0
        )
            throw new Error("cursor mismatch");
        return decoded.offset as number;
    } catch {
        throw new CollaborationError("invalid", "Search cursor is invalid");
    }
}
