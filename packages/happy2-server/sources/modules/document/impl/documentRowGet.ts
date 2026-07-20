import { eq } from "drizzle-orm";
import { chatCanAccess } from "../../chat/chatCanAccess.js";
import { chatCanPost } from "../../chat/chatCanPost.js";
import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { documents } from "../../schema.js";

export type DocumentRow = typeof documents.$inferSelect;

/**
 * Loads one document row and enforces the owning chat's access boundary,
 * reporting `not_found` for both a missing document and a forbidden chat so
 * existence is never leaked.
 */
export async function documentRowGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
    access: "read" | "write",
): Promise<DocumentRow> {
    const [row] = await executor
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "Document was not found");
    const allowed =
        access === "write"
            ? await chatCanPost(executor, actorUserId, row.chatId)
            : await chatCanAccess(executor, actorUserId, row.chatId);
    if (!allowed) throw new CollaborationError("not_found", "Document was not found");
    return row;
}
