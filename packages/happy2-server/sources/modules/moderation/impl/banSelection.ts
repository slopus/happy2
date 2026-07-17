import { accountBans, users } from "../../schema.js";

export const banSelection = {
    id: accountBans.id,
    account_id: accountBans.accountId,
    user_id: users.id,
    username: users.username,
    banned_by_user_id: accountBans.bannedByUserId,
    reason: accountBans.reason,
    banned_at: accountBans.bannedAt,
    expires_at: accountBans.expiresAt,
    revoked_at: accountBans.revokedAt,
    revoked_by_user_id: accountBans.revokedByUserId,
    revoke_reason: accountBans.revokeReason,
};
