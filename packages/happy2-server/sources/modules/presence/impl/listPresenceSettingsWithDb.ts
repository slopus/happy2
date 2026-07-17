import { type DrizzleExecutor } from "../../drizzle.js";
import { type PresenceSettingsSummary } from "../../chat/types.js";
import { inArray } from "drizzle-orm";
import { messageIsPast } from "../../message/messageIsPast.js";
import { userPresenceSettings } from "../../schema.js";
/**
 * Projects presence settings for the requested user identifiers, hiding expired custom statuses and promoting an active DND deadline to availability.
 * Normalizing time-sensitive fields here gives mutation responses the same effective presence semantics as list reads.
 */
export async function listPresenceSettingsWithDb(
    executor: DrizzleExecutor,
    userIds: string[],
): Promise<PresenceSettingsSummary[]> {
    if (!userIds.length) return [];
    const rows = await executor
        .select({
            userId: userPresenceSettings.userId,
            availability: userPresenceSettings.availability,
            customStatusText: userPresenceSettings.customStatusText,
            customStatusEmoji: userPresenceSettings.customStatusEmoji,
            statusExpiresAt: userPresenceSettings.statusExpiresAt,
            dndUntil: userPresenceSettings.dndUntil,
            updatedAt: userPresenceSettings.updatedAt,
        })
        .from(userPresenceSettings)
        .where(inArray(userPresenceSettings.userId, userIds));
    return rows.map((row) => {
        const statusActive = !row.statusExpiresAt || !messageIsPast(row.statusExpiresAt);
        const dndActive = !!row.dndUntil && !messageIsPast(row.dndUntil);
        return {
            userId: row.userId,
            availability: dndActive
                ? "dnd"
                : (row.availability as PresenceSettingsSummary["availability"]),
            customStatusText: statusActive ? (row.customStatusText ?? undefined) : undefined,
            customStatusEmoji: statusActive ? (row.customStatusEmoji ?? undefined) : undefined,
            statusExpiresAt: statusActive ? (row.statusExpiresAt ?? undefined) : undefined,
            dndUntil: dndActive ? (row.dndUntil ?? undefined) : undefined,
            updatedAt: row.updatedAt,
        };
    });
}
