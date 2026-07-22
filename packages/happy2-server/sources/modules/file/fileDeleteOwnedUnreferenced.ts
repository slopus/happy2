import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { and, eq, isNull, sql } from "drizzle-orm";

import { files } from "../schema.js";
import { hasFileReference } from "./impl/hasFileReference.js";

/**
 * Soft-deletes a files row only when the actor owns it and no message, document, profile, emoji, export, or other durable reference still uses it.
 * Performing the reference checks beside the guarded update prevents cleanup from invalidating content that became linked concurrently.
 */
export async function fileDeleteOwnedUnreferenced(
    executor: DrizzleExecutor,
    id: string,
    userId: string,
    reason?: string,
): Promise<"deleted" | "not_found" | "in_use"> {
    return withTransaction(executor, async (tx) => {
        const [file] = await tx
            .select({
                id: files.id,
            })
            .from(files)
            .where(
                and(eq(files.id, id), eq(files.uploadedByUserId, userId), isNull(files.deletedAt)),
            );
        if (!file) return "not_found";
        if (await hasFileReference(tx, id)) return "in_use";
        await tx
            .update(files)
            .set({
                deletedAt: sql`CURRENT_TIMESTAMP`,
                deletedByUserId: userId,
                deleteReason: reason ?? null,
            })
            .where(and(eq(files.id, id), isNull(files.deletedAt)));
        return "deleted";
    });
}
