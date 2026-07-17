import { type DrizzleExecutor } from "../drizzle.js";
import { and, eq, gt, isNull, or, sql } from "drizzle-orm";

import { moderationActions } from "../schema.js";

/**
 * Reports an active, unrevoked posting restriction targeting the user either server-wide or in the requested chat.
 * Ignoring expired actions lets message guards apply moderation immediately without requiring a cleanup job to remove historical records first.
 */
export async function chatIsPostingRestricted(
    executor: DrizzleExecutor,
    userId: string,
    chatId: string,
): Promise<boolean> {
    const [row] = await executor
        .select({
            id: moderationActions.id,
        })
        .from(moderationActions)
        .where(
            and(
                eq(moderationActions.action, "restrict"),
                eq(moderationActions.targetUserId, userId),
                isNull(moderationActions.revokedAt),
                or(isNull(moderationActions.chatId), eq(moderationActions.chatId, chatId)),
                or(
                    isNull(moderationActions.expiresAt),
                    gt(moderationActions.expiresAt, sql`CURRENT_TIMESTAMP`),
                ),
            ),
        )
        .limit(1);
    return Boolean(row);
}
