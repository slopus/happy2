import { type DrizzleExecutor, withTransaction } from "../drizzle.js";
import { type MutationHint } from "../chat/types.js";

import { areaHint } from "../chat/areaHint.js";
import { eq, sql } from "drizzle-orm";

import { userNotificationPreferences } from "../schema.js";
import { syncEventInsert } from "../sync/syncEventInsert.js";
import { syncSequenceNext } from "../sync/syncSequenceNext.js";
import { notificationPreferenceGet } from "./notificationPreferenceGet.js";
import { userRequireActive } from "../chat/userRequireActive.js";

/**
 * Upserts the active user's global notification channels and delivery choices in userNotificationPreferences.
 * Synchronizing the complete preference projection as one personal change keeps email, desktop, and push decisions consistent across clients.
 */
export async function notificationPreferenceUpdate(
    executor: DrizzleExecutor,
    input: {
        actorUserId: string;
        directMessages?: "all" | "none";
        mentions?: "all" | "none";
        reactions?: "all" | "none";
        calls?: "all" | "none";
        emailNotifications?: boolean;
        desktopNotifications?: boolean;
        dndStartMinutes?: number | null;
        dndEndMinutes?: number | null;
        timezone?: string | null;
    },
): Promise<{
    preferences: Awaited<ReturnType<typeof notificationPreferenceGet>>;
    hint: MutationHint;
}> {
    const sequence = await withTransaction(executor, async (tx) => {
        await userRequireActive(tx, input.actorUserId);
        const syncSequence = await syncSequenceNext(tx);
        await tx
            .insert(userNotificationPreferences)
            .values({
                userId: input.actorUserId,
                syncSequence,
            })
            .onConflictDoNothing();
        await tx
            .update(userNotificationPreferences)
            .set({
                ...(input.directMessages === undefined
                    ? {}
                    : {
                          directMessages: input.directMessages,
                      }),
                ...(input.mentions === undefined
                    ? {}
                    : {
                          mentions: input.mentions,
                      }),
                ...(input.reactions === undefined
                    ? {}
                    : {
                          reactions: input.reactions,
                      }),
                ...(input.calls === undefined
                    ? {}
                    : {
                          calls: input.calls,
                      }),
                ...(input.emailNotifications === undefined
                    ? {}
                    : {
                          emailNotifications: input.emailNotifications ? 1 : 0,
                      }),
                ...(input.desktopNotifications === undefined
                    ? {}
                    : {
                          desktopNotifications: input.desktopNotifications ? 1 : 0,
                      }),
                ...(input.dndStartMinutes === undefined
                    ? {}
                    : {
                          dndStartMinutes: input.dndStartMinutes,
                      }),
                ...(input.dndEndMinutes === undefined
                    ? {}
                    : {
                          dndEndMinutes: input.dndEndMinutes,
                      }),
                ...(input.timezone === undefined
                    ? {}
                    : {
                          timezone: input.timezone,
                      }),
                syncSequence,
                updatedAt: sql`CURRENT_TIMESTAMP`,
            })
            .where(eq(userNotificationPreferences.userId, input.actorUserId));
        await syncEventInsert(tx, {
            sequence: syncSequence,
            kind: "preferences.globalNotificationsChanged",
            actorUserId: input.actorUserId,
            targetUserId: input.actorUserId,
        });
        return syncSequence;
    });
    return {
        preferences: await notificationPreferenceGet(executor, input.actorUserId),
        hint: areaHint(sequence, "preferences"),
    };
}
