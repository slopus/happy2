import { type DrizzleExecutor } from "../drizzle.js";
import { type PresenceSettingsSummary } from "../chat/types.js";
import { gt, inArray, isNull, or, sql } from "drizzle-orm";

import { optionalText } from "../chat/optionalText.js";

import { text } from "../chat/text.js";
import { userPresenceSettings } from "../schema.js";
/**
 * Lists presence settings for unique requested users or the full set, suppressing expired custom status and DND fields in SQL.
 * Ordering by user identifier and projecting effective DND availability gives realtime consumers a deterministic current-state snapshot.
 */
export async function presenceSettingList(
    executor: DrizzleExecutor,
    userIds?: string[],
): Promise<PresenceSettingsSummary[]> {
    const ids = userIds ? [...new Set(userIds)] : undefined;
    if (ids?.length === 0) return [];
    const activeStatus = or(
        isNull(userPresenceSettings.statusExpiresAt),
        gt(sql`datetime(${userPresenceSettings.statusExpiresAt})`, sql`CURRENT_TIMESTAMP`),
    );
    const result = await executor
        .select({
            user_id: userPresenceSettings.userId,
            availability: userPresenceSettings.availability,
            custom_status_text: sql<
                string | null
            >`case when ${activeStatus} then ${userPresenceSettings.customStatusText} end`,
            custom_status_emoji: sql<
                string | null
            >`case when ${activeStatus} then ${userPresenceSettings.customStatusEmoji} end`,
            status_expires_at: sql<
                string | null
            >`case when ${activeStatus} then ${userPresenceSettings.statusExpiresAt} end`,
            dnd_until: sql<
                string | null
            >`case when ${userPresenceSettings.dndUntil} is not null and datetime(${userPresenceSettings.dndUntil}) > CURRENT_TIMESTAMP then ${userPresenceSettings.dndUntil} end`,
            updated_at: userPresenceSettings.updatedAt,
        })
        .from(userPresenceSettings)
        .where(ids ? inArray(userPresenceSettings.userId, ids) : undefined)
        .orderBy(userPresenceSettings.userId);
    return result.map((row) => ({
        userId: text(row.user_id),
        availability:
            optionalText(row.dnd_until) !== undefined
                ? "dnd"
                : (text(row.availability) as PresenceSettingsSummary["availability"]),
        customStatusText: optionalText(row.custom_status_text),
        customStatusEmoji: optionalText(row.custom_status_emoji),
        statusExpiresAt: optionalText(row.status_expires_at),
        dndUntil: optionalText(row.dnd_until),
        updatedAt: text(row.updated_at),
    }));
}
