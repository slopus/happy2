import { and, eq, lt, or, type SQL } from "drizzle-orm";
import { type AnySQLiteColumn } from "drizzle-orm/sqlite-core";
import { type Cursor } from "./impl/cursor.js";

export function cursorCondition(
    timestampColumn: AnySQLiteColumn,
    idColumn: AnySQLiteColumn,
    cursor: Cursor,
): SQL {
    return or(
        lt(timestampColumn, cursor.at),
        and(eq(timestampColumn, cursor.at), lt(idColumn, cursor.id)),
    )!;
}
