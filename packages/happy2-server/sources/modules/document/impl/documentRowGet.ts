import { eq } from "drizzle-orm";
import { chatCanPost } from "../../chat/chatCanPost.js";
import { chatGetAccess } from "../../chat/chatGetAccess.js";
import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { documents } from "../../schema.js";
import { documentAttachmentRowsList } from "./documentAttachmentRowsList.js";

export type DocumentRow = typeof documents.$inferSelect;

/**
 * Loads one document row and enforces standalone ownership plus channel attachment
 * access. The owner always passes; another actor may read through membership in any
 * attached channel and may write by being able to post in any attached channel.
 * `not_found` covers both absence and denial so document attachment is not probeable.
 */
export async function documentRowGet(
    executor: DrizzleExecutor,
    actorUserId: string,
    documentId: string,
    access: "read" | "write" | "owner",
): Promise<DocumentRow> {
    const [row] = await executor
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "Document was not found");
    if (row.ownerUserId === actorUserId) return row;
    if (access === "owner") throw new CollaborationError("not_found", "Document was not found");
    const attachments = await documentAttachmentRowsList(executor, documentId);
    const checks = attachments.map((attachment) =>
        access === "write"
            ? chatCanPost(executor, actorUserId, attachment.chatId)
            : chatGetAccess(executor, actorUserId, attachment.chatId, true).then(Boolean),
    );
    if (!(await Promise.all(checks)).some(Boolean))
        throw new CollaborationError("not_found", "Document was not found");
    return row;
}
