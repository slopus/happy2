import { type DrizzleExecutor } from "../../drizzle.js";
import { IntegrationError } from "../../integrations/types.js";
import { and, eq, isNull, sql } from "drizzle-orm";

import { files } from "../../schema.js";

/**
 * Requires a file to exist, be complete, remain undeleted, and have a non-infected scan result before a bot may reference it.
 * This storage-level guard prevents bot mutations from persisting unusable or quarantined profile assets.
 */
export async function requireFileDb(executor: DrizzleExecutor, fileId: string): Promise<void> {
    const [row] = await executor
        .select({
            id: files.id,
        })
        .from(files)
        .where(
            and(
                eq(files.id, fileId),
                isNull(files.deletedAt),
                eq(files.uploadStatus, "complete"),
                sql`${files.scanStatus} != 'infected'`,
            ),
        );
    if (!row) throw new IntegrationError("not_found", "File was not found");
}
