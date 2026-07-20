import { desc, eq } from "drizzle-orm";
import { chatCanAccess } from "../chat/chatCanAccess.js";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { documents } from "../schema.js";
import { documentProjection } from "./impl/documentProjection.js";
import { type DocumentSummary } from "./types.js";

/**
 * Lists the document summaries of one chat, newest activity first, without reading any
 * document content. Chat access is enforced with `not_found` so a stranger cannot
 * distinguish a private chat from a missing one.
 */
export async function documentList(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<DocumentSummary[]> {
    if (!(await chatCanAccess(executor, actorUserId, chatId)))
        throw new CollaborationError("not_found", "Chat was not found");
    const rows = await executor
        .select()
        .from(documents)
        .where(eq(documents.chatId, chatId))
        .orderBy(desc(documents.updatedAt), desc(documents.id));
    return rows.map(documentProjection);
}
