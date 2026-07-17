import { number } from "../../operations/number.js";
import { optionalText } from "../../operations/optionalText.js";
import { text } from "../../operations/text.js";
import { type UserAccessTelemetry } from "../../operations/types.js";
export function asAccess(row: Record<string, unknown>): UserAccessTelemetry {
    return {
        userId: text(row.id),
        username: text(row.username),
        email: text(row.email),
        role: text(row.role) as "member" | "admin",
        lastAccessAt: optionalText(row.last_access_at),
        lastSessionAccessAt: optionalText(row.last_session_access_at),
        activeSessionCount: number(row.active_session_count, 0),
        bannedAt: optionalText(row.banned_at),
        banExpiresAt: optionalText(row.ban_expires_at),
        deletedAt: optionalText(row.deleted_at),
        lastClientIp: optionalText(row.last_client_ip),
        lastDevice: optionalText(row.last_device),
        lastAppVersion: optionalText(row.last_app_version),
        lastUserAgent: optionalText(row.last_user_agent),
    };
}
