import { desc, eq } from "drizzle-orm";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { CollaborationError } from "../chat/types.js";
import type { DrizzleExecutor } from "../drizzle.js";
import { documentWriteRequests } from "../schema.js";
import {
    asDocumentWriteRequest,
    documentWriteRequestSelection,
} from "./impl/documentWriteRequestProjection.js";
import type { DocumentWriteRequestSummary } from "./types.js";

/** Lists the 100 newest pending or recent document-write approval cards for one actively joined chat without exposing staged Yjs payloads or mutating durable state. This client projection keeps approval history bounded while requiring the same membership as the chat UI. */
export async function documentWriteRequestList(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatId: string,
): Promise<DocumentWriteRequestSummary[]> {
    if (!(await chatGetAccess(executor, actorUserId, chatId, true)))
        throw new CollaborationError("forbidden", "Chat membership is required");
    const rows = await executor
        .select(documentWriteRequestSelection)
        .from(documentWriteRequests)
        .where(eq(documentWriteRequests.chatId, chatId))
        .orderBy(desc(documentWriteRequests.createdAt), desc(documentWriteRequests.id))
        .limit(100);
    return rows.map(asDocumentWriteRequest);
}
