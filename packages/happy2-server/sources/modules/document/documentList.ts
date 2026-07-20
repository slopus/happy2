import { and, desc, eq, exists, isNull, or } from "drizzle-orm";
import { type DrizzleExecutor } from "../drizzle.js";
import { chatMembers, documentChannelAttachments, documents } from "../schema.js";
import { documentSummariesGet } from "./impl/documentSummaryGet.js";
import { type DocumentSummary } from "./types.js";

/**
 * Lists every document visible to the actor, newest activity first, without reading
 * content: documents they own plus documents attached to any channel where they are a member.
 * Each summary exposes all attachments to the owner and only caller-visible attachments
 * to channel members, preserving `not_found`-equivalent non-probeability across channels.
 * This read-only global collection boundary exists independently of any one channel.
 */
export async function documentList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<DocumentSummary[]> {
    const attachedVisibility = exists(
        executor
            .select({ chatId: documentChannelAttachments.chatId })
            .from(documentChannelAttachments)
            .innerJoin(
                chatMembers,
                and(
                    eq(chatMembers.chatId, documentChannelAttachments.chatId),
                    eq(chatMembers.userId, actorUserId),
                    isNull(chatMembers.leftAt),
                ),
            )
            .where(eq(documentChannelAttachments.documentId, documents.id)),
    );
    const rows = await executor
        .select()
        .from(documents)
        .where(or(eq(documents.ownerUserId, actorUserId), attachedVisibility))
        .orderBy(desc(documents.updatedAt), desc(documents.id));
    return (await documentSummariesGet(executor, actorUserId, rows)).filter(
        (summary) => summary.ownerUserId === actorUserId || summary.channelAttachments.length > 0,
    );
}
