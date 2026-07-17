import { encodeCursor } from "./impl/encodeCursor.js";
import { type Page } from "./types.js";
export function page<R extends Record<string, unknown>, T>(
    rows: R[],
    limit: number,
    map: (row: R) => T,
    timestamp: (item: T) => string = (item) =>
        (
            item as {
                createdAt: string;
            }
        ).createdAt,
    id: (item: T) => string = (item) =>
        (
            item as {
                id: string;
            }
        ).id,
): Page<T> {
    const hasMore = rows.length > limit;
    const items = rows.slice(0, limit).map(map);
    const last = items.at(-1);
    return {
        items,
        nextCursor: hasMore && last ? encodeCursor(timestamp(last), id(last)) : undefined,
    };
}
