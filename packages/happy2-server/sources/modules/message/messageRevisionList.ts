import { CollaborationError } from "../chat/types.js";
import { type DrizzleExecutor } from "../drizzle.js";
import { desc, eq } from "drizzle-orm";

import { messageRevisions } from "../schema.js";
import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";
import { text } from "../chat/text.js";
import { messageGetProjection } from "./messageGetProjection.js";
/**
 * Lists prior revisions newest first only when the requesting user can still view the non-deleted message.
 * Authorizing through the current message projection prevents retained edit history from exposing content after chat access or message visibility changes.
 */
export async function messageRevisionList(
    executor: DrizzleExecutor,
    userId: string,
    messageId: string,
): Promise<
    Array<{
        revision: number;
        text: string;
        editedByUserId?: string;
        editReason?: string;
        createdAt: string;
    }>
> {
    const message = await messageGetProjection(executor, userId, messageId);
    if (!message || message.deletedAt)
        throw new CollaborationError("not_found", "Message was not found");
    const result = await executor
        .select({
            revision: messageRevisions.revision,
            text: messageRevisions.text,
            edited_by_user_id: messageRevisions.editedByUserId,
            edit_reason: messageRevisions.editReason,
            created_at: messageRevisions.createdAt,
        })
        .from(messageRevisions)
        .where(eq(messageRevisions.messageId, messageId))
        .orderBy(desc(messageRevisions.revision));
    return result.map((row) => ({
        revision: number(row.revision),
        text: text(row.text),
        editedByUserId: optionalText(row.edited_by_user_id),
        editReason: optionalText(row.edit_reason),
        createdAt: text(row.created_at),
    }));
}
