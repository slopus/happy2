import { CollaborationError, type MutationHint } from "./types.js";
import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { and, eq, sql } from "drizzle-orm";
import { areaHint } from "./areaHint.js";

import { userChatPreferences } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Rewrites userChatPreferences star positions to match a validated, duplicate-free ordering of the actor's starred chats.
 * Updating the complete personal order under one sync sequence prevents devices from assembling a mixed old and new sidebar order.
 */
export async function chatStarReorder(
    executor: DrizzleExecutor,
    actorUserId: string,
    chatIds: string[],
): Promise<{
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        const starred = await tx
            .select({
                chatId: userChatPreferences.chatId,
            })
            .from(userChatPreferences)
            .where(
                and(
                    eq(userChatPreferences.userId, actorUserId),
                    eq(userChatPreferences.starred, 1),
                ),
            )
            .orderBy(userChatPreferences.sortOrder, userChatPreferences.chatId);
        const current = starred.map((row) => row.chatId).sort();
        const supplied = [...new Set(chatIds)].sort();
        if (
            current.length !== chatIds.length ||
            current.length !== supplied.length ||
            current.some((id, index) => id !== supplied[index])
        )
            throw new CollaborationError(
                "invalid",
                "Order must contain every starred chat exactly once",
            );
        const sequence = await syncSequenceNext(tx);
        for (const [sortOrder, chatId] of chatIds.entries()) {
            await tx
                .update(userChatPreferences)
                .set({
                    sortOrder,
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                })
                .where(
                    and(
                        eq(userChatPreferences.userId, actorUserId),
                        eq(userChatPreferences.chatId, chatId),
                        eq(userChatPreferences.starred, 1),
                    ),
                );
        }
        await syncEventInsert(tx, {
            sequence,
            kind: "preferences.reordered",
            actorUserId,
            targetUserId: actorUserId,
        });
        return {
            hint: areaHint(sequence, "preferences"),
        };
    });
}
