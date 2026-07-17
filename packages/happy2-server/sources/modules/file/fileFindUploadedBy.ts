import { type DrizzleExecutor } from "../drizzle.js";
import { type StoredFile } from "./types.js";
import { and, eq, isNull, ne } from "drizzle-orm";
import { asFile } from "./impl/asFile.js";

import { files } from "../schema.js";

/**
 * Resolves a complete, non-deleted, non-infected file only when the specified user originally uploaded it.
 * Keeping ownership in the query gives avatar, attachment, and cleanup callers a non-leaking absent result for other users' files.
 */
export async function fileFindUploadedBy(
    executor: DrizzleExecutor,
    id: string,
    userId: string,
): Promise<StoredFile | undefined> {
    const [file] = await executor
        .select()
        .from(files)
        .where(
            and(
                eq(files.id, id),
                eq(files.uploadedByUserId, userId),
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                ne(files.scanStatus, "infected"),
            ),
        );
    return file ? asFile(file) : undefined;
}
