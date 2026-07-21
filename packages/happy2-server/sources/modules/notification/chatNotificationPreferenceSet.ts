import {
    type ChatSummary,
    CollaborationError,
    type MutationHint,
    type NotificationLevel,
} from "../chat/types.js";

import { type DrizzleExecutor, withTransaction } from "../drizzle.js";

import { areaHint } from "../chat/areaHint.js";
import { sql } from "drizzle-orm";
import { userChatPreferences } from "../schema.js";
import { chatGetAccess } from "../chat/chatGetAccess.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";

/**
 * Upserts the actor's per-chat notification mode in userChatPreferences after confirming the chat remains accessible.
 * The personal sync sequence makes mute or mention-only behavior converge across devices before future badges are interpreted.
 */
export async function chatNotificationPreferenceSet(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        chatId: string;
        notificationLevel?: NotificationLevel;
        mutedUntil?: string | null;
        showMessagePreviews?: boolean;
    },
): Promise<{
    chat: ChatSummary;
    hint: MutationHint;
}> {
    return withTransaction(executor, async (tx) => {
        if (!(await chatGetAccess(tx, input.actorUserId, input.chatId, false)))
            throw new CollaborationError("not_found", "Chat was not found");
        const sequence = await syncSequenceNext(tx);
        await tx
            .insert(userChatPreferences)
            .values({
                userId: input.actorUserId,
                chatId: input.chatId,
                notificationLevel: input.notificationLevel ?? "all",
                mutedUntil: input.mutedUntil ?? null,
                showMessagePreviews: input.showMessagePreviews === false ? 0 : 1,
                syncSequence: sequence,
            })
            .onConflictDoUpdate({
                target: [userChatPreferences.userId, userChatPreferences.chatId],
                set: {
                    ...(input.notificationLevel === undefined
                        ? {}
                        : {
                              notificationLevel: input.notificationLevel,
                          }),
                    ...(input.mutedUntil === undefined
                        ? {}
                        : {
                              mutedUntil: input.mutedUntil,
                          }),
                    ...(input.showMessagePreviews === undefined
                        ? {}
                        : {
                              showMessagePreviews: input.showMessagePreviews ? 1 : 0,
                          }),
                    syncSequence: sequence,
                    updatedAt: sql`CURRENT_TIMESTAMP`,
                },
            });
        await syncEventInsert(tx, {
            sequence,
            kind: "preferences.notificationsChanged",
            entityId: input.chatId,
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        const chat = await chatGetAccess(tx, input.actorUserId, input.chatId, false);
        if (!chat) throw new Error("Preference chat became inaccessible");
        return {
            chat,
            hint: areaHint(sequence, "preferences"),
        };
    });
}
