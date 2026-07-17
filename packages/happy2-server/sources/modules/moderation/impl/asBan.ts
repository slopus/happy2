import { type AccountBan } from "../../operations/types.js";
import { optionalText } from "../../operations/optionalText.js";
import { text } from "../../operations/text.js";
export function asBan(row: Record<string, unknown>): AccountBan {
    const revokedAt = optionalText(row.revoked_at);
    const expiresAt = optionalText(row.expires_at);
    return {
        id: text(row.id),
        accountId: text(row.account_id),
        userId: optionalText(row.user_id),
        username: optionalText(row.username),
        bannedByUserId: optionalText(row.banned_by_user_id),
        reason: optionalText(row.reason),
        bannedAt: text(row.banned_at),
        expiresAt,
        revokedAt,
        revokedByUserId: optionalText(row.revoked_by_user_id),
        revokeReason: optionalText(row.revoke_reason),
        status: revokedAt
            ? "revoked"
            : expiresAt && Date.parse(expiresAt) <= Date.now()
              ? "expired"
              : "active",
    };
}
