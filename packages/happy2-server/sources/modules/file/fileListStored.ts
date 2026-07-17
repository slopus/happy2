import { type DrizzleExecutor } from "../drizzle.js";
import { type StoredFile } from "./types.js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { asFile } from "./impl/asFile.js";

import { files } from "../schema.js";

/**
 * Lists all complete, non-deleted, non-infected stored-file records in identifier order for internal storage reconciliation.
 * This unscoped inventory deliberately omits product authorization and therefore remains an infrastructure boundary rather than a user-facing file list.
 */
export async function fileListStored(executor: DrizzleExecutor): Promise<StoredFile[]> {
    const rows = await executor
        .select()
        .from(files)
        .where(
            and(
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                ne(files.scanStatus, "infected"),
            ),
        )
        .orderBy(files.id);
    return rows.map(asFile);
}
