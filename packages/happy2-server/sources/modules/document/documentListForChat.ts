import { desc, eq } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { documentChannelAttachments, documents } from "../schema.js";
import { documentSummariesGet } from "./impl/documentSummaryGet.js";
import { type DocumentSummary } from "./types.js";

/**
 * Lists documents attached to one channel where the actor is a member, newest activity first,
 * by reading `documentChannelAttachments` without mutating durable state. Owners always
 * retain direct document access, while ordinary callers receive `not_found` for an
 * inaccessible channel so its document attachments cannot be probed; this boundary
 * serves the channel documents panel separately from the global collection.
 */
export async function documentListForChat(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<DocumentSummary[]> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new CollaborationError("not_found", "Chat was not found");
    const rows = await executor
        .select({ document: documents })
        .from(documentChannelAttachments)
        .innerJoin(documents, eq(documents.id, documentChannelAttachments.documentId))
        .where(eq(documentChannelAttachments.chatId, chatId))
        .orderBy(desc(documents.updatedAt), desc(documents.id));
    return documentSummariesGet(
        executor,
        actorUserId,
        rows.map((row) => row.document),
    );
}
