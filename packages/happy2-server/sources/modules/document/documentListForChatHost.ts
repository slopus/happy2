import { desc, eq } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { documentChannelAttachments, documents } from "../schema.js";
import type { DocumentHostSummary } from "./types.js";

/** Lists safe document metadata attached to one plugin chat only while the token actor remains an active member. The single read transaction keeps membership revocation and the attachment projection on one database snapshot without exposing owner or cross-channel metadata. */
export async function documentListForChatHost(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<DocumentHostSummary[]> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, actorUserId, chatId, true)))
            throw new CollaborationError("not_found", "Chat was not found");
        const rows = await tx
            .select({
                id: documents.id,
                title: documents.title,
                format: documents.format,
                latestSequence: documents.lastSequence,
                updatedAt: documents.updatedAt,
            })
            .from(documentChannelAttachments)
            .innerJoin(documents, eq(documents.id, documentChannelAttachments.documentId))
            .where(eq(documentChannelAttachments.chatId, chatId))
            .orderBy(desc(documents.updatedAt), desc(documents.id));
        return rows.map((row) => ({
            id: row.id,
            title: row.title,
            format: row.format as DocumentHostSummary["format"],
            latestSequence: String(row.latestSequence),
            updatedAt: row.updatedAt,
        }));
    });
}
