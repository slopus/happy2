import { and, eq } from "drizzle-orm";
import { CollaborationError } from "../../chat/types.js";
import type { DrizzleExecutor } from "../../drizzle.js";
import { documentChannelAttachments, documents } from "../../schema.js";
import type { DocumentRow } from "./documentRowGet.js";

export async function documentAttachedRowGet(
    executor: DrizzleExecutor,
    chatId: string,
    documentId: string,
): Promise<DocumentRow> {
    const [row] = await executor
        .select({ document: documents })
        .from(documentChannelAttachments)
        .innerJoin(documents, eq(documents.id, documentChannelAttachments.documentId))
        .where(
            and(
                eq(documentChannelAttachments.chatId, chatId),
                eq(documentChannelAttachments.documentId, documentId),
            ),
        )
        .limit(1);
    if (!row) throw new CollaborationError("not_found", "Document was not found");
    return row.document;
}
