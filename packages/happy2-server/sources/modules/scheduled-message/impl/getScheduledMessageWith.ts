import { CollaborationError } from "../../chat/types.js";
import { type DrizzleExecutor } from "../../drizzle.js";
import { type ScheduledMessageSummary } from "./scheduledMessageSummary.js";
import { and, asc, eq } from "drizzle-orm";

import { scheduledMessageAttachments, scheduledMessages } from "../../schema.js";

/**
 * Loads an actor-owned scheduled message and its attachment identifiers in their frozen send order.
 * Scoping by creator hides other users' schedules while one projection keeps pending, published, and failed status fields consistent.
 */
export async function getScheduledMessageWith(
    executor: DrizzleExecutor,
    actorUserId: string,
    id: string,
): Promise<ScheduledMessageSummary> {
    const [row] = await executor
        .select()
        .from(scheduledMessages)
        .where(
            and(eq(scheduledMessages.id, id), eq(scheduledMessages.createdByUserId, actorUserId)),
        );
    if (!row) throw new CollaborationError("not_found", "Scheduled message was not found");
    const attachments = await executor
        .select({
            fileId: scheduledMessageAttachments.fileId,
        })
        .from(scheduledMessageAttachments)
        .where(eq(scheduledMessageAttachments.scheduledMessageId, id))
        .orderBy(asc(scheduledMessageAttachments.position));
    return {
        id,
        chatId: row.chatId,
        text: row.text,
        attachmentFileIds: attachments.map(({ fileId }) => fileId),
        scheduledFor: row.scheduledFor,
        timezone: row.timezone ?? undefined,
        status: row.status as ScheduledMessageSummary["status"],
        publishedMessageId: row.publishedMessageId ?? undefined,
        lastError: row.lastError ?? undefined,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}
