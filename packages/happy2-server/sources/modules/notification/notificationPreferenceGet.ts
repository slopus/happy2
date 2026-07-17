import { type DrizzleExecutor } from "../drizzle.js";
import { type NotificationLevel } from "../chat/types.js";
import { eq } from "drizzle-orm";
import { number } from "../chat/number.js";
import { optionalText } from "../chat/optionalText.js";
import { text } from "../chat/text.js";
import { userNotificationPreferences } from "../schema.js";
import { userRequireActive } from "../chat/userRequireActive.js";
/**
 * Returns an active user's notification levels, delivery switches, quiet hours, and timezone with product defaults when no row exists.
 * Applying defaults at this boundary keeps message delivery and settings clients consistent before the user customizes any preference.
 */
export async function notificationPreferenceGet(
    executor: DrizzleExecutor,
    userId: string,
): Promise<{
    directMessages: "all" | "none";
    mentions: "all" | "none";
    threadReplies: NotificationLevel;
    reactions: "all" | "none";
    calls: "all" | "none";
    emailNotifications: boolean;
    desktopNotifications: boolean;
    dndStartMinutes?: number;
    dndEndMinutes?: number;
    timezone?: string;
}> {
    await userRequireActive(executor, userId);
    const [row] = await executor
        .select({
            direct_messages: userNotificationPreferences.directMessages,
            mentions: userNotificationPreferences.mentions,
            thread_replies: userNotificationPreferences.threadReplies,
            reactions: userNotificationPreferences.reactions,
            calls: userNotificationPreferences.calls,
            email_notifications: userNotificationPreferences.emailNotifications,
            desktop_notifications: userNotificationPreferences.desktopNotifications,
            dnd_start_minutes: userNotificationPreferences.dndStartMinutes,
            dnd_end_minutes: userNotificationPreferences.dndEndMinutes,
            timezone: userNotificationPreferences.timezone,
        })
        .from(userNotificationPreferences)
        .where(eq(userNotificationPreferences.userId, userId))
        .limit(1);
    return {
        directMessages: text(row?.direct_messages, "all") as "all" | "none",
        mentions: text(row?.mentions, "all") as "all" | "none",
        threadReplies: text(row?.thread_replies, "all") as NotificationLevel,
        reactions: text(row?.reactions, "all") as "all" | "none",
        calls: text(row?.calls, "all") as "all" | "none",
        emailNotifications: number(row?.email_notifications, 0) === 1,
        desktopNotifications: number(row?.desktop_notifications, 1) === 1,
        dndStartMinutes:
            row?.dnd_start_minutes === null || row?.dnd_start_minutes === undefined
                ? undefined
                : number(row.dnd_start_minutes),
        dndEndMinutes:
            row?.dnd_end_minutes === null || row?.dnd_end_minutes === undefined
                ? undefined
                : number(row.dnd_end_minutes),
        timezone: optionalText(row?.timezone),
    };
}
