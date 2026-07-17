import { type DrizzleExecutor } from "../drizzle.js";
import { type StoredFile } from "./types.js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { asFile } from "./impl/asFile.js";

import { files } from "../schema.js";

/**
 * Resolves stored-file metadata by identifier only for complete, non-deleted, non-infected uploads.
 * Treating quarantined and incomplete rows as absent keeps storage consumers from opening files that are not safe to serve.
 */
export async function fileFind(
    executor: DrizzleExecutor,
    id: string,
): Promise<StoredFile | undefined> {
    const [file] = await executor
        .select()
        .from(files)
        .where(
            and(
                eq(files.id, id),
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                ne(files.scanStatus, "infected"),
            ),
        );
    return file ? asFile(file) : undefined;
}
