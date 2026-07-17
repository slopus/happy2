import { type DrizzleExecutor } from "../drizzle.js";
import { type ScheduledMessageSummary } from "./impl/scheduledMessageSummary.js";
import { asc, eq } from "drizzle-orm";

import { scheduledMessages } from "../schema.js";
import { getScheduledMessageWith } from "./impl/getScheduledMessageWith.js";
/**
 * Lists all messages created by the actor in scheduled delivery order and expands each with its frozen attachments and terminal state.
 * Creator scoping and deterministic ordering provide a private outbox without exposing another user's queued content.
 */
export async function scheduledMessageList(
    executor: DrizzleExecutor,
    actorUserId: string,
): Promise<ScheduledMessageSummary[]> {
    const rows = await executor
        .select({
            id: scheduledMessages.id,
        })
        .from(scheduledMessages)
        .where(eq(scheduledMessages.createdByUserId, actorUserId))
        .orderBy(asc(scheduledMessages.scheduledFor), asc(scheduledMessages.id));
    const messages: ScheduledMessageSummary[] = [];
    for (const row of rows)
        messages.push(await getScheduledMessageWith(executor, actorUserId, row.id));
    return messages;
}
